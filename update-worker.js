const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js', 'utf8');

const target = '(e.data.urlOrBlob?import(e.data.urlOrBlob):import("./ffmpeg-core.js")).then(exports=>exports.default(Module))';
const replacement = 'if(e.data.urlOrBlob)Module["mainScriptUrlOrBlob"]=e.data.urlOrBlob;var coreUrl=e.data.urlOrBlob?e.data.urlOrBlob.split("#")[0]:"./ffmpeg-core.js";import(coreUrl).then(exports=>exports.default(Module)).catch(err=>{console.error("[WORKER-THREAD] Error loading core:",err);postMessage({cmd:"error",error:String(err)})})';

if (!s.includes(target)) {
  console.error('Target not found in worker!');
  process.exit(1);
}

s = s.replace(target, replacement);
fs.writeFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js', s);
console.log('Successfully updated ffmpeg-core.worker.js!');
