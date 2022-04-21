import { ArcRotateCamera, Color3, Engine, MeshBuilder, PBRMaterial, PBRMetallicRoughnessMaterial, Scene, Vector3 } from "@babylonjs/core";

import "./polyfills";

export class Renderer {
    
    engine: Engine;
    
    constructor(public canvasEl: HTMLCanvasElement) {
        
        this.engine = new Engine(canvasEl, true, undefined, true);
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
        const camera = new ArcRotateCamera('camera', -Math.PI / 2, -Math.PI, 25, Vector3.Zero(), scene);
        // Bind mouse events on the canvas to be associated with this camera
        camera.attachControl(engine._workingCanvas, true);
        
        // Enable camera collisions
        const cameraCollisionRadius = 1.0;
        camera.collisionRadius = new Vector3(cameraCollisionRadius, cameraCollisionRadius, cameraCollisionRadius);
        camera.checkCollisions = true;
        
        // Initially do not check collisions while scene is initializing
        scene.collisionsEnabled = false;
        setImmediate(() => scene.collisionsEnabled = true);
        
        
        const box = MeshBuilder.CreateBox('test', {size: 1}, scene);
        const boxMat = new PBRMetallicRoughnessMaterial('boxMat', scene);
        boxMat.metallic = 0.5;
        boxMat.roughness = 0.1;
        boxMat.baseColor = Color3.Blue();
        box.material = boxMat;
        
    }
    
}