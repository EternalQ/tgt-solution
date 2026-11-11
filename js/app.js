const view = document.getElementById('view');
const card = document.getElementById('card');
const toastEl = document.getElementById('toast');
const ui = { dept: '', level: '', managerId: null, personId: null, done: null };
const LEVELS = { red: 'Риск', yellow: 'Внимание', green: 'Норма' };
const ORDER = { red: 0, yellow: 1, green: 2 };
const CP_STATES = {
  ok: { mark: '✓', label: 'пройдена' },
  open: { mark: '…', label: 'в работе' },
  late: { mark: '!', label: 'просрочена' },
  bad: { mark: '✕', label: 'проблема' },
  future: { mark: '', label: 'впереди' }
};
const DIRS = { in: '← событие Б24', out: '→ вызов REST Б24', pulse: '↔ опрос' };
const LOG_LIMIT = 150;
let toastTimer = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function route() {
  const [, tab = 'radar', id] = location.hash.split('/');
  return { tab, id: id ? Number(id) : null };
}

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
}

function options(list, selected, empty) {
  return (empty ? `<option value="">${empty}</option>` : '') +
    list.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

function cpState(p, cp, sig) {
  const task = state.tasks.find(t => t.personId === p.id && t.kind === 'checkpoint' && t.cp === cp.day);
  if (!task) return 'future';
  const flags = sig.flags.filter(f => f.cp === cp.day);
  if (flags.some(f => f.level === 'red')) return 'bad';
  if (flags.length) return 'late';
  const pulse = state.pulses.find(x => x.personId === p.id && x.cp === cp.day);
  return task.closed && (!pulse || pulse.answered) ? 'ok' : 'open';
}

function chip(day, st, title) {
  const s = CP_STATES[st];
  const text = `${title ? `День ${day} · ${title}` : `День ${day}`}: ${s.label}`;
  return `<span class="chip ${st}" role="img" aria-label="${esc(text)}" title="${esc(text)}">${[day, s.mark].filter(Boolean).join(' ') || '&nbsp;'}</span>`;
}

function chips(p, sig) {
  return CHECKPOINTS.map(cp => chip(cp.day, cpState(p, cp, sig), cp.title)).join('');
}

function kpi(value, label, tone) {
  return `<div class="kpi ${tone || ''}"><b>${value}</b><span>${label}</span></div>`;
}

function bars(rows) {
  const max = Math.max(...rows.map(r => r.value));
  return rows.map(r => `
    <div class="bar-row">
      <span class="bar-label">${esc(r.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round(r.value / max * 100)}%"></span></span>
      <span class="bar-value">${esc(r.text)}</span>
    </div>`).join('');
}

function radarView() {
  const now = today();
  const rows = state.people.filter(inWindow)
    .map(p => ({ p, u: UNITS[p.u], sig: signals(p), day: tenure(p) }))
    .sort((a, b) => ORDER[a.sig.level] - ORDER[b.sig.level] || a.day - b.day);
  const count = level => rows.filter(r => r.sig.level === level).length;
  const open = state.tasks.filter(t => !t.closed && inWindow(person(t.personId)));
  const late = open.filter(t => D.diff(now, t.deadline) > 0).length;
  const shown = rows.filter(r => (!ui.dept || r.u.dept === ui.dept) && (!ui.level || r.sig.level === ui.level));
  const depts = [...new Set(UNITS.map(u => u.dept))].map(d => [d, d]);

  return `
  <section class="kpis" aria-label="Сводка">
    ${kpi(rows.length, 'новичков в первых 90 днях')}
    ${kpi(count('red'), 'в зоне риска', 'red')}
    ${kpi(count('yellow'), 'требуют внимания', 'yellow')}
    ${kpi(`${open.length} / ${late}`, 'задач открыто / просрочено')}
  </section>

  <section class="panel">
    <h2>Статистика ухода новичков за 12 месяцев</h2>
    <div class="cols">
      <div><h3>По подразделениям: ушли до 90 дней / принято</h3>${bars(HISTORY.byDept.map(d => ({ label: d.dept, value: d.early / d.hired, text: `${d.early} / ${d.hired} · ${Math.round(d.early / d.hired * 100)}%` })))}</div>
      <div><h3>По сроку ухода, человек</h3>${bars(HISTORY.byPeriod.map(d => ({ label: d.label, value: d.n, text: `${d.n}` })))}</div>
    </div>
  </section>

  <section class="panel">
    <h2>Новички в первых 90 днях</h2>
    <div class="toolbar">
      <select data-filter="dept" aria-label="Подразделение">${options(depts, ui.dept, 'Все подразделения')}</select>
      <select data-filter="level" aria-label="Статус">${options(Object.entries(LEVELS), ui.level, 'Все статусы')}</select>
    </div>
    <div class="scroll"><table class="grid radar">
      <thead><tr><th>Статус</th><th>Сотрудник</th><th>Подразделение и руководитель</th><th>День</th><th>Контрольные точки</th><th>Сигнал</th></tr></thead>
      <tbody>
        ${shown.map(r => `
        <tr data-act="open" data-id="${r.p.id}">
          <td class="status"><span class="level ${r.sig.level}">${LEVELS[r.sig.level]}</span></td>
          <td class="who"><button class="link" data-act="open" data-id="${r.p.id}">${esc(r.p.name)}</button><small>${esc(r.p.position)}</small></td>
          <td class="unit">${esc(r.u.unit)}<small>${esc(r.u.manager)}</small></td>
          <td class="day"><span>${r.day}</span><span class="track"><span style="width:${Math.round(r.day / WINDOW_DAYS * 100)}%"></span></span></td>
          <td class="chips">${chips(r.p, r.sig)}</td>
          <td class="signal">${r.sig.flags.length ? esc(r.sig.flags[0].text) : '<span class="muted">Сигналов нет</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="muted">Никого по этому фильтру</td></tr>'}
      </tbody>
    </table></div>
    <p class="legend">Контрольные точки — дни 1, 7, 30, 60, 85: ${Object.entries(CP_STATES).map(([st, s]) => `${chip('', st)} ${s.label}`).join('')}</p>
  </section>`;
}

function taskLine(t) {
  if (t.closed) {
    const result = t.outcome === 'problem' ? `проблема — ${esc(t.reason)}` : 'всё в порядке';
    const note = t.note ? ` <q>${esc(t.note)}</q>` : '';
    const hr = t.hrClosed ? `<div class="line ok">HR ${D.fmt(t.hrClosed)}: ${esc(t.hrNote)}</div>` : '';
    return `<div class="line ${t.outcome === 'problem' && !t.hrClosed ? 'bad' : 'ok'}">${t.kind === 'followup' ? 'Срочный разговор' : 'Разговор'} проведён ${D.fmt(t.closed)}: ${result}${note}</div>${hr}`;
  }
  const late = D.diff(today(), t.deadline);
  const label = t.kind === 'followup' ? `Срочная задача руководителю: ${esc(t.text)}` : 'Разговор не проведён';
  return `<div class="line ${late > 0 || t.kind === 'followup' ? 'bad' : 'wait'}">${label}, ${late > 0 ? `просрочен на ${late} дн.` : `срок до ${D.fmt(t.deadline)}`}</div>`;
}

function pulseLine(pl) {
  if (!pl.answered) {
    const late = D.diff(today(), pl.deadline) > 0;
    return `<div class="line ${late ? 'late' : 'wait'}">Опрос не пройден, ${late ? 'срок вышел' : `срок до ${D.fmt(pl.deadline)}`} · <a href="#/pulse/${pl.id}">пройти за сотрудника</a></div>`;
  }
  const answers = QUESTIONS.map((q, i) => `<span class="ans ${pl.answers[i]}">${esc(q.label)}: ${ANSWERS[pl.answers[i]]}</span>`).join('');
  const comment = pl.comment ? `<q>${esc(pl.comment)}</q>` : '';
  return `<div class="line">Опрос пройден ${D.fmt(pl.answered)} ${answers} ${comment}</div>`;
}

function cpBlock(p, cp) {
  const tasks = state.tasks.filter(t => t.personId === p.id && t.cp === cp.day);
  const pulse = state.pulses.find(x => x.personId === p.id && x.cp === cp.day);
  if (!tasks.length) {
    return `<li class="future"><b>День ${cp.day} · ${esc(cp.title)}</b><div class="line wait">Наступит ${D.fmt(D.add(p.hired, cp.day - 1))}</div></li>`;
  }
  return `<li><b>День ${cp.day} · ${esc(cp.title)}</b>
    <div class="muted">${esc(cp.task)}</div>
    ${tasks.filter(t => t.kind === 'checkpoint').map(taskLine).join('')}
    ${pulse ? pulseLine(pulse) : ''}
    ${tasks.filter(t => t.kind === 'followup').map(taskLine).join('')}
  </li>`;
}

function cardHtml(p) {
  const u = UNITS[p.u];
  const sig = signals(p);
  const problem = state.tasks.some(t => t.personId === p.id && t.outcome === 'problem' && !t.hrClosed);
  return `
  <div class="card-body">
    <div class="card-head">
      <div>
        <h2 id="card-title">${esc(p.name)}</h2>
        <p>${esc(p.position)} · ${esc(u.unit)} · руководитель ${esc(u.manager)}</p>
        <p class="muted">Принят ${D.fmtFull(p.hired)} · день ${tenure(p)} из ${WINDOW_DAYS}</p>
      </div>
      <button class="ghost" data-act="close-card">Закрыть</button>
    </div>
    <div class="flags">
      ${sig.flags.map(f => `<div class="flag ${f.level}">${esc(f.text)}</div>`).join('') || '<div class="flag green">Сигналов нет</div>'}
    </div>
    ${problem ? `
    <form class="hr" data-form="hr" data-id="${p.id}">
      <label for="hr-note">Что сделано по сигналу</label>
      <div class="row">
        <input id="hr-note" name="note" required placeholder="Например: назначен новый наставник">
        <button>Закрыть сигнал</button>
      </div>
    </form>` : ''}
    <ol class="timeline">${CHECKPOINTS.map(cp => cpBlock(p, cp)).join('')}</ol>
  </div>`;
}

function managerView() {
  const now = today();
  const open = state.tasks.filter(t => !t.closed);
  const load = id => open.filter(t => t.managerId === id).length;
  if (!ui.managerId) ui.managerId = [...UNITS].sort((a, b) => load(b.managerId) - load(a.managerId))[0].managerId;
  const mine = open.filter(t => t.managerId === ui.managerId)
    .sort((a, b) => (a.kind === 'followup' ? 0 : 1) - (b.kind === 'followup' ? 0 : 1) || D.diff(a.deadline, b.deadline));
  const closed = state.tasks.filter(t => t.closed && t.managerId === ui.managerId).sort((a, b) => D.diff(b.closed, a.closed)).slice(0, 8);
  const managers = UNITS.map(u => [u.managerId, `${u.manager} · ${u.unit} · открыто ${load(u.managerId)}`]);

  return `
  <section class="panel">
    <h2>Открытые задачи</h2>
    <div class="toolbar">
      <label for="manager">Руководитель</label>
      <select id="manager" data-filter="managerId">${options(managers, ui.managerId)}</select>
    </div>
    <p class="muted">Так задачи выглядят у руководителя в Битрикс24. Здесь их можно закрыть за него.</p>
    ${mine.map(t => {
      const p = person(t.personId);
      const late = D.diff(now, t.deadline);
      return `
      <article class="task ${t.kind === 'followup' ? 'urgent' : late > 0 ? 'late' : ''}">
        <div class="task-head">
          <b>${esc(t.title)}</b>
          <span>${late > 0 ? `просрочено на ${late} дн.` : `срок до ${D.fmt(t.deadline)}`}</span>
        </div>
        <p>${esc(t.text)}</p>
        <p class="muted">${esc(p.position)} · день ${tenure(p)} из ${WINDOW_DAYS}</p>
        <form class="close" data-form="close" data-id="${t.id}">
          <label><input type="radio" name="outcome" value="ok" checked> Поговорили, всё в порядке</label>
          <label><input type="radio" name="outcome" value="problem"> Есть проблема</label>
          <select name="reason" class="reason" aria-label="Причина">${options(REASONS.map(r => [r, r]))}</select>
          <input name="note" aria-label="Комментарий" placeholder="Комментарий">
          <button>Закрыть задачу</button>
        </form>
      </article>`;
    }).join('') || '<p class="empty">Открытых задач нет</p>'}
  </section>
  <section class="panel">
    <h2>Недавно закрытые</h2>
    ${closed.map(t => `<div class="line ${t.outcome === 'problem' ? 'bad' : 'ok'}">${D.fmt(t.closed)} · ${esc(t.title)} · ${t.outcome === 'problem' ? `проблема — ${esc(t.reason)}` : 'всё в порядке'}</div>`).join('') || '<p class="empty">Пока ничего</p>'}
  </section>`;
}

function pulseList() {
  const now = today();
  const pending = state.pulses.filter(pl => !pl.answered && inWindow(person(pl.personId))).sort((a, b) => D.diff(b.sent, a.sent));
  return `
  <section class="panel narrow">
    <h2>Опросы, которые ждут ответа</h2>
    <p class="muted">Сотрудник получает ссылку в СМС или мессенджере. Аккаунт в Битрикс24 ему не нужен. Откройте любой опрос, чтобы пройти его за сотрудника.</p>
    ${pending.map(pl => {
      const p = person(pl.personId);
      const late = D.diff(now, pl.deadline) > 0;
      return `<a class="pulse-item" href="#/pulse/${pl.id}">
        <span><b>${esc(p.name)}</b><small>${esc(p.position)} · ${esc(UNITS[p.u].unit)}</small></span>
        <span class="${late ? 'late-text' : 'muted'}">день ${pl.cp} · ${late ? 'срок вышел' : `до ${D.fmt(pl.deadline)}`}</span>
      </a>`;
    }).join('') || '<p class="empty">Все опросы пройдены. Нажмите «+7 дней», чтобы наступили новые контрольные точки.</p>'}
  </section>`;
}

function pulseForm(id) {
  const pl = state.pulses.find(x => x.id === id);
  if (!pl) return '<section class="panel narrow"><p class="empty">Опрос не найден. <a href="#/pulse">К списку опросов</a></p></section>';
  const p = person(pl.personId);
  const firstName = esc(p.name.split(' ')[0]);
  if (pl.answered) {
    const mine = ui.done && ui.done.id === id;
    return `
    <section class="phone">
      <h2>Спасибо${mine ? `, ${firstName}` : ''}!</h2>
      <p>${mine ? 'Ответы записаны.' : `Опрос пройден ${D.fmt(pl.answered)}.`}</p>
    </section>
    <p class="solo-note">${mine && ui.done.bad
      ? `Сотрудник этого не видит: руководителю ${esc(UNITS[p.u].manager)} поставлена срочная задача, в радаре статус стал «Риск».`
      : 'Сотрудник этого не видит: ответы появились в его карточке в радаре.'} <a href="#/radar">Открыть радар HR</a></p>`;
  }
  return `
  <p class="solo-note">Так опрос видит сотрудник на телефоне</p>
  <form class="phone" data-form="pulse" data-id="${pl.id}">
    <h2>${firstName}, как вам работается?</h2>
    <p class="muted">3 вопроса, одна минута. Ответы увидят HR и ваш руководитель.</p>
    ${QUESTIONS.map((q, i) => `
    <fieldset>
      <legend>${esc(q.text)}</legend>
      <div class="seg">${Object.entries(ANSWERS).map(([v, t]) => `<label><input type="radio" name="q${i}" value="${v}" required>${t}</label>`).join('')}</div>
    </fieldset>`).join('')}
    <div>
      <label for="pulse-comment">Что мешает больше всего? <span class="muted">Можно не отвечать</span></label>
      <textarea id="pulse-comment" name="comment" rows="2"></textarea>
    </div>
    <button>Отправить</button>
  </form>`;
}

function logView() {
  const rows = state.log.slice(-LOG_LIMIT).reverse();
  return `
  <section class="panel">
    <h2>Обмен с Битрикс24 (мок)</h2>
    <p class="muted">Формат вызовов как у REST API Битрикс24: <code>tasks.task.add</code>, <code>im.notify.system.add</code>, <code>task.commentitem.add</code>, событие <code>ONTASKUPDATE</code>. Запросы никуда не уходят. Показаны последние ${rows.length} из ${state.log.length}.</p>
    <div class="scroll">
      <table class="grid log">
        <thead><tr><th>Дата</th><th>Направление</th><th>Метод</th><th>Данные</th></tr></thead>
        <tbody>${rows.map(e => `<tr><td>${D.fmt(e.at)}</td><td class="dir ${e.dir}">${DIRS[e.dir]}</td><td><code>${esc(e.method)}</code></td><td><code>${esc(JSON.stringify(e.payload))}</code></td></tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function render() {
  const r = route();
  const views = { radar: radarView, manager: managerView, pulse: () => (r.id ? pulseForm(r.id) : pulseList()), log: logView };
  const tab = views[r.tab] ? r.tab : 'radar';
  document.getElementById('clock').textContent = D.fmtFull(today());
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.tab === tab);
    a.toggleAttribute('aria-current', a.dataset.tab === tab);
  });
  view.innerHTML = views[tab]();
  if (ui.personId && card.open) card.innerHTML = cardHtml(person(ui.personId));
}

function commit() {
  Store.save();
  render();
}

function closeCard() {
  ui.personId = null;
  if (card.open) card.close();
}

document.addEventListener('click', e => {
  if (e.target === card) return closeCard();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'open') {
    ui.personId = Number(el.dataset.id);
    card.innerHTML = cardHtml(person(ui.personId));
    card.showModal();
  } else if (act === 'close-card') {
    closeCard();
  } else if (act === 'shift') {
    const days = Number(el.dataset.days);
    const tasks = state.tasks.length;
    const people = state.people.filter(inWindow).length;
    state.offset += days;
    tick();
    commit();
    toast(`Прошло ${days} дн. Новых задач: ${state.tasks.length - tasks}. Прошли 90 дней и вышли из радара: ${people - state.people.filter(inWindow).length}`);
  } else if (act === 'reset') {
    closeCard();
    ui.done = null;
    resetDemo();
    render();
    toast('Демо возвращено к исходному состоянию');
  } else if (act === 'hire') {
    const p = simulateHire();
    commit();
    toast(`Задача приёма закрыта: ${p.name}, ${p.position}. Руководителю ${UNITS[p.u].manager} поставлена задача первого дня`);
  }
});

document.addEventListener('change', e => {
  const key = e.target.dataset.filter;
  if (!key) return;
  ui[key] = key === 'managerId' ? Number(e.target.value) : e.target.value;
  render();
});

document.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const id = Number(form.dataset.id);
  if (form.dataset.form === 'close') {
    closeTask(id, data, today());
    toast(data.outcome === 'problem' ? 'Задача закрыта, сигнал ушёл HR' : 'Задача закрыта');
  } else if (form.dataset.form === 'pulse') {
    const followup = answerPulse(id, QUESTIONS.map((q, i) => data[`q${i}`]), data.comment.trim(), today());
    ui.done = { id, bad: Boolean(followup) };
    if (followup) ui.managerId = followup.managerId;
  } else if (form.dataset.form === 'hr') {
    hrResolve(id, data.note.trim(), today());
    toast('Сигнал закрыт, комментарий добавлен в задачу');
  }
  commit();
});

card.addEventListener('close', () => { ui.personId = null; });
window.addEventListener('hashchange', () => {
  closeCard();
  render();
});

boot();
render();
