// Babylon.js named imports
import { ArcRotateCamera, Color3, CubeTexture, Engine, EquiRectangularCubeTexture, HighlightLayer, MeshBuilder, PBRMaterial, PBRMetallicRoughnessMaterial, Scene, StandardMaterial, Texture, Vector3 } from "@babylonjs/core";

// Babylon.js full imports
import "@babylonjs/core/Debug/debugLayer";
import "@babylonjs/inspector";
import "@babylonjs/loaders";
import "@babylonjs/core/Materials/Textures/Loaders";

// Other imports
import "./polyfills";

export class Renderer {
    
    engine: Engine;
    
    constructor(public canvasEl: HTMLCanvasElement) {
        
        this.engine = new Engine(canvasEl, true, {stencil: true}, true);
        this.engine.enableOfflineSupport = false;
        
        const scene = new Scene(this.engine);
        scene.clearColor = Color3.Gray().scale(0.5).toColor4();
        
        this.initScene(this.engine, scene);
        
        // Start render loop
        this.engine.runRenderLoop(() => {
            // Render the scene
            scene.render();
        });
        
        // Handle window resize events
        window.addEventListener('resize', () => this.engine.resize());
        
    }
    
    initScene(engine: Engine, scene: Scene) {
        
        // Create default camera
        const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 25, Vector3.Zero(), scene);
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
        
        // Skybox
        const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, scene);
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
        
        
        
        // Boilerplate sphere
        const sphereMat = new PBRMetallicRoughnessMaterial('sphereMat', scene);
        sphereMat.metallic = 0.5;
        sphereMat.roughness = 0.1;
        sphereMat.baseColor = Color3.Blue();
        
        const sphere = MeshBuilder.CreateSphere('sphere', { diameter: 2, segments: 26 }, scene);
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
    
}