const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.ico': 'image/x-icon'
};

// Proxy target for Opencode AI Zen API
const ZEN_HOST = 'opencode.ai';

http.createServer((req, res) => {
  const url = req.url;

  // ── Proxy /zen/* requests to Opencode AI Zen API ──
  if (url.startsWith('/zen/')) {
    const zenPath = url.substring(1); // -> zen/v1/models, zen/v1/chat/completions, etc.
    const options = {
      hostname: ZEN_HOST,
      path: '/' + zenPath,
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers['authorization'] || ''
      }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      // Forward CORS headers so the browser accepts the response
      res.writeHead(proxyRes.statusCode, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': proxyRes.headers['content-type'] || 'application/json'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy failed' }));
    });

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
    return;
  }

  // ── Handle CORS preflight for /zen/ ──
  if (req.method === 'OPTIONS' && url.startsWith('/zen/')) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // ── Serve static files ──
  let filePath = '.' + url;
  if (filePath === './') filePath = './main.html';

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`MedNama running at http://localhost:${PORT}`);
  console.log(`Opencode AI Zen API proxied at http://localhost:${PORT}/zen/v1/`);
});
