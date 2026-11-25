import {readFile} from 'node:fs/promises';

const base = 'https://docs.qq.com/openapi/';
const signedText = '已签到';
const reportHour = 20;
const marker = '签到系统自动缺勤 ';
const dateFormat = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'});
const hourFormat = new Intl.DateTimeFormat('en-GB', {timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23'});
const day = value => dateFormat.format(value);
const richText = text => [{type: 'text', text}];
const plain = value => Array.isArray(value) ? value.map(part => part.text || '').join('') : '';
const valueAt = (rows, row, column) => rows[row]?.values?.[column]?.cellValue ?? {};
const textAt = (rows, row, column) => valueAt(rows, row, column).text ?? '';
const blank = value => Object.entries(value).every(([, field]) => field === '' || field == null);

export async function credentials() {
  if (process.env.TENCENT_DOCS_CONFIG) return JSON.parse(process.env.TENCENT_DOCS_CONFIG);
  if (!process.env.TENCENT_DOCS_CONFIG_FILE) throw new Error('缺少腾讯文档授权配置。');
  return JSON.parse(await readFile(process.env.TENCENT_DOCS_CONFIG_FILE, 'utf8'));
}

export function parseMatrix(rows) {
  if (!Array.isArray(rows) || textAt(rows, 0, 0) !== '姓名') throw new Error('签到表缺少姓名表头。');
  const students = new Map();
  const lessons = new Map();
  for (let row = 1; row < rows.length; row++) {
    const name = textAt(rows, row, 0).trim();
    if (!name) continue;
    if (students.has(name)) throw new Error('签到表中有重名，请先确认名单。');
    students.set(name, row);
  }
  for (const column of rows[0].values.keys()) {
    const header = textAt(rows, 0, column).trim();
    if (!header || column === 0) continue;
    const match = /^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)\s+(.+)$/u.exec(header);
    if (!match) continue;
    const [, date, hour, minute, name] = match;
    const time = hour + ':' + minute;
    const startsAt = Date.parse(date + 'T' + time + ':00+08:00');
    if (!Number.isFinite(startsAt) || day(startsAt) !== date) continue;
    const id = JSON.stringify([date, time, name.trim()]);
    if (lessons.has(id)) throw new Error('签到表中有重复课次，请先核对表头。');
    lessons.set(id, {id, date, time, name: name.trim(), column, startsAt});
  }
  if (!students.size || !lessons.size) throw new Error('签到表没有可识别的名单或课次。');
  return {students, lessons, rows};
}

export async function tencent(config) {
  async function request(path, body) {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Client-Id': config.client_id, 'Open-Id': config.open_id,
        'Access-Token': config.access_token, 'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    const code = result.ret ?? result.code ?? 0;
    if (!response.ok || code !== 0) throw new Error('腾讯文档请求失败（HTTP ' + response.status + '，业务码 ' + code + '）。');
    return result.data ?? result;
  }
  const fileId = async link => {
    const result = await request('drive/v2/util/converter?type=2&value=' + encodeURIComponent(link));
    if (!result.fileID) throw new Error('腾讯文档未返回文件 ID。');
    return encodeURIComponent(result.fileID);
  };
  const source = 'spreadsheet/v3/files/' + await fileId(config.source_link_id);
  const sourceSheet = '000001';

  async function matrix() {
    const response = await request(source + '/' + sourceSheet + '/A1:BM100');
    return parseMatrix(response.gridData?.rows);
  }

  async function setStatus({lessonId, name, signed}) {
    const {students, lessons, rows} = await matrix();
    const row = students.get(name);
    const column = lessons.get(lessonId)?.column;
    if (row === undefined || column === undefined || typeof signed !== 'boolean') throw new Error('找不到对应姓名或课次。');
    const current = valueAt(rows, row, column);
    if (current.text !== signedText && !blank(current)) throw new Error('该格已有手工填写的内容，请在腾讯表格核对。');
    if ((current.text === signedText) === signed) return;
    const result = await request(source + '/batchUpdate', {
      requests: [{updateRangeRequest: {sheetId: sourceSheet, gridData: {
        startRow: row, startColumn: column, rows: [{values: [{cellValue: {text: signed ? signedText : ''}}]}],
      }}}],
    });
    if (result.responses?.length !== 1) throw new Error('腾讯表格未确认写入。');
    const actual = await matrix();
    const value = valueAt(actual.rows, actual.students.get(name), actual.lessons.get(lessonId)?.column);
    if (signed ? value.text !== signedText : !blank(value)) throw new Error('写入后的状态与请求不一致，请刷新核对。');
  }

  async function destination() {
    const path = 'smartbook/v2/files/' + await fileId(config.destination_link_id) + '/sheets/trRhFg';
    return command => request(path, command);
  }
  return {matrix, setStatus, destination};
}

export function publicMatrix({students, lessons, rows}) {
  return {
    dates: [...new Set([...lessons.values()].map(lesson => lesson.date))].sort(),
    lessons: [...lessons.values()].sort((a, b) => a.startsAt - b.startsAt).map(({id, date, time, name, column}) => ({
      id, date, time, name,
      roster: [...students].map(([student, row]) => {
        const value = valueAt(rows, row, column);
        return {name: student, signed: value.text === signedText, manual: value.text !== signedText && !blank(value)};
      }),
    })),
  };
}

async function readRecords(call) {
  const records = [];
  for (let offset = 0;;) {
    const {getRecords: page} = await call({getRecords: {offset, limit: 100, fieldTitles: ['日期', '学生姓名', '课程名称', '备注', '考勤状态', '填报人']}});
    if (!Array.isArray(page?.records)) throw new Error('缺勤表未返回可识别的记录。');
    records.push(...page.records);
    if (!page.hasMore) return records;
    if (!Number.isInteger(page.next) || page.next <= offset) throw new Error('缺勤表分页异常。');
    offset = page.next;
  }
}

export async function reconcile(client, {start, days = 3, now = Date.now(), dryRun = false} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '')) throw new Error('未设置自动上报的起始日期。');
  const today = day(now);
  const earliest = day(now - (days - 1) * 86400000);
  const {students, lessons, rows} = await client.matrix();
  const eligible = [...lessons.values()].filter(lesson => lesson.date >= start && lesson.date >= earliest &&
    (lesson.date < today || lesson.date === today && +hourFormat.format(now) >= reportHour) && lesson.startsAt <= now);
  if (!eligible.length) return {lessons: 0, added: 0, removed: 0};
  const call = await client.destination();
  const [{getFields}, existing] = await Promise.all([call({getFields: {}}), readRecords(call)]);
  const option = getFields?.fields?.find(field => field.fieldTitle === '考勤状态')
    ?.propertySingleSelect?.options?.find(item => item.text === '缺勤');
  if (!option?.id) throw new Error('缺勤表找不到「缺勤」选项。');
  const automatic = new Map();
  const manual = new Set();
  for (const {recordID, values = {}} of existing) {
    const remark = plain(values['备注']);
    const timestamp = Number(values['日期']);
    const student = plain(values['学生姓名']);
    const course = plain(values['课程名称']);
    const date = timestamp > 0 && Number.isFinite(timestamp) ? day(timestamp) : '';
    let origin;
    if (remark.startsWith(marker)) {
      try { origin = JSON.parse(remark.slice(marker.length)); } catch {}
    }
    if (Array.isArray(origin) && origin.length === 4 && origin[0] === date && origin[2] === course &&
        origin[3] === student && plain(values['填报人']) === '郑奕' && values['考勤状态']?.[0] === option.id) {
      const key = remark.slice(marker.length);
      if (!automatic.has(key)) automatic.set(key, []);
      automatic.get(key).push(recordID);
    } else {
      const timestamp = Number(values['日期']);
      if (timestamp > 0 && Number.isFinite(timestamp)) {
        manual.add(JSON.stringify([day(timestamp), plain(values['课程名称']), plain(values['学生姓名'])]));
      }
    }
  }
  const add = [];
  const remove = [];
  for (const lesson of eligible) {
    for (const [student, row] of students) {
      const key = JSON.stringify([lesson.date, lesson.time, lesson.name, student]);
      const tracked = automatic.get(key) ?? [];
      const value = valueAt(rows, row, lesson.column);
      if (value.text === signedText) {
        remove.push(...tracked);
        continue;
      }
      if (!blank(value)) continue;
      if (tracked.length) {
        remove.push(...tracked.slice(1));
        continue;
      }
      if (manual.has(JSON.stringify([lesson.date, lesson.name, student]))) continue;
      add.push({values: {
        '日期': String(Date.parse(lesson.date + 'T00:00:00+08:00')),
        '课程名称': richText(lesson.name),
        '学生姓名': richText(student),
        '填报人': richText('郑奕'),
        '考勤状态': [{id: option.id}],
        '备注': richText(marker + key),
      }});
    }
  }
  if (!dryRun) {
    for (let index = 0; index < add.length; index += 25) {
      const records = add.slice(index, index + 25);
      const result = await call({addRecords: {records}});
      if (result.addRecords?.records?.length !== records.length) throw new Error('缺勤表未确认全部写入。');
    }
    for (let index = 0; index < remove.length; index += 25) {
      await call({deleteRecords: {recordIDs: remove.slice(index, index + 25)}});
    }
  }
  return {lessons: eligible.length, added: add.length, removed: remove.length};
}

export async function client() {
  const config = await credentials();
  config.source_link_id = process.env.SOURCE_LINK_ID || config.source_link_id;
  config.destination_link_id = process.env.DESTINATION_LINK_ID || config.destination_link_id;
  if (!config.client_id || !config.open_id || !config.access_token || !config.source_link_id || !config.destination_link_id) {
    throw new Error('腾讯文档授权或签到表配置不完整。');
  }
  return tencent(config);
}




