import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PORT = Number(process.env.PORT || 4173);
const HOST = '0.0.0.0';
const ROOT = path.resolve('docs');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const cache = new Map();

function getCachedFile(filePath) {
  const stat = fs.statSync(filePath);
  const hit = cache.get(filePath);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit;
  const raw = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const gzipped = zlib.gzipSync(raw, { level: 6 });
  const entry = { raw, gzipped, mime, mtimeMs: stat.mtimeMs };
  cache.set(filePath, entry);
  return entry;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const cleanUrl = decodeURIComponent((req.url || '/').split('?')[0]);
  const safeRel = path.normalize(cleanUrl).replace(/^(\.\.(\/|\\|$))+/, '');
  let targetPath = path.join(ROOT, safeRel === '/' ? 'index.html' : safeRel);

  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    targetPath = path.join(ROOT, 'index.html');
  }

  try {
    const entry = getCachedFile(targetPath);
    const acceptEnc = req.headers['accept-encoding'] || '';
    const useGzip = acceptEnc.includes('gzip');

    const headers = {
      'Content-Type': entry.mime,
      'Cache-Control': 'no-cache',
      Vary: 'Accept-Encoding',
    };

    if (useGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = entry.gzipped.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : entry.gzipped);
    } else {
      headers['Content-Length'] = entry.raw.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : entry.raw);
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Elite Legion server listening on http://${HOST}:${PORT}`);
});
