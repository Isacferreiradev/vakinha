/**
 * Proxy server para a API Evopay Cash
 * Roda em localhost:3001 e repassa as chamadas para a API sem CORS
 * 
 * Como usar:
 *   node proxy.js
 */

const http = require('http');
const https = require('https');

const PORT = 3002;
const EVOPAY_TOKEN = 'f8055c9e-6a4c-442f-a431-3378adf00528';
const EVOPAY_HOST = 'pix.evopay.cash';

const server = http.createServer(function (req, res) {
  // CORS headers - permite qualquer origin local
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, API-Key');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only handle POST /api/pix
  if (req.method === 'POST' && req.url === '/api/pix') {
    let body = '';
    req.on('data', function (chunk) { body += chunk.toString(); });
    req.on('end', function () {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const postData = JSON.stringify({
        ...payload,
        callbackUrl: payload.callbackUrl || 'https://webhook.site/placeholder'
      });

      const options = {
        hostname: EVOPAY_HOST,
        port: 443,
        path: '/v1/pix/',
        method: 'POST',
        headers: {
          'API-Key': EVOPAY_TOKEN,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const proxyReq = https.request(options, function (proxyRes) {
        let responseData = '';
        proxyRes.on('data', function (chunk) { responseData += chunk; });
        proxyRes.on('end', function () {
          res.writeHead(proxyRes.statusCode || 200);
          res.end(responseData);
        });
      });

      proxyReq.on('error', function (err) {
        console.error('Proxy error:', err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      });

      proxyReq.write(postData);
      proxyReq.end();
    });

  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, function () {
  console.log('');
  console.log('✅ Proxy Evopay rodando em http://localhost:' + PORT);
  console.log('   Endpoint: POST http://localhost:' + PORT + '/api/pix');
  console.log('');
  console.log('   Deixe esse terminal aberto enquanto usa o checkout.');
  console.log('   Para parar: Ctrl+C');
  console.log('');
});
