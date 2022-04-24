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
	MeshBuilder,
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

interface PlanetMeta {
	mesh: AbstractMesh;
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
	planets: PlanetMeta[] = [];
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
		const cameraCollisionRadius = 1.0;
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
		this.planets.forEach(planet => planet.mesh.checkCollisions = true);
		
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
		
		// *****************************
		// Sun
		// *****************************
		
		const sunMat = new StandardMaterial('sunMat', scene);
		sunMat.emissiveColor = Color3.FromHexString('#FFD8A3');
		
		const sun = MeshBuilder.CreateSphere('sun', { diameter: 2, segments: 3 }, scene);
		this.planets.push({
			mesh: sun,
			name: 'Sun'
		});
		sun.material = sunMat;
		sun.parent = this.sunLight;
		
		// *****************************
		// First planet
		// *****************************
		
		const sphereMat = new PBRMetallicRoughnessMaterial('sphereMat', scene);
		sphereMat.metallic = 0.5;
		sphereMat.roughness = 0.1;
		sphereMat.baseColor = Color3.Blue();
		
		const sphere = MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 26 }, scene);
		this.planets.push({
			mesh: sphere,
			name: 'Penuaturn' // https://www.fantasynamegenerators.com/planet_names.php
		});
		sphere.material = sphereMat;
		
		// Sphere LOD alts
		{
			const sphereMed = MeshBuilder.CreateSphere(`${sphere.name}Med`, { diameter: 2, segments: 8 }, scene);
			const sphereLow = MeshBuilder.CreateSphere(`${sphere.name}Low`, { diameter: 2, segments: 3 }, scene);
			
			// Use the same material for these
			sphereMed.material = sphereMat;
			sphereLow.material = sphereMat;
			
			// This is just for organization in the inspector
			sphereMed.parent = sphere;
			sphereLow.parent = sphere;
			
			// Attach the various LODs to the main mesh
			sphere.useLODScreenCoverage = true;
			sphere.addLODLevel(0.01, sphereMed);
			sphere.addLODLevel(0.001, sphereLow);
		}
		
		// Create atmosphere with glow layer
		var highlightLayer = new HighlightLayer("hl1", scene);
		highlightLayer.addMesh(sphere, new Color3(0.2, 0.4, 1).scale(0.3));
		
		// *****************************
		// Second planet
		// *****************************
		
		const planet2Mat = new PBRMetallicRoughnessMaterial('planet2Mat', scene);
		planet2Mat.metallic = 0.5;
		planet2Mat.roughness = 0.3;
		planet2Mat.baseColor = Color3.Teal();
		
		const planet2 = MeshBuilder.CreateSphere('planet2', { diameter: 1.5, segments: 26 }, scene);
		this.planets.push({
			mesh: planet2,
			name: 'Unradus'
		});
		planet2.position.addInPlace(new Vector3(200, 0, 0));
		planet2.material = planet2Mat;
		
		// Sphere LOD alts
		{
			const sphereMed = MeshBuilder.CreateSphere(`${planet2.name}Med`, { diameter: 1.5, segments: 8 }, scene);
			const sphereLow = MeshBuilder.CreateSphere(`${planet2.name}Low`, { diameter: 1.5, segments: 3 }, scene);
			
			// Use the same material for these
			sphereMed.material = planet2Mat;
			sphereLow.material = planet2Mat;
			
			// This is just for organization in the inspector
			sphereMed.parent = planet2;
			sphereLow.parent = planet2;
			
			// Attach the various LODs to the main mesh
			planet2.useLODScreenCoverage = true;
			planet2.addLODLevel(0.01, sphereMed);
			planet2.addLODLevel(0.001, sphereLow);
		}
		
		// *****************************
		// Third planet
		// *****************************
		
		const planet3Mat = new PBRMaterial('planet3Mat', scene);
		planet3Mat.metallic = 1.0; // Set these to 1.0 to use metallic & roughness from texture
		planet3Mat.roughness = 1.0;
		
		// Textures created with http://wwwtyro.github.io/procedural.js/planet1/ using seed Njg2NDM3MzE4Nzk5OQ and tweaked vals
		// Roughness was channel corrected using this https://www.tuxpi.com/photo-effects/colorswap with config: 0% red, 100% green (negated), 100% blue
		const planet3Textures = {
			diffuse: new Texture((new URL('../assets/generated_planets/planet1_toxic/diffuse.png', import.meta.url)).pathname, scene),
			normal: new Texture((new URL('../assets/generated_planets/planet1_toxic/normal.png', import.meta.url)).pathname, scene),
			roughness: new Texture((new URL('../assets/generated_planets/planet1_toxic/roughness_channel_corrected.jpg', import.meta.url)).pathname, scene),
			cloudsDiffuse: new Texture((new URL('../assets/generated_planets/planet1_toxic/clouds.png', import.meta.url)).pathname, scene),
		};
		planet3Mat.albedoTexture = planet3Textures.diffuse;
		planet3Mat.bumpTexture = planet3Textures.normal;
		planet3Mat.metallicTexture = planet3Textures.roughness;
		planet3Mat.useMetallnessFromMetallicTextureBlue = true;
		planet3Mat.useRoughnessFromMetallicTextureGreen = false; // Normally we'd set this to true and Alpha to false but I don't want this super shiny so here we are.
		planet3Mat.useRoughnessFromMetallicTextureAlpha = true;
		
		const planet3 = MeshBuilder.CreateSphere('planet3', { diameter: 3.5, segments: 26 }, scene);
		this.planets.push({
			mesh: planet3,
			name: 'Lyke GS'
		});
		planet3.position.addInPlace(new Vector3(-20, 20, 100));
		planet3.rotation.addInPlace(new Vector3(0, 0, Math.PI * 0.12));
		planet3.material = planet3Mat;
		
		// Sphere LOD alts
		{
			const sphereMed = MeshBuilder.CreateSphere(`${planet3.name}Med`, { diameter: 3, segments: 8 }, scene);
			const sphereLow = MeshBuilder.CreateSphere(`${planet3.name}Low`, { diameter: 3, segments: 3 }, scene);
			
			// Use the same material for these
			sphereMed.material = planet3Mat;
			sphereLow.material = planet3Mat;
			
			// This is just for organization in the inspector
			sphereMed.parent = planet3;
			sphereLow.parent = planet3;
			
			// Attach the various LODs to the main mesh
			planet3.useLODScreenCoverage = true;
			planet3.addLODLevel(0.01, sphereMed);
			planet3.addLODLevel(0.001, sphereLow);
		}
		
		// Clouds
		{
			const cloudHeightPerc = 0.05;
			const planet3CloudsMesh = MeshBuilder.CreateSphere('planet3Clouds', { diameter: 3.5 + (cloudHeightPerc * 3.5), segments: 26 / 2 }, scene);
			planet3CloudsMesh.parent = planet3;
			planet3CloudsMesh.isPickable = false;
			
			const planet3CloudsMat = new PBRMaterial('planet3CloudsMat', scene);
			planet3CloudsMat.opacityTexture = planet3Textures.cloudsDiffuse;
			planet3CloudsMat.metallic = 0.0;
			planet3CloudsMat.roughness = 1.0;
			planet3CloudsMesh.material = planet3CloudsMat;
			
			// Rotate the cloud cover slowly
			const cloudRotationSpeed = 0.001;
			this.onTickCallbacks.push((_delta, animationRatio) =>
				planet3CloudsMesh.rotate(new Vector3(0, 1, 0), cloudRotationSpeed * animationRatio));
		}
		
	}
	
	initGuiWip() {
		
		// Create 2D GUI manager
		const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI'); // 2D GUI (fullscreen)
		
		this.planets.forEach(planetMeta => this.initPlanetLabel(advancedTexture, planetMeta.mesh, planetMeta.name));
		
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
			
			const distance = Vector3.Distance(this.defaultCamera?.position, planetMesh.position);
			
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
