import { validateGPUAdapterOrError, validateWebGPUOrError } from './errors';
import fps from './fps';
// Importing assets as strings in Vite
// https://vitejs.dev/guide/assets.html#importing-asset-as-string
import VertexShader from './shaders/vertex.wgsl?raw';
import FragmentShader from './shaders/fragment.wgsl?raw';
import ComputeShader from './shaders/compute.wgsl?raw';

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
  -0.8, -0.8, // Triangle 1
  0.8, -0.8,
  0.8, 0.8,

  -0.8, -0.8, // Triangle 2
  0.8, 0.8,
  -0.8, 0.8,
]);

const GRID_SIZE = 32;
const WORKGROUP_SIZE = 8;
let step = 0; // Track how many simulation steps have been run

// Create an array representing the active state of each cell.
const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

// Create two storage buffers to hold the cell state. (ping-pong pattern).
const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
];

// Set each cell to a random state, then copy the JavaScript array 
// into the storage buffer.
for (let i = 0; i < cellStateArray.length; ++i) {
  cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

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

const simulationShaderModule = device.createShaderModule({
  label: "Game of Life simulation shader",
  code: `
    ${ComputeShader}
  `
});

// Create the bind group layout and pipeline layout.
const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
    buffer: { type: 'uniform' } // Grid uniform buffer
  }, {
    binding: 1,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" } // Cell state input buffer
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage" } // Cell state output buffer
  }]
});

// Create a bind group to pass the grid uniforms into the pipeline
const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }, {
      binding: 1,
      resource: { buffer: cellStateStorage[0] }
    }, {
      binding: 2,
      resource: { buffer: cellStateStorage[1] }
    }],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,

    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }, {
      binding: 1,
      resource: { buffer: cellStateStorage[1] }
    }, {
      binding: 2,
      resource: { buffer: cellStateStorage[0] }
    }],
  }),
];

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
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

// Create a compute pipeline that updates the game state.
const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
    constants: {
      workGroupSize: WORKGROUP_SIZE,
    }
  }
});

function updateGrid() {
  const encoder = device.createCommandEncoder();

  const computeEncoder = encoder.beginComputePass();

  computeEncoder.setPipeline(simulationPipeline);
  computeEncoder.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computeEncoder.dispatchWorkgroups(workgroupCount, workgroupCount);

  computeEncoder.end();

  step++; // Increment the step count

  // Start a render pass 
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
      storeOp: "store",
    }]
  });

  // Draw the grid.
  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
}

let animationId: number;

const renderLoop = () => {
  fps.render();
  updateGrid();

  animationId = requestAnimationFrame(renderLoop);
};

renderLoop();
