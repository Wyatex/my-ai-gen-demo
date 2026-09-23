import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-cdp-'));
const port = 9224;

console.log('Launching Edge on CDP port', port);
const edge = spawn(edgeExe, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${tempDir}`,
  'http://127.0.0.1:8080/test-wait-done.html'
], { stdio: 'ignore' });

async function run() {
  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        const json = await res.json();
        const page = json.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch (_) {}
    }

    if (!wsUrl) {
      console.error('Failed to get WebSocket URL from Edge');
      return;
    }

    console.log('Connected to CDP at', wsUrl);
    const ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
        console.log(`[BROWSER ${msg.params.type}]`, text);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
      } else if (msg.id >= 100 && msg.result?.result?.value) {
        if (msg.result.result.value.includes('🎉') || msg.result.result.value.includes('❌')) {
          console.log('FINAL RESULT IN DOM:\n' + msg.result.result.value);
          process.exit(0);
        }
      }
    };

    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: false, flatten: true } }));

    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      ws.send(JSON.stringify({
        id: 100 + i,
        method: 'Runtime.evaluate',
        params: { expression: 'document.getElementById("res")?.innerText' }
      }));
    }
  } finally {
    edge.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch(console.error);
