// Статический сервер + пересборка на изменения.
//   node tools/serve.mjs dist            — только раздать
//   node tools/serve.mjs dist --watch    — раздать и пересобирать при правке src/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join, dirname, normalize, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DIR = join(ROOT, args.find((a) => !a.startsWith('--')) || 'dist');
const WATCH = args.includes('--watch');
const PORT = Number(process.env.PORT || 8000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* live reload через SSE: никаких зависимостей и клиентского бандла */
const clients = new Set();
const ping = () => clients.forEach((res) => res.write('data: reload\n\n'));

let build = null;
async function rebuild() {
  build ??= await import('./build.mjs');
  try {
    await build.build(true);
    ping();
  } catch (e) {
    console.error('сборка упала:', e.message);
  }
}
let timer = 0;
if (WATCH) {
  watch(join(ROOT, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 120);
  });
  watch(join(ROOT, 'public'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 120);
  });
}

const LIVERELOAD = `<script>try{new EventSource('/__lr').onmessage=e=>{if(e.data==='reload')location.reload()}}catch(e){}</script>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/__lr') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p) p = 'index.html';
  let abs = resolve(DIR, p);
  if (!abs.startsWith(DIR)) { res.writeHead(403).end('forbidden'); return; }

  try {
    if ((await stat(abs)).isDirectory()) abs = join(abs, 'index.html');
  } catch {
    /* нет файла — попробуем .html / index.html */
  }
  const tries = [abs, `${abs}.html`, join(abs, 'index.html')];
  for (const file of tries) {
    try {
      let buf = await readFile(file);
      if (extname(file) === '.html') {
        const html = buf.toString('utf8');
        buf = (WATCH ? html.replace('</body>', `${LIVERELOAD}</body>`) : html);
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cache-Control': WATCH ? 'no-store' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(buf);
      return;
    } catch { /* дальше */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(
    `<h1>404</h1><p>${escapeHtml(p)} нет в <code>${escapeHtml(DIR.replace(ROOT + '/', ''))}</code>.${WATCH ? '' : ' Сначала: npm run build'}</p>`,
  );
});
const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`→ http://0.0.0.0:${PORT}  (${DIR.replace(ROOT + '/', '')} ${WATCH ? '+ watch' : ''})`);
});
