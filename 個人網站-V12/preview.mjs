import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/studio.js', ['studio.js', 'text/javascript; charset=utf-8']],
  ['/cloud.js', ['cloud.js', 'text/javascript; charset=utf-8']],
  ['/cloud-config.js', ['cloud-config.js', 'text/javascript; charset=utf-8']],
  ['/sync.js', ['sync.js', 'text/javascript; charset=utf-8']]
]);
const lan = process.argv.includes('--lan');
const address = lan ? '0.0.0.0' : '127.0.0.1';
const port = 4311;

const server = createServer(async (request, response) => {
  const route = request.url?.split('?')[0];
  const entry = files.get(route);
  if (!entry || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(entry ? 405 : 404).end();
    return;
  }
  try {
    const data = await readFile(new URL('./docs/' + entry[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch (error) {
    console.error(error.message);
    response.writeHead(500).end('Could not read the project file.');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? '4311 已被使用，請先關閉佔用這個連接埠的程式。' : error.message);
  process.exitCode = 1;
});
server.listen(port, address, () => {
  const localUrl = 'http://127.0.0.1:' + port;
  console.log('個人網站 V12：' + localUrl);
  if (process.platform === 'win32' && process.argv.includes('--open')) {
    const browser = spawn('cmd.exe', ['/d', '/c', 'start', localUrl], { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log('請手動開啟：' + localUrl));
  }
  if (!lan) return;
  for (const addresses of Object.values(networkInterfaces())) {
    for (const entry of addresses) {
      if (entry.family === 'IPv4' && !entry.internal) console.log('平板：http://' + entry.address + ':' + port);
    }
  }
});
