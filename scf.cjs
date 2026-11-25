const { timingSafeEqual } = require('node:crypto');
const service = import('./attendance.mjs');
const origin = 'https://ztttt429.github.io';
let writes = Promise.resolve();

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

exports.main_handler = async function(event) {
  const method = event.httpMethod ?? event.requestContext?.http?.method;
  const path = event.path ?? event.rawPath ?? '/';
  const headers = new Map(Object.entries(event.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
  if (path !== '/' && path !== '/api/attendance') return response(404, {error:'页面不存在。'});
  if (method === 'OPTIONS') return response(204);
  const expected = process.env.ADMIN_LINK_KEY;
  const actual = Buffer.from(String(headers.get('authorization') ?? ''));
  const target = Buffer.from('Bearer ' + expected);
  if (!expected || expected.length < 32 || actual.length !== target.length || !timingSafeEqual(actual, target)) {
    return response(401, {error:'请使用专用管理链接。'});
  }
  try {
    const {client, publicMatrix} = await service;
    if (method === 'GET') return response(200, publicMatrix(await (await client()).matrix()));
    if (method !== 'POST') return response(405, {error:'请求方法不支持。'});
    const body = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (body.length > 8192) return response(413, {error:'请求过大。'});
    let input;
    try { input = JSON.parse(body.toString()); } catch { return response(400, {error:'请求格式错误。'}); }
    if (typeof input?.name !== 'string' || typeof input.lessonId !== 'string' || typeof input.signed !== 'boolean') {
      return response(400, {error:'请检查姓名和课次。'});
    }
    const write = writes.then(async () => (await client()).setStatus(input));
    writes = write.catch(() => {});
    await write;
    return response(200, {ok:true});
  } catch (error) {
    return response(502, {error:error.message});
  }
};
