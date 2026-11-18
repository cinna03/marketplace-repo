import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { createRequire } from 'module';
import { networkInterfaces } from 'os';
import { extname, join, normalize } from 'path';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const root = new URL('.', import.meta.url).pathname;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      const family = entry.family === 4 ? 'IPv4' : entry.family;
      if (family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return '127.0.0.1';
}

function send(response, status, type, body) {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost:3000');
  if (url.pathname === '/lan') {
    send(response, 200, 'application/json', JSON.stringify({ address: lanAddress() }));
    return;
  }
  if (url.pathname === '/qr.svg') {
    const text = url.searchParams.get('text') || '';
    const host = lanAddress().replaceAll('.', '\\.');
    const allowed = new RegExp(`^http://(?:localhost|127\\.0\\.0\\.1|${host}):3000/#try/\\d+$`);
    if (!allowed.test(text)) {
      send(response, 400, 'text/plain', 'That QR target is not a try-on for a painting on this server.');
      return;
    }
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#1c1915', light: '#ffffff' } });
    send(response, 200, 'image/svg+xml', svg);
    return;
  }

  const relative = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  const asset = extname(relative);
  const filePath = join(root, relative === '/' || !asset ? 'index.html' : relative);
  try {
    const body = await readFile(filePath);
    send(response, 200, types[extname(filePath)] || 'text/plain', body);
  } catch {
    send(response, 404, 'text/plain', 'Not found');
  }
}).listen(3000, '0.0.0.0', () => {
  console.log(`WEB_READY http://localhost:3000 and http://${lanAddress()}:3000`);
});
