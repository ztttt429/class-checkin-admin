import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {client, publicMatrix} from './attendance.mjs';

const port = Number(process.env.PORT || 6214);
const host = '127.0.0.1';
const origin = 'http://' + host + ':' + port;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
let mutations = Promise.resolve();

function send(response, status, body, contentType = 'application/json; charset=utf-8') {
  response.writeHead(status, {'Content-Type': contentType, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'"});
  response.end(typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
}

createServer(async (request, response) => {
  const {url, method, headers} = request;
  if (headers.host !== host + ':' + port || (headers.origin && headers.origin !== origin)) {
    return send(response, 403, {error: '请从本机管理页面打开。'});
  }
  try {
    if (method === 'GET' && assets.has(url)) {
      const [name, type] = assets.get(url);
      return send(response, 200, await readFile(new URL('./docs/' + name, import.meta.url)), type);
    }
    if (method === 'GET' && url === '/api/attendance') {
      return send(response, 200, publicMatrix(await (await client()).matrix()));
    }
    if (method === 'POST' && url === '/api/attendance') {
      if (headers.origin !== origin || headers['content-type'] !== 'application/json') {
        return send(response, 403, {error: '签到修改必须来自本机页面。'});
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) return send(response, 413, {error: '请求过大。'});
      }
      const input = JSON.parse(body);
      const operation = mutations.then(async () => (await client()).setStatus(input));
      mutations = operation.catch(() => {});
      await operation;
      return send(response, 200, {ok: true});
    }
    send(response, 404, {error: '页面不存在。'});
  } catch (error) {
    send(response, 502, {error: error.message});
  }
}).listen(port, host, () => console.log('签到管理站 ' + origin));
