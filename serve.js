// 零依赖本地多媒体极速开发服务器 (内置原生 COOP / COEP 跨域隔离响应头)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  // 注入标准 COOP / COEP(require-corp) / CORP 响应头
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const startReq = Date.now();

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/media-converter.html';

  const safePath = path.normalize(path.join(ROOT_DIR, reqPath));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      console.log(`[${new Date().toLocaleTimeString()}] 404 ${req.method} ${req.url}`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + reqPath);
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(safePath, (readErr, content) => {
      if (readErr) {
        console.error(`[${new Date().toLocaleTimeString()}] 500 ${req.method} ${req.url}:`, readErr.message);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Read Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
      });
      res.end(content);
      console.log(`[${new Date().toLocaleTimeString()}] 200 ${req.method} ${req.url} (${content.length} B, ${Date.now() - startReq}ms)`);
    });
  });
});

const requestedPort = process.argv[2] ? parseInt(process.argv[2], 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 8080);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = requestedPort + 1;
    console.log(`⚠️ 端口 ${requestedPort} 已被占用 (旧的 http-server 仍在运行)，正在尝试备用端口 ${nextPort}...`);
    server.listen(nextPort);
  } else {
    console.error('服务器启动异常:', err);
  }
});

server.listen(requestedPort, () => {
  const port = server.address().port;
  console.log(`\n======================================================`);
  console.log(`🚀 FFmpeg.wasm 本地原生服务已启动 (内置 COOP/COEP 响应头)`);
  console.log(`⚡ 极速访问: http://localhost:${port}/media-converter.html`);
  console.log(`👉 跨域隔离: SharedArrayBuffer 原生激活, 0 插件 0 ServiceWorker 假死!`);
  console.log(`======================================================\n`);
});
