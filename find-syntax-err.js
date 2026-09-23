const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');

// Fix the arrow function
s = s.replace(
  'loadWasmModuleToAllWorkers(()=>console.log("[CORE-MT] removing loading-workers dep!");removeRunDependency("loading-workers"))',
  'loadWasmModuleToAllWorkers(()=>{console.log("[CORE-MT] removing loading-workers dep!");removeRunDependency("loading-workers")})'
);

const vm = require('vm');
const cleaned = s
  .replace(/import\.meta\.url/g, '""')
  .replace(/export default createFFmpegCore;/, '');

try {
  vm.compileFunction(cleaned);
  console.log('🎉 Cleaned file compiled successfully without errors!');
} catch (e) {
  console.log('Compile error:', e.message);
}
