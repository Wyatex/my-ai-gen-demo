import { spawn } from 'child_process';
import http from 'http';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9222;

const proc = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${port}`,
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
], { stdio: 'ignore' });

await new Promise(r => setTimeout(r, 1200));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

try {
  const list = await getJson(`http://127.0.0.1:${port}/json/list`);
  const wsUrl = list[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  let id = 1;

  const send = (method, params = {}) => {
    return new Promise(resolve => {
      const msgId = id++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  await new Promise(r => ws.onopen = r);

  // Auto-attach to all targets (including web workers!)
  await send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true
  });

  await send('Runtime.enable');
  await send('Page.enable');

  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value ?? a.description ?? JSON.stringify(a)).join(' ');
      console.log(`[CONSOLE ${msg.params.type}]`, text);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[EXCEPTION]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
    }
  });

  const testUrl = process.argv[2] || 'http://127.0.0.1:8080/test-plain-import.html';
  console.log('Navigating to:', testUrl);
  await send('Page.navigate', { url: testUrl });

  // Poll DOM content every 2 seconds
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const evalRes = await send('Runtime.evaluate', {
      expression: 'document.getElementById("res")?.innerText || document.body?.innerText || "EMPTY"'
    });
    console.log(`[DOM SNAPSHOT ${i + 1}]:\n`, evalRes?.result?.value);
  }

  ws.close();
  proc.kill();
} catch (err) {
  console.error('CDP Error:', err);
  proc.kill();
}
