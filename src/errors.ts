export function validateWebGPUOrError() {
  if (!navigator.gpu) {
    const h1El = document.createElement('h1');
    h1El.textContent = 'WebGPU not supported on this browser.';
    document.body.appendChild(h1El);
    throw new Error("WebGPU not supported on this browser.");
  }
}

export function validateGPUAdapterOrError(adapter: GPUAdapter | null): adapter is GPUAdapter {
  if (!adapter) {
    const h1El = document.createElement('h1');
    h1El.textContent = 'WebGPU not supported by this PCs GPU.';
    document.body.appendChild(h1El);
    throw new Error("No appropriate GPUAdapter found.");
  }
  return true;
}