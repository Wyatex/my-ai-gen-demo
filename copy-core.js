const fs = require('fs');
const s = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');
fs.writeFileSync('test-core-copy.js', s);
console.log('Copied full ffmpeg-core.js to test-core-copy.js (length: ' + s.length + ')');
