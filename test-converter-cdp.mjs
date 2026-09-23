import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-conv-'));
const port = 9226;

console.log('Launching Edge to test media-converter.html on CDP port', port);
const edge = spawn(edgeExe, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${tempDir}`,
  'http://127.0.0.1:8080/media-converter.html'
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
      }
    };

    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
    ws.send(JSON.stringify({ id: 3, method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: false, flatten: true } }));

    // Wait 2 seconds for page load
    await new Promise(r => setTimeout(r, 2000));

    console.log('Triggering load & transcode in media-converter.html...');
    ws.send(JSON.stringify({
      id: 50,
      method: 'Runtime.evaluate',
      params: {
        expression: `
          (async () => {
            console.log('Starting dummy transcode test...');
            const dt = new DataTransfer();
            // A simple 1-second sine wave WAV file or small text
            const wavHeader = new Uint8Array([
              0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
              0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
              0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
              0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
            ]);
            const file = new File([wavHeader], "test.wav", { type: "audio/wav" });
            dt.items.add(file);
            const input = document.getElementById('mediaInput');
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Added dummy test.wav to mediaInput.');
            await new Promise(r => setTimeout(r, 600));
            console.log('Clicking btnStartBatch...');
            document.getElementById('btnStartBatch').click();
          })()
        `,
        awaitPromise: true
      }
    }));

    // Poll for status
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 500));
      ws.send(JSON.stringify({
        id: 200 + i,
        method: 'Runtime.evaluate',
        params: {
          expression: `({
            title: document.getElementById('progressTitle')?.innerText,
            percent: document.getElementById('progressPercent')?.innerText,
            engineBadge: document.getElementById('engineModeBadge')?.innerText,
            terminal: document.getElementById('terminalPanel')?.innerText.slice(-300)
          })`,
          returnByValue: true
        }
      }));
    }
  } finally {
    edge.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch(console.error);
