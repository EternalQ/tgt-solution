const WINDOW_DAYS = 90;
const TALK_DAYS = 3;
const PULSE_DAYS = 3;
const FOLLOWUP_DAYS = 2;
const HR_USER_ID = 7;
const B24_GROUP_ID = 12;
const SEED = 20261;
const SEED_RANDOM_PEOPLE = 21;

const CHECKPOINTS = [
  { day: 1, title: 'Первый день', task: 'Встретить, показать рабочее место, назначить наставника', pulse: false },
  { day: 7, title: 'Первая неделя', task: 'Спросить, что непонятно и чего не хватает', pulse: true },
  { day: 30, title: 'Первый месяц', task: 'Сверить ожидания: график, оплата, задачи', pulse: true },
  { day: 60, title: 'Два месяца', task: 'Обсудить нагрузку и планы', pulse: true },
  { day: 85, title: 'Итог испытательного срока', task: 'Дать обратную связь и принять решение до 90-го дня', pulse: false }
];

const QUESTIONS = [
  { text: 'Понятно ли вам, что и как делать на работе?', short: 'непонятны задачи', label: 'Задачи понятны' },
  { text: 'Работа совпала с тем, что обещали при найме: график, оплата, задачи?', short: 'работа не совпала с обещанной', label: 'Совпало с обещанным' },
  { text: 'Есть ли человек, к которому можно обратиться с вопросом?', short: 'не к кому обратиться', label: 'Есть к кому обратиться' }
];

const ANSWERS = { yes: 'Да', partly: 'Частично', no: 'Нет' };

const REASONS = [
  'График и смены',
  'Оплата не совпала с обещанной',
  'Нагрузка',
  'Отношения в коллективе',
  'Не хватает обучения',
  'Условия труда',
  'Другое'
];

const WAREHOUSE = ['Кладовщик', 'Комплектовщик', 'Водитель погрузчика'];
const STORE = ['Продавец-консультант', 'Кассир', 'Администратор зала'];

const UNITS = [
  { dept: 'Склад', unit: 'РЦ «Южный», смена А', managerId: 101, manager: 'Гусев Р. А.', weight: 5, positions: WAREHOUSE },
  { dept: 'Склад', unit: 'РЦ «Южный», смена Б', managerId: 102, manager: 'Тарасова И. В.', weight: 4, positions: WAREHOUSE },
  { dept: 'Магазины', unit: 'Магазин на Садовой', managerId: 103, manager: 'Белова О. Н.', weight: 3, positions: STORE },
  { dept: 'Магазины', unit: 'Магазин в ТЦ «Меридиан»', managerId: 104, manager: 'Кравцов Д. С.', weight: 3, positions: STORE },
  { dept: 'Магазины', unit: 'Магазин на Речной', managerId: 105, manager: 'Юсупова А. Р.', weight: 3, positions: STORE },
  { dept: 'Отдел продаж', unit: 'Оптовые продажи', managerId: 106, manager: 'Мельников П. Г.', weight: 3, positions: ['Менеджер по оптовым продажам', 'Менеджер по работе с клиентами'] },
  { dept: 'Офис', unit: 'Офис', managerId: 107, manager: 'Сорокина Е. Л.', weight: 2, positions: ['Бухгалтер', 'Контент-менеджер', 'Логист', 'Специалист по закупкам'] }
];

const MALE = ['Артём', 'Даниил', 'Кирилл', 'Максим', 'Никита', 'Роман', 'Тимур', 'Егор', 'Илья', 'Олег', 'Руслан', 'Денис'];
const FEMALE = ['Алина', 'Вероника', 'Дарья', 'Ксения', 'Марина', 'Полина', 'Софья', 'Яна', 'Ольга', 'Диана'];
const SURNAMES = ['Абрамов', 'Зайцев', 'Киселёв', 'Лаптев', 'Некрасов', 'Орлов', 'Панов', 'Рябов', 'Савин', 'Тихонов', 'Фомин', 'Шубин', 'Быков', 'Громов', 'Ершов', 'Жуков'];

const SCRIPTED = [
  {
    name: 'Тимур Некрасов', u: 0, position: 'Комплектовщик', daysAgo: 8,
    last: { talk: 'ok', pulse: { answers: ['yes', 'no', 'yes'], comment: 'Обещали график 2/2, по факту шесть смен подряд', delay: 1 } }
  },
  {
    name: 'Полина Рябова', u: 3, position: 'Продавец-консультант', daysAgo: 35,
    last: { talk: 'open', pulse: 'skip' }
  },
  {
    name: 'Дарья Фомина', u: 4, position: 'Кассир', daysAgo: 13,
    last: {
      talk: 'ok',
      pulse: { answers: ['partly', 'yes', 'no'], comment: 'Наставник в отпуске, спросить некого', delay: 1 },
      followup: { outcome: 'problem', reason: 'Не хватает обучения', note: 'Наставник в отпуске до конца месяца, кассу осваивает сама' }
    }
  },
  {
    name: 'Илья Громов', u: 5, position: 'Менеджер по оптовым продажам', daysAgo: 62,
    last: { talk: 'ok', pulse: { answers: ['partly', 'partly', 'yes'], comment: 'План по звонкам вырос вдвое после первого месяца', delay: 1 } }
  },
  {
    name: 'Егор Шубин', u: 1, position: 'Кладовщик', daysAgo: 4,
    last: { talk: 'open' }
  }
];

const HISTORY = {
  byDept: [
    { dept: 'Склад', hired: 41, early: 15 },
    { dept: 'Магазины', hired: 37, early: 11 },
    { dept: 'Отдел продаж', hired: 16, early: 4 },
    { dept: 'Офис', hired: 10, early: 1 }
  ],
  byPeriod: [
    { label: '1-я неделя', n: 9 },
    { label: '2–4-я недели', n: 12 },
    { label: '2-й месяц', n: 6 },
    { label: '3-й месяц', n: 4 }
  ]
};
