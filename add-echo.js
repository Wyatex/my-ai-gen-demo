const fs = require('fs');
let s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js', 'utf8');

s = s.replace(
  'self.onmessage = handleMessage;',
  'self.onmessage = function(e) { postMessage({ cmd: "printErr", threadId: "ECHO", text: "WORKER_GOT_MSG: " + JSON.stringify(e.data ? e.data.cmd : null) }); handleMessage(e); };'
);

fs.writeFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js', s);
console.log('Added ECHO to worker onmessage');
