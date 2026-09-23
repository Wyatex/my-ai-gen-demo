const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');

const target = 'if(!Module["locateFile"]){worker=new Worker(new URL("ffmpeg-core.worker.js",import.meta.url))}else{var pthreadMainJs=locateFile("ffmpeg-core.worker.js");worker=new Worker(pthreadMainJs)}';
const replacement = 'if(!Module["locateFile"]){worker=new Worker(new URL("ffmpeg-core.worker.js",import.meta.url),{type:"module"})}else{var pthreadMainJs=locateFile("ffmpeg-core.worker.js");worker=new Worker(pthreadMainJs,{type:"module"})}';

if (!s.includes(target)) {
  console.error('Target not found in ffmpeg-core.js!');
  process.exit(1);
}

s = s.replace(target, replacement);
fs.writeFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', s);
console.log('Successfully updated allocateUnusedWorker to use { type: "module" }!');
