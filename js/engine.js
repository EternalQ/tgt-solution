let state = null;

const DAY_MS = 864e5;

const D = {
  parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  },
  iso: t => new Date(t).toISOString().slice(0, 10),
  add: (s, n) => D.iso(D.parse(s) + n * DAY_MS),
  diff: (a, b) => Math.round((D.parse(a) - D.parse(b)) / DAY_MS),
  fmt: s => `${s.slice(8, 10)}.${s.slice(5, 7)}`,
  fmtFull: s => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`,
  real() {
    const n = new Date();
    return D.iso(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
};

function mulberry32(a) {
  return () => {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const Store = {
  key: 'novichok-demo-v1',
  load() {
    try {
      return JSON.parse(localStorage.getItem(this.key));
    } catch {
      return null;
    }
  },
  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch {}
  }
};

function today() {
  return D.add(state.base, state.offset);
}

function nextId() {
  state.seq += 1;
  return state.seq;
}

function tenure(p, at) {
  return D.diff(at || today(), p.hired) + 1;
}

function inWindow(p) {
  const t = tenure(p);
  return t >= 1 && t <= WINDOW_DAYS;
}

function person(id) {
  return state.people.find(p => p.id === id);
}

function log(at, dir, method, payload) {
  state.log.push({ at, dir, method, payload });
}

function hire(data, at) {
  const p = { id: nextId(), hired: at, ...data };
  log(at, 'in', 'ONTASKUPDATE', { TASK_ID: nextId(), TITLE: `Приём: ${p.name}, ${p.position}`, STATUS: 5 });
  state.people.push(p);
  return p;
}

function addTask(p, fields, at) {
  const task = { id: nextId(), personId: p.id, managerId: UNITS[p.u].managerId, created: at, closed: null, ...fields };
  state.tasks.push(task);
  log(at, 'out', 'tasks.task.add', {
    fields: { TITLE: task.title, DESCRIPTION: task.text, RESPONSIBLE_ID: task.managerId, DEADLINE: task.deadline, GROUP_ID: B24_GROUP_ID }
  });
  return task;
}

function issue(p, cp, at) {
  const task = addTask(p, { kind: 'checkpoint', cp: cp.day, title: `${cp.title}: ${p.name}`, text: cp.task, deadline: D.add(at, TALK_DAYS) }, at);
  let pulse = null;
  if (cp.pulse) {
    pulse = { id: nextId(), personId: p.id, cp: cp.day, sent: at, deadline: D.add(at, PULSE_DAYS), answered: null, answers: null, comment: '' };
    state.pulses.push(pulse);
    log(at, 'pulse', 'Ссылка на опрос', { TO: p.name, CHANNEL: 'СМС или мессенджер', URL: `#/pulse/${pulse.id}` });
  }
  return { task, pulse };
}

function tick() {
  const now = today();
  for (const p of state.people) {
    const t = tenure(p, now);
    for (const cp of CHECKPOINTS) {
      const issued = state.tasks.some(x => x.personId === p.id && x.kind === 'checkpoint' && x.cp === cp.day);
      if (cp.day <= t && !issued) issue(p, cp, D.add(p.hired, cp.day - 1));
    }
  }
}

function closeTask(id, res, at) {
  const t = state.tasks.find(x => x.id === id);
  if (!t || t.closed) return;
  const problem = res.outcome === 'problem';
  Object.assign(t, { closed: at, outcome: problem ? 'problem' : 'ok', reason: problem ? res.reason : '', note: res.note || '' });
  log(at, 'in', 'ONTASKUPDATE', { TASK_ID: t.id, TITLE: t.title, STATUS: 5 });
  if (problem) {
    log(at, 'out', 'im.notify.system.add', { USER_ID: HR_USER_ID, MESSAGE: `${person(t.personId).name}: руководитель подтвердил проблему (${t.reason})` });
  }
}

function answerPulse(id, answers, comment, at) {
  const pl = state.pulses.find(x => x.id === id);
  if (!pl || pl.answered) return null;
  Object.assign(pl, { answered: at, answers, comment: comment || '' });
  const p = person(pl.personId);
  log(at, 'pulse', 'Ответ на опрос', { FROM: p.name, DAY: pl.cp, ANSWERS: answers.map(a => ANSWERS[a]), COMMENT: pl.comment });
  if (!answers.includes('no')) return null;
  const bad = QUESTIONS.filter((q, i) => answers[i] === 'no').map(q => q.short).join(', ');
  const task = addTask(p, {
    kind: 'followup',
    cp: pl.cp,
    pulseId: pl.id,
    title: `Срочно поговорить: ${p.name}`,
    text: `Опрос дня ${pl.cp}, ответ «нет»: ${bad}`,
    deadline: D.add(at, FOLLOWUP_DAYS)
  }, at);
  log(at, 'out', 'im.notify.system.add', { USER_ID: task.managerId, MESSAGE: `${task.title}. ${task.text}` });
  return task;
}

function hrResolve(personId, note, at) {
  for (const t of state.tasks) {
    if (t.personId !== personId || t.outcome !== 'problem' || t.hrClosed) continue;
    t.hrClosed = at;
    t.hrNote = note;
    log(at, 'out', 'task.commentitem.add', { TASKID: t.id, FIELDS: { AUTHOR_ID: HR_USER_ID, POST_MESSAGE: `HR: ${note}` } });
  }
}

function signals(p) {
  const now = today();
  const flags = [];
  const tasks = state.tasks.filter(t => t.personId === p.id);
  const pulses = state.pulses.filter(x => x.personId === p.id);

  for (const t of tasks) {
    const late = D.diff(now, t.deadline);
    if (t.closed) {
      if (t.outcome === 'problem' && !t.hrClosed) {
        flags.push({ level: 'red', cp: t.cp, kind: 'problem', text: `Руководитель подтвердил проблему: ${t.reason}. Ждёт действий HR` });
      }
    } else if (t.kind === 'followup') {
      flags.push({ level: 'red', cp: t.cp, kind: 'no', text: t.text + (late > 0 ? `. Разговор просрочен на ${late} дн.` : '') });
    } else if (late > 0) {
      flags.push({ level: late > 7 ? 'red' : 'yellow', cp: t.cp, kind: 'talk', text: `Разговор дня ${t.cp} просрочен на ${late} дн.` });
    }
  }

  const last = pulses.reduce((a, b) => (!a || b.cp > a.cp ? b : a), null);
  if (last && !tasks.some(t => t.cp > last.cp && t.closed)) {
    if (!last.answered && D.diff(now, last.deadline) > 0) {
      flags.push({ level: 'yellow', cp: last.cp, kind: 'pulse', text: `Опрос дня ${last.cp} не пройден` });
    }
    if (last.answered && !last.answers.includes('no') && last.answers.filter(a => a === 'partly').length >= 2) {
      flags.push({ level: 'yellow', cp: last.cp, kind: 'partly', text: `Опрос дня ${last.cp}: два ответа «частично»` });
    }
  }

  let level = flags.some(f => f.level === 'red') ? 'red' : flags.length ? 'yellow' : 'green';
  if (flags.some(f => f.kind === 'talk') && flags.some(f => f.kind === 'pulse')) {
    level = 'red';
    flags.unshift({ level: 'red', cp: null, kind: 'silent', text: 'Нет контакта: пропущены и разговор, и опрос' });
  }
  flags.sort((a, b) => (a.level === 'red' ? 0 : 1) - (b.level === 'red' ? 0 : 1));
  return { level, flags };
}

function pick(list, rnd) {
  return list[Math.floor(rnd() * list.length)];
}

function pickUnit(rnd) {
  let x = rnd() * UNITS.reduce((s, u) => s + u.weight, 0);
  for (let i = 0; i < UNITS.length; i++) {
    x -= UNITS[i].weight;
    if (x < 0) return i;
  }
  return 0;
}

function makeName(rnd, used) {
  for (;;) {
    const female = rnd() < 0.45;
    const name = `${pick(female ? FEMALE : MALE, rnd)} ${pick(SURNAMES, rnd)}${female ? 'а' : ''}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
}

function seed() {
  const rnd = mulberry32(SEED);
  const now = D.real();
  state = { base: now, offset: 0, seq: 1000, people: [], tasks: [], pulses: [], log: [] };

  const used = new Set(SCRIPTED.map(c => c.name));
  const cases = [...SCRIPTED];
  for (let i = 0; i < SEED_RANDOM_PEOPLE; i++) {
    const u = pickUnit(rnd);
    cases.push({ name: makeName(rnd, used), u, position: pick(UNITS[u].positions, rnd), daysAgo: Math.floor(rnd() * 88) });
  }

  for (const c of cases) {
    const hired = D.add(now, -c.daysAgo);
    const p = hire({ name: c.name, u: c.u, position: c.position }, hired);
    const due = CHECKPOINTS.filter(cp => cp.day <= tenure(p, now));
    due.forEach((cp, i) => {
      const at = D.add(hired, cp.day - 1);
      const age = D.diff(now, at);
      const isLast = i === due.length - 1;
      const script = isLast && c.last ? c.last : {};
      const { task, pulse } = issue(p, cp, at);
      const fresh = age <= TALK_DAYS;

      const talk = script.talk || (!isLast || rnd() < (fresh ? 0.5 : 0.88) ? 'ok' : 'open');
      if (talk === 'ok') closeTask(task.id, { outcome: 'ok' }, D.add(at, Math.min(age, Math.floor(rnd() * 3))));

      if (!pulse) return;
      const plan = script.pulse || (!isLast || rnd() < (fresh ? 0.5 : 0.88) ? 'good' : 'skip');
      if (plan === 'skip') return;
      const answers = plan.answers || QUESTIONS.map(() => (rnd() < 0.1 ? 'partly' : 'yes'));
      const answered = D.add(at, Math.min(age, plan.delay ?? 1 + Math.floor(rnd() * 2)));
      const followup = answerPulse(pulse.id, answers, plan.comment, answered);
      if (followup && script.followup) {
        closeTask(followup.id, script.followup, D.add(answered, Math.min(D.diff(now, answered), FOLLOWUP_DAYS)));
      }
    });
  }

  state.log.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return state;
}

function simulateHire() {
  const used = new Set(state.people.map(p => p.name));
  const u = pickUnit(Math.random);
  const p = hire({ name: makeName(Math.random, used), u, position: pick(UNITS[u].positions, Math.random) }, today());
  tick();
  return p;
}

function boot() {
  state = Store.load() || seed();
  tick();
  Store.save();
}

function resetDemo() {
  Store.clear();
  seed();
  Store.save();
}
