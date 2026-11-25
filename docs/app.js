const get = id => document.getElementById(id);
const date = get('date');
const lesson = get('lesson');
const roster = get('roster');
const status = get('feedback');
const refresh = get('refresh');
const demo = !['127.0.0.1', 'localhost'].includes(location.hostname);
let matrix;
let pending = false;
const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format();

function message(text, error = false) {
  status.textContent = text;
  status.toggleAttribute('data-error', error);
}

function sample() {
  const names = ['同学甲', '同学乙', '同学丙', '同学丁', '同学戊', '同学己', '同学庚', '同学辛', '同学壬'];
  return {dates: [today], lessons: ['08:00', '10:10'].map((time, index) => ({
    id: time, date: today, time, name: ['示例课程 A', '示例课程 B'][index],
    roster: names.map((name, i) => ({name, signed: (i + index) % 3 !== 0})),
  }))};
}

async function api(input) {
  const response = await fetch('/api/attendance', input ? {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input),
  } : {cache: 'no-store'});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '腾讯表格请求失败。');
  return result;
}

function select(element, list, preferred) {
  element.replaceChildren(...list.map(([value, label]) => new Option(label, value)));
  if (list.some(([value]) => value === preferred)) element.value = preferred;
}

function showRoster() {
  const current = matrix?.lessons.find(item => item.id === lesson.value);
  roster.replaceChildren();
  if (!current) {
    get('counts').textContent = '';
    return;
  }
  const signed = current.roster.filter(person => person.signed).length;
  const manual = current.roster.filter(person => person.manual).length;
  get('counts').textContent = '已签到 ' + signed + ' · 未签到 ' + (current.roster.length - signed - manual) + (manual ? ' · 手工 ' + manual : '');
  for (const person of current.roster) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'person';
    button.setAttribute('aria-pressed', String(person.signed));
    button.toggleAttribute('data-manual', Boolean(person.manual));
    button.disabled = Boolean(person.manual);
    button.append(document.createTextNode(person.name));
    const detail = document.createElement('small');
    detail.textContent = person.manual ? '手工记录' : person.signed ? '已签到' : '未签到';
    button.append(detail);
    button.addEventListener('click', async () => {
      if (pending) return;
      pending = true;
      refresh.disabled = date.disabled = lesson.disabled = true;
      button.setAttribute('aria-busy', 'true');
      message(demo ? '' : '正在同步腾讯表格…');
      try {
        const signed = !person.signed;
        if (!demo) await api({lessonId: current.id, name: person.name, signed});
        person.signed = signed;
        showRoster();
        [...roster.children].find(tile => tile.firstChild?.textContent === person.name)?.focus();
        message(demo ? '' : '已同步到腾讯表格');
      } catch (error) {
        message(error.message, true);
      } finally {
        button.removeAttribute('aria-busy');
        pending = false;
        refresh.disabled = date.disabled = lesson.disabled = false;
      }
    });
    roster.append(button);
  }
}

function showLessons(preferred) {
  select(lesson, matrix.lessons.filter(item => item.date === date.value).map(item => [item.id, item.time + ' · ' + item.name]), preferred);
  showRoster();
}

async function load() {
  if (pending) return;
  pending = true;
  refresh.disabled = date.disabled = lesson.disabled = true;
  message('正在读取签到情况…');
  try {
    const previous = date.value;
    matrix = demo ? sample() : await api();
    select(date, matrix.dates.map(value => [value, value]), previous || (matrix.dates.includes(today) ? today : matrix.dates.filter(value => value < today).at(-1)));
    showLessons(lesson.value);
    message('');
  } catch (error) {
    message(error.message, true);
  } finally {
    pending = false;
    refresh.disabled = date.disabled = lesson.disabled = false;
  }
}

if (demo) {
  get('mode').hidden = false;
  get('mode').textContent = '演示模式 · 使用示例姓名和课次，点按可预览签到切换。';
  refresh.textContent = '重置演示';
}
refresh.addEventListener('click', load);
date.addEventListener('change', () => { message(''); showLessons(); });
lesson.addEventListener('change', () => { message(''); showRoster(); });
load();
