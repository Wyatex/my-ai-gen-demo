const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');

const target = 'loadWasmModuleToWorker:worker=>new Promise(onFinishedLoading=>{worker.onmessage=e=>{';
const replacement = 'loadWasmModuleToWorker:worker=>new Promise(onFinishedLoading=>{worker.onmessage=e=>{if(Module["print"])Module["print"]("[WORKER_RAW] "+JSON.stringify(e["data"]));';

if (!s.includes(target)) {
  console.error('Target not found in ffmpeg-core.js!');
  process.exit(1);
}

s = s.replace(target, replacement);

const errTarget = 'worker.onerror=e=>{var message="worker sent an error!";';
const errReplacement = 'worker.onerror=e=>{if(Module["printErr"])Module["printErr"]("[WORKER_RAW_ERR] "+e.message+" "+e.filename+":"+e.lineno);var message="worker sent an error!";';

s = s.replace(errTarget, errReplacement);

fs.writeFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', s);
console.log('Successfully injected raw worker tracking into ffmpeg-core.js!');
