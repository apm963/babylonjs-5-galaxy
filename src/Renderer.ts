// Babylon.js named imports
import {
	AbstractMesh,
	Animation,
	ArcRotateCamera,
	Color3,
	CubeTexture,
	DefaultRenderingPipeline,
	EasingFunction,
	Engine,
	HighlightLayer,
	Material,
	Mesh,
	MeshBuilder,
	Node,
	PBRMaterial,
	PBRMetallicRoughnessMaterial,
	PointLight,
	QuinticEase,
	Scene,
	StandardMaterial,
	Texture,
	Vector2,
	Vector3,
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
	defaultCamera: null | ArcRotateCamera = null;
	solarBodies: PlanetMeta[] = [];
	sunLight: null | PointLight = null;
	
	onTickCallbacks: ((delta: number, animationRatio: number) => void)[] = [];
	
	constructor(public canvasEl: HTMLCanvasElement) {
		
		this.engine = new Engine(canvasEl, true, {stencil: true}, true);
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
		const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 25, Vector3.Zero(), scene);
		this.defaultCamera = camera;
		// Bind mouse events on the canvas to be associated with this camera
		camera.attachControl(engine._workingCanvas, true);
		camera.lowerRadiusLimit = 3;
		
		// Enable camera collisions
		const cameraCollisionRadius = 2.0;
		camera.collisionRadius = new Vector3(cameraCollisionRadius, cameraCollisionRadius, cameraCollisionRadius);
		camera.checkCollisions = true;
		
		// Initially do not check collisions while scene is initializing
		scene.collisionsEnabled = false;
		setImmediate(() => scene.collisionsEnabled = true);
		
		// HDR environment texture
		const hdrEnvironmentTextureUrl = (new URL("../assets/skybox/skybox.env", import.meta.url));
		const hdrEnvironmentTexture = CubeTexture.CreateFromPrefilteredData(hdrEnvironmentTextureUrl.pathname, scene);
		hdrEnvironmentTexture.level = 2;
		scene.environmentTexture = hdrEnvironmentTexture;
		
		// Add light (sun)
		const sunLight = new PointLight("pointLight", new Vector3(50, 50, -10), scene);
		sunLight.intensity = 50000;
		this.sunLight = sunLight;
		
		// Skybox
		const skybox = MeshBuilder.CreateBox("skyBox", { size: 9000.0 }, scene);
		skybox.infiniteDistance = true;
		skybox.isPickable = false;
		
		const skyboxHdrConvertedEnvUrl = new URL('../assets/skybox/skybox.env', import.meta.url);
		const skyboxCubeTexture = CubeTexture.CreateFromPrefilteredData(skyboxHdrConvertedEnvUrl.pathname, scene);
		skyboxCubeTexture.level = 0.05;
		skyboxCubeTexture.coordinatesMode = Texture.SKYBOX_MODE;
		
		const skyboxMaterial = new PBRMaterial("skyBox", scene);
		skyboxMaterial.backFaceCulling = false;
		skyboxMaterial.reflectionTexture = skyboxCubeTexture;
		skyboxMaterial.disableLighting = true;
		
		skybox.material = skyboxMaterial;
		
		// Other stuff
		this.initPost(engine, scene);
		this.initPlanets(scene);
		this.initGuiWip();
		Renderer.initJumpToCameraPosition(scene, this.defaultCamera, 1);
		
		// Set up collisions on meshes
		this.solarBodies.forEach(solarBody => solarBody.mesh.checkCollisions = true);
		
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
	
	initPost(engine: Engine, scene: Scene) {
		const defaultPipe = new DefaultRenderingPipeline('Default Pipeline', true, scene, this.defaultCamera ? [this.defaultCamera] : undefined);
		
		defaultPipe.fxaaEnabled = true;
		
		defaultPipe.imageProcessing.toneMappingEnabled = true;
		defaultPipe.imageProcessing.toneMappingType = 1;
		
		defaultPipe.bloomEnabled = true;
		defaultPipe.bloomThreshold = 0.5;
		defaultPipe.bloomWeight = 0.7;
		defaultPipe.bloomKernel = 64;
		defaultPipe.bloomScale = 0.5;
	}
	
	initPlanets(scene: Scene) {
		
		const highlightLayer = new HighlightLayer("hl1", scene);
		
		const solarBodyConfigs: SolarBodyConfig[] = [
			{
				type: 'star',
				inspectorName: 'sun',
				friendlyName: 'Sun',
				baseConfig: {diameter: 8, segments: 26},
				lodConfig: {
					useLODScreenCoverage: true,
					levels: [
						{level: 0.01, segments: 8},
						{level: 0.001, segments: 3},
					],
				},
				material: (() => {
					const mat = new StandardMaterial('tempMat', scene);
					mat.emissiveColor = Color3.FromHexString('#FFD8A3');
					mat.disableLighting = true; // This is fully emissive so no need for lighting
					return mat;
				})(),
				parent: this.sunLight,
				postCreateCb: meshes => {
					const allMeshes = [meshes.main, ...meshes.lods];
					allMeshes.forEach(mesh => highlightLayer.addMesh(mesh, Color3.Yellow().scale(0.3)));
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
					const mat = new PBRMetallicRoughnessMaterial('tempMat', scene);
					mat.metallic = 0.5;
					mat.roughness = 0.1;
					mat.baseColor = Color3.Blue();
					return mat;
				})(),
				postCreateCb: meshes => {
					const allMeshes = [meshes.main, ...meshes.lods];
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
					return mat;
				})(),
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
					mat.metallic = 1.0; // Set these to 1.0 to use metallic & roughness from texture
					mat.roughness = 1.0;
					
					// Textures created with http://wwwtyro.github.io/procedural.js/planet1/ using seed Njg2NDM3MzE4Nzk5OQ and tweaked vals
					// Other ways to generate online are listed here https://blender.stackexchange.com/questions/31424/planet-texture-generator
					// Roughness was channel corrected using this https://www.tuxpi.com/photo-effects/colorswap with config: 0% red, 100% green (negated), 100% blue
					const planet3Textures = {
						diffuse: new Texture((new URL('../assets/generated_planets/planet1_toxic/diffuse.png', import.meta.url)).pathname, scene),
						normal: new Texture((new URL('../assets/generated_planets/planet1_toxic/normal.png', import.meta.url)).pathname, scene),
						roughness: new Texture((new URL('../assets/generated_planets/planet1_toxic/roughness_channel_corrected.jpg', import.meta.url)).pathname, scene),
					};
					mat.albedoTexture = planet3Textures.diffuse;
					mat.bumpTexture = planet3Textures.normal;
					mat.metallicTexture = planet3Textures.roughness;
					mat.useMetallnessFromMetallicTextureBlue = true;
					mat.useRoughnessFromMetallicTextureGreen = false; // Normally we'd set this to true and Alpha to false but I don't want this super shiny so here we are.
					mat.useRoughnessFromMetallicTextureAlpha = true;
					
					return mat;
				})(),
				postCreateCb: (meshes, solarBodyConfig) => {
					meshes.main.position.addInPlace(new Vector3(-20, 20, 100));
					meshes.main.rotation.addInPlace(new Vector3(0, 0, Math.PI * 0.12));
					
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
					cloudsMesh.parent = meshes.main;
					cloudsMesh.isPickable = false;
					
					const cloudsDiffuse = new Texture((new URL('../assets/generated_planets/planet1_toxic/clouds.png', import.meta.url)).pathname, scene);
					
					const cloudsMat = new PBRMaterial(`${solarBodyConfig.inspectorName}_cloudsMat`, scene);
					cloudsMat.opacityTexture = cloudsDiffuse;
					cloudsMat.metallic = 0.0;
					cloudsMat.roughness = 1.0;
					cloudsMesh.material = cloudsMat;
					
					// Rotate the cloud cover slowly
					const cloudRotationSpeed = 0.001;
					this.onTickCallbacks.push((_delta, animationRatio) =>
						cloudsMesh.rotate(new Vector3(0, 1, 0), cloudRotationSpeed * animationRatio));
					
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
	
	static initJumpToCameraPosition(scene: Scene, camera: ArcRotateCamera, animationDurationSeconds: number = 1) {
		
		scene.onPointerDown = (e, pickingInfo) => {
			
			// Check if Alt / Command key was pressed
			if (!e.altKey) {
				// Ignore this
				return;
			}
			
			// const point = pickingInfo.pickedPoint;
			const mesh = pickingInfo.pickedMesh;
			
			console.log(mesh);
			
			if (!mesh) {
				// Nothing to do here
				return;
			}
			
			const point = mesh.absolutePosition;
			
			const origAlpha = camera.alpha;
			const origBeta = camera.beta;
			
			const targetFps = 240; // TODO: Make this dynamic
			const easingFunction = new QuinticEase();
			easingFunction.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
			
			Animation.CreateAndStartAnimation('cameraMove1', camera, 'target', targetFps, animationDurationSeconds * targetFps, camera.target.clone(), point.clone(), Animation.ANIMATIONLOOPMODE_RELATIVE, easingFunction);
			Animation.CreateAndStartAnimation('cameraMove2', camera, 'radius', targetFps, animationDurationSeconds * targetFps, camera.radius, camera.radius, Animation.ANIMATIONLOOPMODE_RELATIVE, easingFunction);
			
			Animation.CreateAndStartAnimation('cameraMove3', camera, 'alpha', targetFps, animationDurationSeconds * targetFps, camera.alpha, origAlpha, Animation.ANIMATIONLOOPMODE_RELATIVE);
			Animation.CreateAndStartAnimation('cameraMove4', camera, 'beta', targetFps, animationDurationSeconds * targetFps, camera.beta, origBeta, Animation.ANIMATIONLOOPMODE_RELATIVE);
			
		};
		
	}
	
	static getDistanceRangePercentage(startDist: number, endDist: number, distance: number) {
		
		const diffDist = endDist - startDist;
		
		const currentPos = (distance - startDist) / diffDist;
		
		const perc = MathUtils.clamp(currentPos, 0, 1)
		
		return perc;
	}
	
}
