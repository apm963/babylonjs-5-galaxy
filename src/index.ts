import { Renderer } from './Renderer';
import { Vector3 } from '@babylonjs/core/Maths';

const canvasContainer = document.getElementById('container');
const canvas = document.getElementById('canvas') as HTMLCanvasElement ?? document.createElement('canvas');
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.outlineWidth = '0px';
canvas.id = 'canvas';

if (document.getElementById('canvas') === null) {
    canvasContainer?.append(canvas);
}

const renderer = new Renderer(canvas);

interface HmrData {
    defaultCamera?: {
        target: Vector3;
        alpha: number;
        beta: number;
        radius: number;
    };
    solarSystemTransformNode?: {
        pivot: Vector3;
    }
}

interface HotProps<T> {
    data: T;
    
    accept: (callback: () => void) => void;
    dispose: (callback: (ref: T) => void) => void;
}

function isHotModule<T>(value: NodeModule): asserts value is (NodeModule & { hot: HotProps<T> }) {
    if (!('hot' in value)) {
        throw new Error('Module is not hot');
    }
}

// Dev-only stuff
if (process.env.NODE_ENV === 'development') {
    isHotModule<HmrData>(module);
    
    if (module.hot) {
        module.hot.dispose(dataRef => {
            
            // Snapshot data for whatever you want to retain before HMR unload
            const { defaultCamera, solarSystemTransformNode } = renderer;
            
            dataRef.defaultCamera = !defaultCamera ? undefined : {
                target: defaultCamera.target,
                alpha: defaultCamera.alpha,
                beta: defaultCamera.beta,
                radius: defaultCamera.radius,
            };
            
            dataRef.solarSystemTransformNode = !solarSystemTransformNode ? undefined : {
                pivot: solarSystemTransformNode.getPivotPoint(),
            };
            
            // Cleanly dispose of the engine instance
            console.log('Unloading existing Babylon.js engine instance before creating new instance');
            renderer.engine.dispose();
        });
        
        module.hot.accept(() => {
            isHotModule<HmrData>(module);
            // Extract data that was saved to dataRef within module.hot.dispose
            const data = module.hot.data;
            
            // Restore camera
            const { defaultCamera, solarSystemTransformNode } = renderer;
            if (data.defaultCamera && defaultCamera !== null){
                console.log('Restoring camera to previous position');
                defaultCamera.target = data.defaultCamera.target;
                defaultCamera.alpha = data.defaultCamera.alpha;
                defaultCamera.beta = data.defaultCamera.beta;
                defaultCamera.radius = data.defaultCamera.radius;
            }
            
            // Restore solar system pivot point
            if (data.solarSystemTransformNode && solarSystemTransformNode !== null) {
                console.log('Restoring solar system transform node pivot point');
                solarSystemTransformNode.setPivotPoint(data.solarSystemTransformNode.pivot);
            }
            
        });
    }
}
