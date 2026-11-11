const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const file of ['data.js', 'engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), { filename: file });
}

const byName = name => state.people.find(p => p.name === name);
const pendingPulse = () => state.pulses.find(x => !x.answered && signals(person(x.personId)).level === 'green');

test.beforeEach(() => seed());

test('сценарные сотрудники получают ожидаемый статус', () => {
  assert.equal(signals(byName('Тимур Некрасов')).level, 'red');
  assert.equal(signals(byName('Дарья Фомина')).level, 'red');
  assert.equal(signals(byName('Илья Громов')).level, 'yellow');
  assert.equal(signals(byName('Егор Шубин')).level, 'yellow');
  assert.ok(signals(byName('Полина Рябова')).flags.some(f => f.kind === 'silent'));
});

test('ответ «нет» ставит срочную задачу, проблема держит риск до действий HR', () => {
  const pulse = pendingPulse();
  const p = person(pulse.personId);
  const task = answerPulse(pulse.id, ['yes', 'no', 'yes'], '', today());
  assert.equal(task.kind, 'followup');
  assert.equal(signals(p).level, 'red');
  closeTask(task.id, { outcome: 'problem', reason: REASONS[0] }, today());
  assert.equal(signals(p).level, 'red');
  hrResolve(p.id, 'сделано', today());
  assert.equal(signals(p).level, 'green');
});

test('срочная задача с исходом «всё в порядке» снимает риск', () => {
  const pulse = pendingPulse();
  const task = answerPulse(pulse.id, ['no', 'yes', 'yes'], '', today());
  closeTask(task.id, { outcome: 'ok' }, today());
  assert.equal(signals(person(pulse.personId)).level, 'green');
});

test('ответы без «нет» не создают задачу', () => {
  const pulse = pendingPulse();
  const before = state.tasks.length;
  assert.equal(answerPulse(pulse.id, ['yes', 'partly', 'yes'], '', today()), null);
  assert.equal(state.tasks.length, before);
});

test('пропущенные разговор и опрос через неделю дают «нет контакта»', () => {
  const pulse = pendingPulse();
  state.offset += 7;
  tick();
  const sig = signals(person(pulse.personId));
  assert.equal(sig.level, 'red');
  assert.ok(sig.flags.some(f => f.kind === 'silent'));
});

test('контрольные точки не выдаются дважды', () => {
  const before = state.tasks.length;
  tick();
  assert.equal(state.tasks.length, before);
});
