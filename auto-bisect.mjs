import fs from 'fs';
import { execFileSync, execSync } from 'child_process';

const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const orig = fs.readFileSync('assets/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js', 'utf8');
const lines = orig.split('\n');
const prefix = lines.slice(0, 7).join('\n') + '\n';
const suffix = '\nreturn (typeof Module !== "undefined" && Module.ready) || Promise.resolve();\n}\n);\n})();\nexport default createFFmpegCore;\n';

function testBody(bodyCode) {
  const content = prefix + bodyCode + suffix;
  fs.writeFileSync('test-core-copy.js', content);
  try {
    execSync('node --check test-core-copy.js', { stdio: 'ignore' });
  } catch (e) {
    return 'SYNTAX_ERROR';
  }
  
  try {
    const out = execFileSync(edgeExe, [
      '--headless=new',
      '--disable-gpu',
      '--virtual-time-budget=6000',
      '--dump-dom',
      'http://127.0.0.1:8080/test-classic-vs-module.html'
    ], { encoding: 'utf8', timeout: 8000 });

    if (out.includes('import_success')) return 'SUCCESS';
    if (out.includes('import_error')) return 'ERROR';
    return 'HANG';
  } catch (err) {
    return 'TIMEOUT';
  }
}

const line8 = lines[7];
const funcIndices = [];
let fIdx = 0;
while ((fIdx = line8.indexOf('function ', fIdx)) !== -1) {
  funcIndices.push(fIdx);
  fIdx += 9;
}

for (let i = 36; i <= 40; i++) {
  const targetIdx = funcIndices[i];
  const chunk = line8.slice(0, targetIdx);
  const res = testBody(chunk);
  console.log(`Func #${i} (idx ${targetIdx}): ${res}`);
}
