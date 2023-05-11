# WebGPU API Demo / Google CodeGen

Google CodeGen project documentation can be found [here](https://codelabs.developers.google.com/your-first-webgpu-app#0)

I modified the project a little to run the game in render cycles based on `requestAnimationFrame` instead of `setInterval`.

Also added a FPS calculator to the right of the game to display stats.

## Potential Issue

I did find one possible bug in the above documentation (at least on my machine), which was in the configuration for `bindGroupLayout` in `main.ts`. The fragment shader referenced a shared binding, which wasn't defined in the original docs.

If you change the first binding definition to:

```ts
{
  binding: 0,
  visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
  buffer: { type: 'uniform' } // Grid uniform buffer
}
```

It adds the `GPUShaderStage.FRAGMENT` shader to the visibility property.

## Compatibility

- For Chrome, use Windows, macOS versions >= 103 (mobile not supported yet)
- For Edge Canary, please open edge://flags/#enable-unsafe-webgpu, and enable the flag
- For FireFox Nightly, please open about:config, and change dom.webgpu.enabled to true
