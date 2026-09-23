import createFFmpegCore from './assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js';
import fs from 'fs';

const wasmBuffer = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.wasm');
const wasmModule = await WebAssembly.compile(wasmBuffer);
const wasmMemory = new WebAssembly.Memory({
  initial: 1073741824 / 65536,
  maximum: 1073741824 / 65536,
  shared: true
});

console.log('Testing worker-side createFFmpegCore initialization...');
const workerModule = {
  ENVIRONMENT_IS_PTHREAD: true,
  wasmModule,
  wasmMemory,
  buffer: wasmMemory.buffer,
  instantiateWasm: (info, receiveInstance) => {
    console.log('instantiateWasm called in worker!');
    const module = workerModule.wasmModule;
    workerModule.wasmModule = null;
    const instance = new WebAssembly.Instance(module, info);
    console.log('WebAssembly.Instance created successfully in worker!');
    return receiveInstance(instance);
  }
};

globalThis.startWorker = (instance) => {
  console.log('🎉 startWorker called with instance!');
};

try {
  const result = await createFFmpegCore(workerModule);
  console.log('🎉 worker createFFmpegCore resolved! Result:', typeof result);
} catch (e) {
  console.error('❌ Error in worker createFFmpegCore:', e);
}
