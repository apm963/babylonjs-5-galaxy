# Babylon.js 5.0 Galaxy Demo

This is a tech demo of Babylon.js version 5.x in conjunction with the [v5 release event](https://forum.babylonjs.com/t/shhh-its-a-secret-babylon-js-5-0-is-here-early/28938).

[Try it out!](https://apm963.github.io/babylonjs-5-galaxy/)

It features the following techniques:

- [Physically Based Rendering (PBR)](https://doc.babylonjs.com/divingDeeper/materials/using/introToPBR) with [HDR environment lighting](https://doc.babylonjs.com/divingDeeper/materials/using/HDREnvironment)
- [Animations](https://doc.babylonjs.com/divingDeeper/animation/animation_introduction) and [easing functions](https://doc.babylonjs.com/divingDeeper/animation/advanced_animations)
- [Post Processing](https://doc.babylonjs.com/divingDeeper/postProcesses/usePostProcesses) (using the [default rendering pipeline](https://doc.babylonjs.com/divingDeeper/postProcesses/defaultRenderingPipeline))
- [Glow layer](https://doc.babylonjs.com/divingDeeper/mesh/glowLayer)
- Compressed [skybox](https://doc.babylonjs.com/divingDeeper/environment/skybox)
- [2D GUI](https://doc.babylonjs.com/divingDeeper/gui/gui)
- [Collision handling](https://doc.babylonjs.com/divingDeeper/mesh/interactions/mesh_intersect)
- [Level Of Detail (LOD)](https://doc.babylonjs.com/divingDeeper/mesh/LOD)
- ...and more!

Credits:

- Skybox created with [https://tools.wwwtyro.net/space-3d/index.html](https://tools.wwwtyro.net/space-3d/index.html)
- Some assets from [https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds](https://sites.google.com/site/mapsandsuch/maps-of-fictional-worlds) - Landon Lemmon
- Sun [god ray material inspiration](https://codepen.io/hiteshsahu/pen/YzYJMaP?editors=0010) and [texture](https://images.pexels.com/photos/2832382/pexels-photo-2832382.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2)

## Develop

Run directly

```sh
# Install packages
yarn

# Start Parcel watcher
yarn start
```

Or within Docker

```sh
docker run --rm -it -v $(pwd):/usr/local/app -w /usr/local/app -p 1234:1234 node /bin/bash -c 'yarn && yarn start'
```

## Build

To create a production build, run

```sh
yarn build
```

To build for Github Pages, use `yarn gh-pages` instead.
