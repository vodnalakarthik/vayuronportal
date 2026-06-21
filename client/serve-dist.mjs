import { appendFileSync, createReadStream, existsSync, statSync } from 'fs';
import { extname, join, normalize } from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);
const logPath = join(__dirname, '..', 'frontend-static-runtime.log');

function log(message) {
  appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
}

process.on('uncaughtException', (error) => {
  log(`uncaughtException: ${error.stack || error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  log(`unhandledRejection: ${error?.stack || error}`);
  process.exit(1);
});

process.on('exit', (code) => {
  log(`exit: ${code}`);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    log(`signal: ${signal}`);
    process.exit(0);
  });
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const requested = normalize(join(distDir, urlPath));
  const filePath =
    requested.startsWith(distDir) && existsSync(requested) && statSync(requested).isFile()
      ? requested
      : join(distDir, 'index.html');
  const type = types[extname(filePath)] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  log(`Frontend listening on http://localhost:${port}`);
});
