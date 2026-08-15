import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const root = resolve(process.cwd(), 'dist');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function headers(contentType) {
  return {
    'Content-Type': contentType,
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
  };
}

async function existingFile(path) {
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  if (pathname === '/health') {
    response.writeHead(200, headers('text/plain; charset=utf-8'));
    response.end('ok');
    return;
  }
  const candidate = normalize(join(root, pathname));
  const requestedFile = candidate.startsWith(root) ? await existingFile(candidate) : null;
  const file = requestedFile ?? join(root, 'index.html');
  const contentType = mimeTypes[extname(file)] ?? 'application/octet-stream';
  response.writeHead(200, headers(contentType));
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Sal Chat web preview: http://127.0.0.1:${port}`);
});
