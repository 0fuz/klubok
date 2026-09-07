// Dev helper: receives canvas PNG data URLs via POST and writes them to a directory.
// usage: node tools/shot-server.js <outDir> [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || '.';
const port = Number(process.argv[3] || 8091);
fs.mkdirSync(dir, { recursive: true });

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      const name = (u.searchParams.get('name') || 'shot').replace(/[^\w-]/g, '');
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(b64, 'base64'));
      res.end('ok');
    });
    return;
  }
  res.end('shot server');
}).listen(port, '127.0.0.1');
console.log(`shot server on ${port} -> ${dir}`);
