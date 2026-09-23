import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function testUrl(url) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-test-'));
  try {
    const out = execFileSync(edgeExe, [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${tempDir}`,
      '--virtual-time-budget=10000',
      '--dump-dom',
      url
    ], { encoding: 'utf8', timeout: 12000 });
    return out;
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

console.log('Testing test-wait-done.html with isolated profile...');
const out1 = testUrl('http://127.0.0.1:8080/test-wait-done.html');
console.log('Result in DOM:');
const match = out1.match(/<div id="res">([\s\S]*?)<\/div>/);
console.log(match ? match[1].replace(/<br>/g, '\n') : out1);
