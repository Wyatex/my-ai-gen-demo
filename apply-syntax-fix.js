const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');

const badCode = 'loadWasmModuleToAllWorkers(()=>console.log("[CORE-MT] removing loading-workers dep!");removeRunDependency("loading-workers"))';
const goodCode = 'loadWasmModuleToAllWorkers(()=>{console.log("[CORE-MT] removing loading-workers dep!");removeRunDependency("loading-workers")})';

if (!s.includes(badCode)) {
  console.error('Could not find badCode in ffmpeg-core.js!');
  process.exit(1);
}

s = s.replace(badCode, goodCode);
fs.writeFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', s);
console.log('Successfully fixed syntax error in ffmpeg-core.js!');
