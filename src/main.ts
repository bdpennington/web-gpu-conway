import { validateGPUAdapterOrError, validateWebGPUOrError } from './errors';

// Importing assets as strings in Vite
// https://vitejs.dev/guide/assets.html#importing-asset-as-string
import VertexShader from './shaders/vertex.wgsl?raw';
import FragmentShader from './shaders/fragment.wgsl?raw';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

validateWebGPUOrError()

const adapter = await navigator.gpu.requestAdapter();
validateGPUAdapterOrError(adapter);

const device = await adapter!.requestDevice();

const context = canvas.getContext("webgpu") as GPUCanvasContext;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});

const vertices = new Float32Array([
  //   X,    Y,
  -0.8, -0.8, // Triangle 1 (Blue)
  0.8, -0.8,
  0.8, 0.8,

  -0.8, -0.8, // Triangle 2 (Red)
  0.8, 0.8,
  -0.8, 0.8,
]);

const GRID_SIZE = 32;

// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);


const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
const vertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0, // Position, see vertex shader
  }],
} as const;

const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `
    ${VertexShader}
    ${FragmentShader}
  `
});
device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

const bindGroup = device.createBindGroup({
  label: "Cell renderer bind group",
  layout: cellPipeline.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer }
  }],
});

const encoder = device.createCommandEncoder();

const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    loadOp: "clear",
    clearValue: [0, 0, 0.4, 1],
    storeOp: "store",
  }]
});

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);

pass.setBindGroup(0, bindGroup);

pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

pass.end();

// Finish the command buffer and immediately submit it.
device.queue.submit([encoder.finish()]);

