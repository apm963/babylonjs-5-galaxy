# Skybox texture

This is a quick summary of how this was made.

1. This tool was used to create the base texture [link](https://tools.wwwtyro.net/space-3d/index.html). I didn't note down the seed used for this particular texture that I created. Download and extract the zip.
2. Take the `cubemap.png` and put it through [this tool](https://360toolkit.co/convert-cubemap-to-spherical-equirectangular) to convert it to equirectangular. Download.
3. Convert the generated equirectangular png into an .hdr file. I used [this tool](https://onlineconvertfree.com/convert-format/png-to-hdr/) but you can use Photoshop or whatever.
4. Take your converted .hdr file and compress it to .env (a Babylon.js format) using the [IBL texture tool](https://www.babylonjs.com/tools/ibl/).
5. Use the compressed .env in your code.

## Usage example

```ts
const skyboxCubeTexture = CubeTexture.CreateFromPrefilteredData('../assets/skybox.env', scene);
skyboxCubeTexture.coordinatesMode = Texture.SKYBOX_MODE;
skyboxMaterial.reflectionTexture = skyboxCubeTexture;
```

## Archive the uncompressed files

The uncompressed image files that went into making the final .env were retained using

```sh
tar -cvzf sources.tar.gz cubemap.png skybox_equirectangular.hdr skybox_equirectangular.png
```

## Further reading

- [HDR, Dds , Env files](https://forum.babylonjs.com/t/hdr-dds-env-files/9892/2)
