// Babylon.js named imports
import {
	AbstractMesh,
	Animation,
	ArcRotateCamera,
	Camera,
	ChromaticAberrationPostProcess,
	CircleEase,
	Color3,
	Color4,
	CubeTexture,
	DefaultRenderingPipeline,
	EasingFunction,
	Engine,
	FreeCamera,
	HardwareScalingOptimization,
	HemisphericLight,
	HighlightLayer,
	Material,
	Mesh,
	MeshBuilder,
	Node,
	ParticleSystem,
	PBRMaterial,
	PBRMetallicRoughnessMaterial,
	PointerEventTypes,
	PointLight,
	QuinticEase,
	RenderTargetsOptimization,
	Scene,
	SceneOptimizer,
	SceneOptimizerOptions,
	SineEase,
	StandardMaterial,
	Texture,
	TextureOptimization,
	TransformNode,
	Vector2,
	Vector3,
	Viewport,
	VolumetricLightScatteringPostProcess,
	Animatable,
} from "@babylonjs/core";

import {
	AdvancedDynamicTexture,
	Button,
	Control,
	MultiLine,
	Rectangle,
	TextBlock,
} from "@babylonjs/gui";

import * as MathUtils from './Utils/Math';

// Babylon.js full imports
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders";
import "@babylonjs/core/Materials/Textures/Loaders";

// Other imports
import "./polyfills";
import { FurMaterial } from "@babylonjs/materials";

interface SolarBodyConfig {
	type: PlanetMeta['type'];
	inspectorName: string;
	friendlyName: string;
	baseConfig: {diameter: number, segments: number};
	lodConfig?: {
		useLODScreenCoverage?: boolean;
		levels: {level: number, segments: number}[];
	};
	material: Material;
	parent?: null | Node;
	layerMask?: number;
	postCreateCb?: (meshes: {main: Mesh, lods: Mesh[]}, solarBodyConfig: SolarBodyConfig) => void;
}

interface PlanetMeta {
	mesh: AbstractMesh;
	type: 'star' | 'planet';
	name: string;
}

interface PlanetLabelOpts {
	fontSize: number;
	rect1Width: number;
	rect1Height: number;
	linkOffsetY: number;
	opacityDistanceControl: { start: number; end: number; };
	sizeDistanceControl: { start: number; end: number; };
}

const defaultPlanetLabelOpts: PlanetLabelOpts = {
	fontSize: 24,
	rect1Width: 140,
	rect1Height: 40,
	linkOffsetY: 170,
	opacityDistanceControl: { start: 40, end: 60 },
	sizeDistanceControl: { start: 0, end: 80 },
};

export class Renderer {
	
	engine: Engine;
	
	// Properties we are exposing for HMR
	defaultCamera: null | ArcRotateCamera = null;
	exploreCamera: null | ArcRotateCamera = null;
	useOrthographicExploreCamera: boolean = false;
	exploreCameraViewport = {
		x: 0,
		y: 0,
		w: 0,
		h: 0,
	};
	solarSystemTransformNode: null | TransformNode = null;
	
	// Properties to persist on this instance
	solarBodies: PlanetMeta[] = [];
	sunLight: null | PointLight = null;
	renderingPipeline: null | DefaultRenderingPipeline = null;
	
	// God ray properties
	hemiLight1: null | HemisphericLight = null;
	hemiLight2: null | HemisphericLight = null;
	godRays: null | VolumetricLightScatteringPostProcess = null;
	
	initialDeviceRatio: number = 1 / window.devicePixelRatio;
	currentlyFocusedPlanet: null | PlanetMeta = null;
	
	onTickCallbacks: ((delta: number, animationRatio: number) => void)[] = [];
	
	constructor(public canvasEl: HTMLCanvasElement) {
		
		this.engine = new Engine(canvasEl, true, {stencil: true}, false);
		this.engine.setHardwareScalingLevel(this.initialDeviceRatio);
		this.engine.enableOfflineSupport = false;
		
		const scene = new Scene(this.engine);
		scene.clearColor = Color3.Gray().scale(0.5).toColor4();
		
		this.initScene(this.engine, scene);
		
		// Start render loop
		this.engine.runRenderLoop(() => {
			// Get numbers
			const delta = this.engine.getDeltaTime();
			const animationRatio = scene.getAnimationRatio();
			
			// Run callbacks
			this.onTickCallbacks.forEach(onTickCallback => onTickCallback(delta, animationRatio));
			
			// Render the scene
			scene.render();
		});
		
		// Handle window resize events
		window.addEventListener('resize', () => this.engine.resize());
		
	}
	
	initScene(engine: Engine, scene: Scene) {
		
		// Create default camera
		const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 5, new Vector3(0, 100, 0), scene);
		this.defaultCamera = camera;
		// Bind mouse events on the canvas to be associated with this camera
		camera.attachControl(engine._workingCanvas, true);
		camera.lowerRadiusLimit = 3;
		camera.upperRadiusLimit = 400;
		camera.viewport = new Viewport(0, 0, 1, 1);
		camera.layerMask = 0x30000000;  // Set layer mask so that it can see 0x10000000 and 0x20000000 objects
		
		// Enable camera collisions
		const cameraCollisionRadius = 2.0;
		camera.collisionRadius = new Vector3(cameraCollisionRadius, cameraCollisionRadius, cameraCollisionRadius);
		camera.checkCollisions = true;
		
		// Explore camera
		const exploreCamera = new ArcRotateCamera("exploreCamera", Math.PI * 1.5, Math.PI / 2, 3.4641, Vector3.Zero(), scene);
		this.exploreCamera = exploreCamera;
		
		// Manually set up rotation on explore camera. There is a autoRotate behavior but it doesn't work as expected with multiple cameras.
		this.onTickCallbacks.push((_delta, animationRatio) => exploreCamera.alpha -= animationRatio * 0.002);
		
		if (this.useOrthographicExploreCamera) {
			exploreCamera.mode = Camera.ORTHOGRAPHIC_CAMERA;
			const orthoScale = 3;
			exploreCamera.orthoLeft = -orthoScale;
			exploreCamera.orthoTop = -orthoScale;
			exploreCamera.orthoRight = orthoScale;
			exploreCamera.orthoBottom = orthoScale;
		}
		
		// We want to preserve the square PIP look so we'll use the main camera's aspect ratio to adjust the sizes accordingly
		// Aspect ratio < 1 = Portrait, > 1 = Landscape
		let ar = engine.getAspectRatio(camera);
		let pipW = (ar < 1) ? 0.3 : 0.3 * (1/ar);
		let pipH = (ar < 1) ? 0.3 * ar : 0.3;
		let pipX = 0; // 1 - pipW;
		let pipY = 1 - pipH;
		this.exploreCameraViewport = {
			x: pipX,
			y: pipY,
			w: pipW,
			h: pipH,
		};
		exploreCamera.viewport = new Viewport(pipX, pipY, pipW, pipH);
		exploreCamera.layerMask = 0x10000000; // Set layer mask to only see 0x10000000 objects
		
		// Add cameras to active camera list.  
		// Each camera MUST be in the active camera list to be displayed with its defined viewport
		if (scene.activeCameras) {
			scene.activeCameras.push(camera);
			scene.activeCameras.push(exploreCamera);
		}
		
		// Initially do not check collisions while scene is initializing
		scene.collisionsEnabled = false;
		setImmediate(() => scene.collisionsEnabled = true);
		
		// HDR environment texture
		const hdrEnvironmentTextureUrl = (new URL("../assets/skybox/skybox_equirectangular-32.env", import.meta.url));
		const hdrEnvironmentTexture = CubeTexture.CreateFromPrefilteredData(hdrEnvironmentTextureUrl.pathname, scene);
		// hdrEnvironmentTexture.level = 2;
		scene.environmentTexture = hdrEnvironmentTexture;
		scene.environmentIntensity = 0.75;
		
		// Solar system transform node for local positioning
		const solarSystemTransformNode = new TransformNode('solarSystem', scene);
		this.solarSystemTransformNode = solarSystemTransformNode;
		
		// Add light (sun)
		const sunLight = new PointLight("pointLight", Vector3.Zero(), scene);
		sunLight.intensity = 50000;
		sunLight.diffuse = Color3.FromHexString('#9271D1'); // #FFD8A3
		sunLight.parent = solarSystemTransformNode;
		this.sunLight = sunLight;
		
		const hemiLight1 = new HemisphericLight("hemiLight1", new Vector3(0, -1, 0), scene);
		hemiLight1.diffuse = Color3.FromHexString("#F96229");
		hemiLight1.specular = Color3.FromHexString("#FCE13D");
		hemiLight1.intensity = 10;
		const hemiLight2 = new HemisphericLight("hemiLight2", new Vector3(0, 1, 0), scene);
		hemiLight2.diffuse = Color3.FromHexString("#F96229");
		hemiLight2.specular = Color3.FromHexString("#FCE13D");
		hemiLight2.intensity = 10;
		this.hemiLight1 = hemiLight1;
		this.hemiLight2 = hemiLight2;
		
		// Skybox
		const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene);
		skybox.infiniteDistance = true;
		skybox.isPickable = false;
		skybox.renderingGroupId = 0;
		skybox.layerMask = 0x10000000;
		
		const skyboxHdrConvertedEnvUrl = new URL('../assets/skybox/skybox_equirectangular-32.env', import.meta.url);
		const skyboxCubeTexture = CubeTexture.CreateFromPrefilteredData(skyboxHdrConvertedEnvUrl.pathname, scene);
		skyboxCubeTexture.level = 0.6;
		skyboxCubeTexture.coordinatesMode = Texture.SKYBOX_MODE;
		
		const skyboxMaterial = new StandardMaterial("skyBoxMat", scene);
		skyboxMaterial.backFaceCulling = false;
		skyboxMaterial.reflectionTexture = skyboxCubeTexture;
		skyboxMaterial.disableLighting = true;
		
		skybox.material = skyboxMaterial;
		
		// Other stuff
		this.initPost(scene, [camera, exploreCamera]);
		this.initPlanets(scene, camera, solarSystemTransformNode);
		this.initGuiWip();
		this.initParticles(scene);
		this.registerGalaxyScaling(camera, solarSystemTransformNode);
		this.registerPlanetOrbitRotation();
		this.autoOptimizeScene(scene, camera);
		this.initJumpToCameraPosition(scene, camera, exploreCamera, solarSystemTransformNode, 1);
		
		// Set up collisions on meshes
		this.solarBodies.forEach(solarBody => solarBody.mesh.checkCollisions = true);
		
		// Parent the cameras
		const firstPlanetMeta = this.solarBodies.filter(solarBody => solarBody.type === 'planet')[0];
		this.currentlyFocusedPlanet = firstPlanetMeta;
		exploreCamera.parent = firstPlanetMeta.mesh;
		// camera.parent = firstPlanetMeta.mesh;
		// camera.target = Vector3.Zero();
		
		this.onTickCallbacks.push(() => {
			
			// Null safe check
			if (!this.currentlyFocusedPlanet) {
				return;
			}
			
			// Check for galaxy mode
			if (!solarSystemTransformNode.scaling.equalsWithEpsilon(Vector3.One(), 0.01)) {
				// Galaxy mode
				return;
			}
			
			camera.target = this.currentlyFocusedPlanet.mesh.absolutePosition;
			
			if (solarSystemTransformNode.scaling.equalsWithEpsilon(Vector3.One(), 0.01)) {
				solarSystemTransformNode.setPivotPoint(camera.target);
			}
		});
		
		// Show inspector on dev
		if (process.env.NODE_ENV === 'development') {
			scene.debugLayer.show({
				overlay: true,
				showExplorer: true,
				showInspector: true,
				embedMode: true,
				handleResize: true,
			});
		}
		
	}
	
	initPost(scene: Scene, cameras: [Camera, ...Camera[]]) {
		const defaultPipe = new DefaultRenderingPipeline('Default Pipeline', true, scene, cameras);
		this.renderingPipeline = defaultPipe;
		
		defaultPipe.fxaaEnabled = true;
		
		defaultPipe.imageProcessing.toneMappingEnabled = true;
		defaultPipe.imageProcessing.toneMappingType = 1;
		
		defaultPipe.imageProcessing.vignetteEnabled = true;
		defaultPipe.imageProcessing.vignetteWeight = 1.5;
		defaultPipe.imageProcessing.vignetteCameraFov = 0.6;
		
		defaultPipe.bloomEnabled = true;
		defaultPipe.bloomThreshold = 0.5;
		defaultPipe.bloomWeight = 0.7;
		defaultPipe.bloomKernel = 64;
		defaultPipe.bloomScale = 0.5;
		
		defaultPipe.chromaticAberrationEnabled = true;
		defaultPipe.chromaticAberration.aberrationAmount = 30;
		defaultPipe.chromaticAberration.radialIntensity = 0.8;
		
		defaultPipe.glowLayerEnabled = true;
		if (defaultPipe.glowLayer) {
			defaultPipe.glowLayer.blurKernelSize = 96;
			defaultPipe.glowLayer.intensity = 0.5;
		}
	}
	
	initPlanets(scene: Scene, camera: ArcRotateCamera, solarSystemTransformNode: TransformNode) {
		
		const highlightLayer = new HighlightLayer("hl1", scene);
		
		/** Disable upfront for potato devices. Note: this is automatically optimized away otherwise */
		const useGodRays: boolean = true;
		
		/** Powerful GPUs can handle a larger sample size. High end mobile can do like 20 max. */
		const godRaySampleSize: number = 200;
		
		const solarBodyConfigs: SolarBodyConfig[] = [
			{
				type: 'star',
				inspectorName: 'sun',
				friendlyName: 'Sun',
				baseConfig: {diameter: 40, segments: 32},
				lodConfig: useGodRays ? undefined : {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				layerMask: 0x20000000,
				material: (() => {
					// const mat = new StandardMaterial('tempMat', scene);
					// mat.emissiveColor = Color3.FromHexString('#FFF8EE');
					// mat.disableLighting = true; // This is fully emissive so no need for lighting
					
					const domeTextureUrl = 'https://images.pexels.com/photos/2832382/pexels-photo-2832382.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2';
					const domeTexture = new Texture(domeTextureUrl, scene);
					
					let mat = new StandardMaterial("godRaySunMat", scene);
					mat.diffuseColor = mat.emissiveColor = new Color3(1, 1 ,1);
					mat.diffuseTexture = mat.emissiveTexture = domeTexture;
					mat.specularColor = new Color3(0, 0.01, 0);
					mat.backFaceCulling = false;
					
					if (!useGodRays) {
						// Boost levels
						domeTexture.level = 10;
					}
					else {
						domeTexture.level = 1.4;
					}
					
					return mat;
				})(),
				parent: this.sunLight,
				postCreateCb: meshes => {
					const allMeshes = [meshes.main, ...meshes.lods];
					
					this.hemiLight1 && (this.hemiLight1.includedOnlyMeshes = allMeshes);
					this.hemiLight2 && (this.hemiLight2.includedOnlyMeshes = allMeshes);
					
					allMeshes.forEach(mesh => highlightLayer.addMesh(mesh, Color3.Blue().scale(0.3)));
					
					// TODO: Set up occlusion queries
					// [meshes.main].forEach(mesh => {
					// 	mesh.occlusionQueryAlgorithmType = AbstractMesh.OCCLUSION_ALGORITHM_TYPE_CONSERVATIVE;
					// 	mesh.occlusionType = AbstractMesh.OCCLUSION_TYPE_STRICT;
					// });
					// this.onTickCallbacks.push(() => this.renderingPipeline && (this.renderingPipeline.imageProcessing.exposure = meshes.main.isOccluded ? 1 : 0.3));
					
					if (useGodRays) {
						allMeshes.forEach(mesh => {
							
							if (this.defaultCamera) {
								const godRays = new VolumetricLightScatteringPostProcess('GodRays', 1.0, camera, mesh, godRaySampleSize, Texture.BILINEAR_SAMPLINGMODE, this.engine, false, scene);
								this.godRays = godRays;
								
								godRays.exposure = 0.5;
								godRays.decay = 0.98115;
								godRays.weight = 0.98767;
								godRays.density = 0.996;
								
								// console.log('Material:', godRays.mesh.material);
								
								// if (godRays.mesh.material) {
								// 	const mat = godRays.mesh.material as StandardMaterial;
									
								// 	mat.diffuseTexture = new Texture(DOME_TEXTURE, scene);
								// 	mat.diffuseTexture.hasAlpha = true;
								// }
								
							}
						});
					}
				},
			},
			{
				type: 'planet',
				inspectorName: 'planet1',
				friendlyName: 'Penuaturn', // https://www.fantasynamegenerators.com/planet_names.php
				baseConfig: {diameter: 2, segments: 26},
				lodConfig: {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				material: (() => {
					const mat = new PBRMaterial('tempMat', scene);
					
					// Textures grabbed from https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds and modified as needed
					// Other ways to generate online are listed here https://blender.stackexchange.com/questions/31424/planet-texture-generator
					const planet3Textures = {
						diffuse: new Texture((new URL('../assets/generated_planets/planet2_ertaale/ertaale_ast_2006036_lrg_blue.jpg?as=webp', import.meta.url)).pathname, scene),
						normal: new Texture((new URL('../assets/generated_planets/planet2_ertaale/NormalMap-Low.png?as=webp', import.meta.url)).pathname, scene),
					};
					planet3Textures.normal.level = 1.6;
					mat.albedoTexture = planet3Textures.diffuse;
					mat.bumpTexture = planet3Textures.normal;
					mat.metallic = 0.0; // Set these to 1.0 to use metallic & roughness from texture
					mat.roughness = 1.0;
					// mat.directIntensity = 2;
					mat.specularIntensity = 0.27;
					
					return mat;
				})(),
				parent: solarSystemTransformNode,
				postCreateCb: meshes => {
					const allMeshes = [meshes.main, ...meshes.lods];
					meshes.main.position.addInPlace(new Vector3(50, 50, -10));
					meshes.main.rotation.addInPlace(new Vector3(0, Math.PI * 0.12, Math.PI * 0.06));
					allMeshes.forEach(mesh => highlightLayer.addMesh(mesh, new Color3(0.2, 0.4, 1).scale(0.3)));
				},
			},
			{
				type: 'planet',
				inspectorName: 'planet2',
				friendlyName: 'Unradus',
				baseConfig: {diameter: 1.5, segments: 26},
				lodConfig: {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				material: (() => {
					const mat = new PBRMetallicRoughnessMaterial('tempMat', scene);
					mat.metallic = 0.5;
					mat.roughness = 0.3;
					mat.baseColor = Color3.Teal();
					const normal = new Texture((new URL('../assets/generated_planets/planet2_ertaale/NormalMap-Low.png?as=webp', import.meta.url)).pathname, scene);
					normal.level = 0.25;
					mat.normalTexture = normal;
					return mat;
				})(),
				parent: solarSystemTransformNode,
				postCreateCb: meshes => {
					const allMeshes = [meshes.main, ...meshes.lods];
					meshes.main.position.addInPlace(new Vector3(200, 0, 0));
					allMeshes.forEach(mesh => highlightLayer.addMesh(mesh, new Color3(0.2, 0.4, 1).scale(1)));
				},
			},
			{
				type: 'planet',
				inspectorName: 'planet3',
				friendlyName: 'Lyke GS',
				baseConfig: {diameter: 3.5, segments: 26},
				lodConfig: {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				material: (() => {
					const mat = new PBRMaterial('tempMat', scene);
					
					// Textures grabbed from https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds and modified as needed
					// Other ways to generate online are listed here https://blender.stackexchange.com/questions/31424/planet-texture-generator
					const planet3Textures = {
						diffuse: new Texture((new URL('../assets/generated_planets/planet2_ertaale/ertaale_ast_2006036_lrg.jpg?as=webp', import.meta.url)).pathname, scene),
						normal: new Texture((new URL('../assets/generated_planets/planet2_ertaale/NormalMap.png?as=webp', import.meta.url)).pathname, scene),
					};
					mat.albedoTexture = planet3Textures.diffuse;
					mat.bumpTexture = planet3Textures.normal;
					mat.metallic = 0.0; // Set these to 1.0 to use metallic & roughness from texture
					mat.roughness = 1.0;
					
					return mat;
				})(),
				parent: solarSystemTransformNode,
				postCreateCb: (meshes, solarBodyConfig) => {
					meshes.main.position.addInPlace(new Vector3(-20, 20, 100));
					meshes.main.rotation.addInPlace(new Vector3(0, 0, Math.PI * 0.12));
				},
			},
			{
				type: 'planet',
				inspectorName: 'planet4',
				friendlyName: 'Vore 0MI',
				baseConfig: {diameter: 17, segments: 32},
				lodConfig: {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				material: (() => {
					const mat = new PBRMaterial('tempMat', scene);
					
					// Textures grabbed from https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds and modified as needed
					// Other ways to generate online are listed here https://blender.stackexchange.com/questions/31424/planet-texture-generator
					const planet3Textures = {
						diffuse: new Texture((new URL('../assets/generated_planets/planet3_dgnyre/dgnyre.jpg?as=webp', import.meta.url)).pathname, scene),
						normal: new Texture((new URL('../assets/generated_planets/planet3_dgnyre/NormalMap.png?as=webp', import.meta.url)).pathname, scene),
					};
					mat.albedoTexture = planet3Textures.diffuse;
					mat.bumpTexture = planet3Textures.normal;
					mat.metallic = 0.0;
					mat.roughness = 1.0;
					
					return mat;
				})(),
				parent: solarSystemTransformNode,
				postCreateCb: (meshes, solarBodyConfig) => {
					meshes.main.position.addInPlace(new Vector3(-200, 20, 100));
					meshes.main.rotation.addInPlace(new Vector3(0, 0, (Math.PI * 0.21)));
					
					// Set up cloud layer
					const cloudHeightPerc = 0.05;
					const cloudsMesh = MeshBuilder.CreateSphere(
						`${solarBodyConfig.inspectorName}_clouds`,
						{
							diameter: solarBodyConfig.baseConfig.diameter + (cloudHeightPerc * solarBodyConfig.baseConfig.diameter),
							segments: solarBodyConfig.baseConfig.segments / 2
						},
						scene
					);
					cloudsMesh.renderingGroupId = 1;
					cloudsMesh.layerMask = 0x10000000;
					cloudsMesh.parent = meshes.main;
					cloudsMesh.isPickable = false;
					
					// From https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds
					const cloudsDiffuse = new Texture((new URL('../assets/generated_planets/planet3_dgnyre/dgnyre-clouds.png?as=webp', import.meta.url)).pathname, scene);
					
					const cloudsMat = new PBRMaterial(`${solarBodyConfig.inspectorName}_cloudsMat`, scene);
					cloudsMat.opacityTexture = cloudsDiffuse;
					cloudsMat.metallic = 0.0;
					cloudsMat.roughness = 1.0;
					cloudsMesh.material = cloudsMat;
					
					// Rotate the cloud cover slowly
					const cloudRotationSpeed = 0.0002;
					this.onTickCallbacks.push((_delta, animationRatio) =>
						cloudsMesh.rotate(new Vector3(0, -1, 0), cloudRotationSpeed * animationRatio));
					
				},
			},
			{
				type: 'planet',
				inspectorName: 'planet5',
				friendlyName: 'Stan',
				baseConfig: {diameter: 3, segments: 32},
				lodConfig: {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				material: (() => {
					const mat = new PBRMaterial('tempMat', scene);
					
					// Textures grabbed from https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds and modified as needed
					// Other ways to generate online are listed here https://blender.stackexchange.com/questions/31424/planet-texture-generator
					const planet3Textures = {
						diffuse: new Texture((new URL('../assets/generated_planets/planet4_stan/iceworld2.jpg', import.meta.url)).pathname, scene),
						normal: new Texture((new URL('../assets/generated_planets/planet4_stan/NormalMap.png', import.meta.url)).pathname, scene),
						// roughness: new Texture((new URL('../assets/generated_planets/planet4_stan/roughness_channel_corrected.jpg', import.meta.url)).pathname, scene),
					};
					mat.albedoTexture = planet3Textures.diffuse;
					mat.bumpTexture = planet3Textures.normal;
					mat.metallic = 0.0; // Set these to 1.0 to use metallic & roughness from texture
					mat.roughness = 1.0;
					// mat.metallicTexture = planet3Textures.roughness;
					// mat.useMetallnessFromMetallicTextureBlue = true;
					// mat.useRoughnessFromMetallicTextureGreen = true; // Normally we'd set this to true and Alpha to false but I don't want this super shiny so here we are.
					// mat.useRoughnessFromMetallicTextureAlpha = false;
					
					return mat;
				})(),
				parent: solarSystemTransformNode,
				postCreateCb: (meshes, solarBodyConfig) => {
					meshes.main.position.addInPlace(new Vector3(50, 20, -200));
					meshes.main.rotation.addInPlace(new Vector3(0, 0, -(Math.PI * 0.12)));
					
					// Set up cloud layer
					const cloudHeightPerc = 0.01;
					const cloudsMesh = MeshBuilder.CreateSphere(
						`${solarBodyConfig.inspectorName}_clouds`,
						{
							diameter: solarBodyConfig.baseConfig.diameter + (cloudHeightPerc * solarBodyConfig.baseConfig.diameter),
							segments: solarBodyConfig.baseConfig.segments / 2
						},
						scene
					);
					cloudsMesh.renderingGroupId = 1;
					cloudsMesh.layerMask = 0x10000000;
					cloudsMesh.parent = meshes.main;
					cloudsMesh.isPickable = false;
					
					// From https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds
					const cloudsDiffuse = new Texture((new URL('../assets/generated_planets/planet1_toxic/clouds.png', import.meta.url)).pathname, scene);
					cloudsDiffuse.level = 0.1;
					
					const cloudsMat = new PBRMaterial(`${solarBodyConfig.inspectorName}_cloudsMat`, scene);
					cloudsMat.opacityTexture = cloudsDiffuse;
					cloudsMat.metallic = 0.0;
					cloudsMat.roughness = 1.0;
					cloudsMesh.material = cloudsMat;
					
					// Rotate the cloud cover slowly
					const cloudRotationSpeed = 0.0002;
					this.onTickCallbacks.push((_delta, animationRatio) =>
						cloudsMesh.rotate(new Vector3(0, -1, 0), cloudRotationSpeed * animationRatio));
					
				},
			},
		];
		
		// Build solar bodies
		solarBodyConfigs.forEach(solarBodyConfig => {
			
			const sphereMesh = MeshBuilder.CreateSphere(
				solarBodyConfig.inspectorName,
				{ diameter: solarBodyConfig.baseConfig.diameter, segments: solarBodyConfig.baseConfig.segments },
				scene
			);
			sphereMesh.renderingGroupId = 1;
			sphereMesh.layerMask = solarBodyConfig.layerMask ?? 0x10000000;
			
			this.solarBodies.push({
				mesh: sphereMesh,
				type: solarBodyConfig.type,
				name: solarBodyConfig.friendlyName,
			});
			
			sphereMesh.material = solarBodyConfig.material;
			sphereMesh.material.name = `${solarBodyConfig.inspectorName}Mat`;
			
			if (solarBodyConfig.parent) {
				sphereMesh.parent = solarBodyConfig.parent;
			}
			
			// Set up LOD alts
			const lodMeshes: Mesh[] = [];
			
			if (solarBodyConfig.lodConfig) {
				
				sphereMesh.useLODScreenCoverage = solarBodyConfig.lodConfig.useLODScreenCoverage === true;
				
				solarBodyConfig.lodConfig.levels.forEach(lodLevelConfig => {
					
					const lodSphereMesh = MeshBuilder.CreateSphere(
						`${solarBodyConfig.inspectorName}_lod_${lodLevelConfig.level}`,
						{ diameter: solarBodyConfig.baseConfig.diameter, segments: lodLevelConfig.segments },
						scene
					);
					lodSphereMesh.renderingGroupId = 1;
					lodSphereMesh.layerMask = 0x10000000;
					lodMeshes.push(lodSphereMesh);
					
					// Use the same material for these
					lodSphereMesh.material = solarBodyConfig.material;
					
					// Set parent to inherit positioning and such
					lodSphereMesh.parent = sphereMesh;
					
					// Attach the various LODs to the main mesh
					sphereMesh.addLODLevel(0.01, lodSphereMesh);
					
				});
				
			}
			
			// Run custom code
			solarBodyConfig.postCreateCb && solarBodyConfig.postCreateCb({main: sphereMesh, lods: lodMeshes}, solarBodyConfig);
			
		});
		
	}
	
	initGuiWip() {
		
		// Create 2D GUI manager
		const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI'); // 2D GUI (fullscreen)
		advancedTexture.layer && (advancedTexture.layer.layerMask = 0x20000000); // Set layerMask to only render on main camera
		
		this.solarBodies
			.filter(solarBody => solarBody.type === 'planet')
			.forEach(solarBody => this.initPlanetLabel(advancedTexture, solarBody.mesh, solarBody.name));
		
	}
	
	initPlanetLabel(advancedTexture: AdvancedDynamicTexture, planetMesh: AbstractMesh, planetName: string, opts?: Partial<PlanetLabelOpts>) {
		
		const fontSize = opts?.fontSize ?? defaultPlanetLabelOpts.fontSize;
		const rect1Width = opts?.rect1Width ?? defaultPlanetLabelOpts.rect1Width;
		const rect1Height = opts?.rect1Height ?? defaultPlanetLabelOpts.rect1Height;
		const linkOffsetY = opts?.linkOffsetY ?? defaultPlanetLabelOpts.linkOffsetY;
		const opacityDistanceControl = opts?.opacityDistanceControl ?? defaultPlanetLabelOpts.opacityDistanceControl;
		const sizeDistanceControl = opts?.sizeDistanceControl ?? defaultPlanetLabelOpts.sizeDistanceControl;
		
		const labelText = new TextBlock(`planetText_${planetName}`);
		labelText.text = planetName;
		labelText.color = 'white';
		labelText.fontSize = fontSize;
		labelText.fontFamily = 'Open Sans';
		
		const labelRect = new Rectangle(`labelRect_${planetName}`);
		labelRect.width = `${rect1Width}px`;
		labelRect.height = `${rect1Height}px`;
		labelRect.addControl(labelText);
		
		const line = new MultiLine(`line_${planetName}`);
		line.lineWidth = 3;
		// line.dash = [5, 10];
		line.color = 'white';
		line.zIndex = 1;
		
		// Draw UI elements to the screen
		advancedTexture.addControl(labelRect).addControl(line);
		
		const labelControl = new Control(`labelControl_${planetName}`);
		labelRect.addControl(labelControl);
		labelControl.top = `${(rect1Height / 2) - rect1Height}px`;
		
		/*
		const ref = CreateRef();
		
		const canvas = [
			{
				type: 'container',
				label: 'planetLabel',
				children: [
					{
						type: 'rectangle',
						label: 'textContainer',
						link: link,
						children: [
							{
								type: 'text',
								label: 'planetLabelText',
							},
						],
					},
					{
						type: 'line',
						label: 'planetToTextLine',
						link: link,
						points: [planet, rectRef]
					}
				],
			}
		];
		*/
		
		// Link together
		line.reset();
		line.add(planetMesh);
		line.add(labelControl);
		
		labelRect.linkWithMesh(planetMesh);
		labelRect.linkOffsetY = `${linkOffsetY}px`;
		
		this.onTickCallbacks.push(() => {
			
			if (!this.defaultCamera) {
				return;
			}
			
			const distance = Vector3.Distance(this.defaultCamera?.position, planetMesh.absolutePosition);
			
			const opacityPerc = Renderer.getDistanceRangePercentage(opacityDistanceControl.start, opacityDistanceControl.end, distance);
			const opacity = 1 - opacityPerc;
			
			labelRect.alpha = opacity;
			line.alpha = opacity;
			
			const sizePerc = Renderer.getDistanceRangePercentage(sizeDistanceControl.start, sizeDistanceControl.end, distance);
			const newSize = new Vector2(
				rect1Width - (sizePerc * rect1Width),
				rect1Height - (sizePerc * rect1Height)
			);
			
			labelText.fontSize = fontSize - (sizePerc * fontSize);
			labelRect.width = `${newSize.x}px`;
			labelRect.height = `${newSize.y}px`;
			labelControl.top = `${(newSize.y / 2) - newSize.y}px`;
			
			labelRect.linkOffsetY = `${linkOffsetY - (sizePerc * linkOffsetY)}px`;
			
		});
		
	}
	
	initParticles(scene: Scene) {
		
		const particleSystem = new ParticleSystem("particles", 2000, scene);
		particleSystem.particleTexture = new Texture("https://playground.babylonjs.com/textures/flare.png", scene);
		particleSystem.renderingGroupId = 1;
		particleSystem.layerMask = 0x10000000;
		
		// Where the particles come from
		particleSystem.emitter = Vector3.Zero(); // the starting location
		
		// Colors of all particles
		particleSystem.color1 = new Color4(0.7, 0.8, 1.0, 1.0);
		particleSystem.color2 = new Color4(0.2, 0.5, 1.0, 1.0);
		particleSystem.colorDead = new Color4(0, 0, 0.2, 0.0);
		
		// Size of each particle (random between...
		particleSystem.minSize = 1;
		particleSystem.maxSize = 5;
		
		// Life time of each particle (random between...
		particleSystem.minLifeTime = 1000;
		particleSystem.maxLifeTime = 10000;
		
		// Emission rate
		particleSystem.emitRate = 100;
		particleSystem.preWarmStepOffset = 100;
		particleSystem.preWarmCycles = 1000;
		
		/******* Emission Space ********/
		var sphereEmitter = particleSystem.createSphereEmitter(1200);
		sphereEmitter.radiusRange = 0.2;
		
		// Speed
		particleSystem.minEmitPower = 0;
		particleSystem.maxEmitPower = 0;
		particleSystem.updateSpeed = 0.005;
		
		// Start the particle system
		particleSystem.start();
		
		{
			
			const sunMesh = this.solarBodies.filter(solarBody => solarBody.type === 'star')[0].mesh;
			
			const localSystemSingleParticle = new ParticleSystem("particles2", 2, scene);
			localSystemSingleParticle.particleTexture = particleSystem.particleTexture;
			
			// Where the particles come from
			localSystemSingleParticle.emitter = sunMesh; // the starting location
			
			// Colors of all particles
			localSystemSingleParticle.color1 = Color3.FromHexString('#0f5fff').toColor4();
			localSystemSingleParticle.color2 = Color3.FromHexString('#0f5fff').toColor4();
			localSystemSingleParticle.colorDead = Color3.FromHexString('#0f5fff').toColor4(); // new Color4(0, 0, 0.2, 0.0);
			
			// Size of each particle (random between...
			localSystemSingleParticle.minSize = 6;
			localSystemSingleParticle.maxSize = 6;
			
			// Life time of each particle (random between...
			localSystemSingleParticle.minLifeTime = 0.008;
			localSystemSingleParticle.maxLifeTime = 0.008;
			
			// Emission rate
			localSystemSingleParticle.emitRate = 110;
			// particleSystem.preWarmStepOffset = 100;
			// particleSystem.preWarmCycles = 1000;
			
			/******* Emission Space ********/
			var sphereEmitter = localSystemSingleParticle.createSphereEmitter(0.1);
			sphereEmitter.radiusRange = 0;
			
			// Speed
			localSystemSingleParticle.minEmitPower = 0;
			localSystemSingleParticle.maxEmitPower = 0;
			localSystemSingleParticle.updateSpeed = 0.005;
			
			// Start the particle system
			localSystemSingleParticle.start();
			
		}
		
	}
	
	/**
	 * Binds the camera's radius to the local solar system transform node so zooming out shows "galaxy scale"
	 */
	registerGalaxyScaling(camera: ArcRotateCamera, solarSystemTransformNode: TransformNode) {
		
		const easingFunction = new SineEase();
		easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEIN);
		
		// const easingFunction = new CircleEase();
		// easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEIN);
		
		const scaleDistanceControl = {
			start: 100,
			end: 400,
		};
		
		const scaleAmount = {
			max: 1,
			min: 0.01,
		};
		const scaleRange = scaleAmount.max - scaleAmount.min;
		const scaleVector = Vector3.One();
		
		let exploreCameraVisible = true;
		
		this.onTickCallbacks.push(() => {
			
			const linearScalePerc = Renderer.getDistanceRangePercentage(scaleDistanceControl.start, scaleDistanceControl.end, camera.radius);
			const gradientScalePerc = easingFunction.ease(linearScalePerc);
			
			const newSolarSystemScale = scaleAmount.max - (gradientScalePerc * scaleRange);
			scaleVector.setAll(newSolarSystemScale);
			
			solarSystemTransformNode.scaling = scaleVector;
			
			if (this.exploreCamera) {
				if (solarSystemTransformNode.scaling.equalsWithEpsilon(Vector3.One(), 0.001)) {
					if (!exploreCameraVisible) {
						console.log('Toggling explore camera on');
						exploreCameraVisible = true;
						const {x, y, w, h} = this.exploreCameraViewport;
						this.exploreCamera.viewport = new Viewport(x, y, w, h);
					}
				}
				else if (exploreCameraVisible) {
					console.log('Toggling explore camera off');
					exploreCameraVisible = false;
					this.exploreCamera.viewport = new Viewport(0, 0, 0.01, 0.01);
				}
			}
			
		});
	}
	
	registerPlanetOrbitRotation() {
		
		const sunMesh = this.solarBodies.filter(solarBody => solarBody.type === 'star')[0]?.mesh;
		
		this.solarBodies.filter(solarBody => solarBody.type === 'planet').forEach(planetMeta => {
			
			const { mesh: planetMesh } = planetMeta;
			
			// How fast the rotation will be
			const fullRotationsPerSecond = 0.001; // TODO: Change this per planet based on distance from sun
			
			// Initial calculations to get the sin and cos
			const distanceVector = planetMesh.position.subtract(sunMesh.position);
			const distanceVectorLength = distanceVector.length();
			const currentDirectionVector = distanceVector.normalizeToNew();
			let currentCosPi = Math.acos(currentDirectionVector.x);
			let currentSinPi = Math.asin(currentDirectionVector.z);
			let currentTiltPi = Math.asin(currentDirectionVector.y);
			
			this.onTickCallbacks.push((_delta, animationRatio) => {
				
				const piStep = ((Math.PI * 2) / 60) * fullRotationsPerSecond;
				
				// Prep
				// const animationRatio = scene.getAnimationRatio();
				const animationPiStep = piStep * animationRatio;
				
				// x cos
				const newCosPi = currentCosPi + animationPiStep;
				const newCos = Math.cos(newCosPi);
				
				// z sin
				const newSinPi = currentSinPi + animationPiStep;
				const newSin = Math.sin(newSinPi);
				
				// y sin
				const newTiltPi = currentTiltPi + animationPiStep;
				const newTilt = Math.sin(newTiltPi);
				
				// Update planet position based on new position on the circle (sin & cos)
				planetMesh.position.x = (newCos * distanceVectorLength) + sunMesh.position.x;
				planetMesh.position.y = (newTilt * distanceVectorLength) + sunMesh.position.y;
				planetMesh.position.z = (newSin * distanceVectorLength) + sunMesh.position.z;
				
				// Save values for next tick
				currentCosPi = newCosPi;
				currentSinPi = newSinPi;
				currentTiltPi = newTiltPi;
				
			});
			
		});
		
	}
	
	autoOptimizeScene(scene: Scene, camera: ArcRotateCamera) {
		
		const targetFps = 50;
		const optimizationStartDelayMs = 1500;
		/** Amount of time to wait between optimization passes */
		const trackerDuration = 1000;
		const verboseLogging: boolean = true;
		
		const options: SceneOptimizerOptions = SceneOptimizerOptions.ModerateDegradationAllowed(targetFps);
		options.trackerDuration = trackerDuration;
		
		const numberOfCustomOptimizations = 5;
		let currentCustomOptimizationI = 0;
		
		options.optimizations = options.optimizations
			.filter(o => (
				false
				// o instanceof PostProcessesOptimization
				|| o instanceof TextureOptimization
				|| o instanceof RenderTargetsOptimization
				|| o instanceof HardwareScalingOptimization
			)).map((o, i) => {
				o.priority = i + numberOfCustomOptimizations;
				return o;
			});
		
		// Roughly tweak hardware scaling - first pass
		options.addCustomOptimization(
			() => {
				this.engine.setHardwareScalingLevel(this.initialDeviceRatio * 1.5);
				return true;
			},
			() => 'Reduce resolution - first pass',
			currentCustomOptimizationI++
		);
		
		// Roughly tweak hardware scaling - second pass
		options.addCustomOptimization(
			() => {
				this.engine.setHardwareScalingLevel(this.initialDeviceRatio * 2);
				return true;
			},
			() => 'Reduce resolution - second pass',
			currentCustomOptimizationI++
		);
		
		// Disable volumetric lighting and boost star material
		options.addCustomOptimization(
			() => {
				// Disable volumetric post processing
				this.godRays?.dispose(camera);
				
				// Boost solar body
				this.solarBodies
					.filter(solarBody => solarBody.type === 'star')
					.forEach(star => {
						if (star.mesh.material instanceof StandardMaterial) {
							star.mesh.material.diffuseTexture && (star.mesh.material.diffuseTexture.level = 10);
						}
					});
				
				// Slightly increase exposure
				const exposureTweakAmount = 0.170; // On desktop this looks very similar: 0.170
				this.renderingPipeline && (this.renderingPipeline.imageProcessing.exposure += exposureTweakAmount);
				
				return true;
			},
			() => 'Disabling volumetric lighting',
			currentCustomOptimizationI++
		);
		
		// Disable some postprocessing
		options.addCustomOptimization(
			() => {
				if (this.renderingPipeline) {
					this.renderingPipeline.bloomEnabled = false;
					this.renderingPipeline.chromaticAberrationEnabled = false;
				}
				return true;
			},
			() => 'Disabling bloom and chromatic aberration',
			currentCustomOptimizationI++
		);
		
		// Disable some more postprocessing
		options.addCustomOptimization(
			() => {
				if (this.renderingPipeline) {
					this.renderingPipeline.fxaaEnabled = false;
				}
				return true;
			},
			() => 'Disabling anti aliasing',
			currentCustomOptimizationI++
		);
		
		setTimeout(() => {
			
			verboseLogging && console.log('Optimization: Starting auto optimization');
			
			// Apply optimizations
			const sceneOptimizer = SceneOptimizer.OptimizeAsync(
				scene,
				options,
				() => {
					verboseLogging && console.log(`Optimization: FPS target reached at priority level ${sceneOptimizer.currentPriorityLevel}`);
				},
				() => {
					verboseLogging && console.log('Optimization: Did not reach FPS target');
					// alert('Did not reach target');
				}
			);
			
			// REVIEW: Is this actually needed?
			sceneOptimizer.trackerDuration = trackerDuration;
			
		}, optimizationStartDelayMs);
		
	}
	
	initJumpToCameraPosition(scene: Scene, camera: ArcRotateCamera, exploreCamera: ArcRotateCamera, solarSystemTransformNode: TransformNode, animationDurationSeconds: number = 1) {
		
		let pointerDown = false;
		let animations: (Animatable | null)[] = [];
		let bodyMesh: AbstractMesh | null = null;
		
		function killAnimations() {
			animations.forEach(a => a?.stop());
			animations = [];
		}
		
		scene.onPointerDown = (e, pickingInfo) => {
			pointerDown = true;
			
			let mesh = pickingInfo.pickedMesh;
			
			if (!mesh) {
				// From here https://forum.babylonjs.com/t/pointer-through-multiple-cameras/10467/5
				if (!pickingInfo.hit) {
					let pi = scene.pick(e.x, e.y, null as any, false, camera);
					if (pi?.pickedMesh) {
						mesh = pi?.pickedMesh;
					}
					else {
						return;
					}
				}
				else {
					// Nothing to do here
					return;
				}
			}
			
			bodyMesh = mesh;
		};
		
		scene.onPointerMove = (e, pickingInfo) => {
			if (pointerDown) {
				bodyMesh = null;
				
				killAnimations();
			}
		};
		
		scene.onPointerUp = async (e, pickingInfo) => {
			pointerDown = false;
			
			if (!pickingInfo) {
				return;
			}
			
			// const point = pickingInfo.pickedPoint;
			let mesh = pickingInfo.pickedMesh;
			
			if (!mesh) {
				// From here https://forum.babylonjs.com/t/pointer-through-multiple-cameras/10467/5
				if (!pickingInfo.hit) {
					let pi = scene.pick(e.x, e.y, null as any, false, camera);
					if (pi?.pickedMesh) {
						mesh = pi?.pickedMesh;
					}
					else {
						return;
					}
				}
				else {
					// Nothing to do here
					return;
				}
			}
			
			if (!bodyMesh || bodyMesh !== mesh) {
				return;
			}
			
			if (process.env.NODE_ENV === 'development') {
				console.log(mesh);
			}
			
			const easingFunction = new QuinticEase();
			easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
			
			const animationRatio = scene.getAnimationRatio();
			const targetFps = 60 * animationRatio;
			
			// Only allow jumping if we are not in galaxy scaling mode
			if (!solarSystemTransformNode.scaling.equalsWithEpsilon(Vector3.One(), 0.01)) {
				await new Promise((resolve) =>
					Animation.CreateAndStartAnimation('cameraZoomToLocalSystem', camera, 'radius', targetFps, 0.5 * targetFps, camera.radius, 95, Animation.ANIMATIONLOOPMODE_RELATIVE, easingFunction, () => resolve(true))
				);
			}
			
			const correspondingSolarBody = this.solarBodies.filter(solarBody => solarBody.mesh === mesh)[0];
			
			if (this.currentlyFocusedPlanet === correspondingSolarBody) {
				console.log('Already focused on this mesh');
				return;
			}
			
			this.currentlyFocusedPlanet = correspondingSolarBody;
			
			const point = mesh.absolutePosition;
			
			const origAlpha = camera.alpha;
			const origBeta = camera.beta;
			
			animations.push(Animation.CreateAndStartAnimation('cameraMove1', camera, 'target', targetFps, animationDurationSeconds * targetFps, camera.target.clone(), point.clone(), Animation.ANIMATIONLOOPMODE_RELATIVE, easingFunction));
			animations.push(Animation.CreateAndStartAnimation('cameraMove2', camera, 'radius', targetFps, animationDurationSeconds * targetFps, camera.radius, camera.radius, Animation.ANIMATIONLOOPMODE_RELATIVE, easingFunction));
			
			animations.push(Animation.CreateAndStartAnimation('cameraMove3', camera, 'alpha', targetFps, animationDurationSeconds * targetFps, camera.alpha, origAlpha, Animation.ANIMATIONLOOPMODE_RELATIVE));
			animations.push(Animation.CreateAndStartAnimation('cameraMove4', camera, 'beta', targetFps, animationDurationSeconds * targetFps, camera.beta, origBeta, Animation.ANIMATIONLOOPMODE_RELATIVE));
			
			// Set the pivot point of the transform node to the selected point so the galaxy scaling trick looks correct
			// But only set this if we are not already in galaxy space
			if (solarSystemTransformNode.scaling.equalsWithEpsilon(Vector3.One(), 0.01)) {
				solarSystemTransformNode.setPivotPoint(point);
			}
			
			// Update explore camera to new location
			if (mesh.layerMask & exploreCamera.layerMask) {
				exploreCamera.parent = mesh;
				const meshBoundingInfo = mesh.getBoundingInfo();
				const meshSize = meshBoundingInfo.boundingBox.maximum.subtract(meshBoundingInfo.boundingBox.minimum);
				exploreCamera.radius = meshSize.length();
			}
			
		};
		
	}
	
	static getDistanceRangePercentage(startDist: number, endDist: number, distance: number) {
		
		const diffDist = endDist - startDist;
		
		const currentPos = (distance - startDist) / diffDist;
		
		const perc = MathUtils.clamp(currentPos, 0, 1)
		
		return perc;
	}
	
}
