import { Renderer } from './Renderer';

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

// Dev-only stuff
if (process.env.NODE_ENV === 'development') {
    if ((module as any).hot) {
        // Cleanly dispose of the engine instance
        (module as any).hot.dispose(() => {
            renderer.engine.dispose();
        });
    }
}
