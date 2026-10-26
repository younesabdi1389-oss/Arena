// تست لایه‌ی شبکه‌ای بازی (مسابقه‌یابی، اتاق دوستانه، تمرین، قطع/اتصال مجدد) با سوکت جعلی.
// Socket.IO در این تست‌ها دخیل نیست؛ تست واقعی سوکت در tests/socket.integration.test.js است.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../server/context.js';
import { onPlayerConnected, onPlayerDisconnected } from '../server/net/handlers.js';
import { sanitizeName } from '../server/services/sessionService.js';
import { DEFAULT_DECK } from '../shared/cards.js';

const contexts = [];
function setup(rules) {
  const ctx = createContext({ logLevel: 'error', rules });
  contexts.push(ctx);
  return ctx;
}
after(() => contexts.forEach((c) => c.shutdown()));

function connect(ctx, name) {
  const player = ctx.sessions.createGuest(name);
  const sock = { connected: true, log: [], emit(ev, data) { this.log.push([ev, data]); } };
  player.socket = sock;
  onPlayerConnected(player, ctx);
  return { player, sock, last: (ev) => sock.log.filter(([e]) => e === ev).at(-1)?.[1], all: (ev) => sock.log.filter(([e]) => e === ev).map(([, d]) => d) };
}
const call = (ctx, p, ev, payload) => ctx.handlers[ev](p.player, payload);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('نام مهمان اعتبارسنجی می‌شود', () => {
  assert.equal(sanitizeName('  علی  '), 'علی');
  assert.equal(sanitizeName('a'), null);
  assert.equal(sanitizeName('<script>'), null);
  assert.equal(sanitizeName('x'.repeat(17)), null);
  assert.equal(sanitizeName(42), null);
  const ctx = setup();
  assert.match(ctx.sessions.createGuest('<b>').name, /^Guest \d{4}$/);
});

test('توکن نامعتبر نشست ندارد', () => {
  const ctx = setup();
  assert.equal(ctx.sessions.resolve('nope'), null);
  assert.equal(ctx.sessions.resolve(undefined), null);
  const p = ctx.sessions.createGuest('سارا');
  assert.equal(ctx.sessions.resolve(p.token), p);
});

test('مسابقه‌یابی: دو بازیکن جفت می‌شوند، سمت‌ها متفاوت، وضعیت battle', () => {
  const ctx = setup();
  const a = connect(ctx, 'الف');
  const b = connect(ctx, 'بابک');
  assert.deepEqual(call(ctx, a, 'queue:join', {}), { ok: true });
  assert.equal(a.player.status, 'queue');
  assert.deepEqual(call(ctx, a, 'queue:join', {}), { ok: false, code: 'already_queued' });
  assert.equal(a.last('battle:start'), undefined);
  call(ctx, b, 'queue:join', { deck: DEFAULT_DECK });
  const sa = a.last('battle:start');
  const sb = b.last('battle:start');
  assert.ok(sa && sb);
  assert.equal(sa.battleId, sb.battleId);
  assert.deepEqual([sa.side, sb.side].sort(), [0, 1]);
  assert.equal(sa.opponent.name, 'بابک');
  assert.equal(sa.snapshot.you.hand.length, 4);
  assert.equal(a.player.status, 'battle');
  assert.equal(ctx.battles.rooms.size, 1);
  assert.deepEqual(call(ctx, a, 'queue:join', {}), { ok: false, code: 'busy' });
});

test('مسابقه‌یابی: بازیکن تنها با خودش جفت نمی‌شود؛ لغو و قطع اتصال از صف خارج می‌کند', () => {
  const ctx = setup();
  const a = connect(ctx, 'الف');
  call(ctx, a, 'queue:join', {});
  ctx.matchmaker.tryMatch();
  assert.equal(ctx.battles.rooms.size, 0);
  assert.deepEqual(call(ctx, a, 'queue:leave'), { ok: true });
  assert.equal(a.player.status, 'idle');

  call(ctx, a, 'queue:join', {});
  a.sock.connected = false;
  onPlayerDisconnected(a.player, ctx);
  assert.equal(ctx.matchmaker.queue.length, 0);
  assert.equal(a.player.status, 'idle');
});

test('مسابقه‌یابی: یک بازیکن هرگز هم‌زمان در دو اتاق نیست (۶ بازیکن)', () => {
  const ctx = setup();
  const ps = Array.from({ length: 6 }, (_, i) => connect(ctx, `بازیکن${i}`));
  for (const p of ps) call(ctx, p, 'queue:join', {});
  assert.equal(ctx.battles.rooms.size, 3);
  const ids = ps.map((p) => p.player.battleId);
  assert.equal(new Set(ids).size, 3);
  for (const id of new Set(ids)) assert.equal(ids.filter((x) => x === id).length, 2);
});

test('مسابقه‌یابی: بازه‌ی رتبه با زمان انتظار باز می‌شود (آماده‌ی مرحله‌ی جام)', () => {
  const ctx = setup({}, 0);
  ctx.matchmaker.acceptableDiff = (waitSec) => 100 + waitSec * 25;
  const a = connect(ctx, 'الف');
  const b = connect(ctx, 'بابک');
  ctx.matchmaker.join(a.player, DEFAULT_DECK, 0);
  ctx.matchmaker.join(b.player, DEFAULT_DECK, 1000);
  assert.equal(ctx.battles.rooms.size, 0, 'اختلاف زیاد → فعلاً جفت نمی‌شوند');
  ctx.matchmaker.queue.forEach((q) => (q.since -= 60_000));
  ctx.matchmaker.tryMatch();
  assert.equal(ctx.battles.rooms.size, 1);
});

test('نبرد دوستانه با کد اتاق', () => {
  const ctx = setup();
  const host = connect(ctx, 'میزبان');
  const guest = connect(ctx, 'مهمان');
  const res = call(ctx, host, 'room:create', {});
  assert.equal(res.ok, true);
  assert.match(res.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(host.player.status, 'room');
  assert.deepEqual(call(ctx, host, 'room:join', { code: res.code }), { ok: false, code: 'busy' });
  assert.deepEqual(call(ctx, guest, 'room:join', { code: 'ZZZZZ' }), { ok: false, code: 'room_not_found' });
  assert.deepEqual(call(ctx, guest, 'room:join', { code: 12345 }), { ok: false, code: 'room_not_found' });
  assert.equal(call(ctx, guest, 'room:join', { code: res.code.toLowerCase() }).ok, true);
  assert.equal(host.last('battle:start').mode, 'friendly');
  assert.equal(guest.last('battle:start').battleId, host.last('battle:start').battleId);
  assert.equal(ctx.friendly.rooms.size, 0, 'کد مصرف شده');
  assert.deepEqual(call(ctx, connect(ctx, 'دیگر'), 'room:join', { code: res.code }), { ok: false, code: 'room_not_found' });
});

test('نبرد دوستانه: لغو اتاق و قطع اتصال میزبان', () => {
  const ctx = setup();
  const host = connect(ctx, 'میزبان');
  const { code } = call(ctx, host, 'room:create', {});
  call(ctx, host, 'room:cancel');
  assert.equal(host.player.status, 'idle');
  assert.deepEqual(call(ctx, connect(ctx, 'x1'), 'room:join', { code }), { ok: false, code: 'room_not_found' });

  const h2 = connect(ctx, 'میزبان۲');
  const r2 = call(ctx, h2, 'room:create', {});
  h2.sock.connected = false;
  onPlayerDisconnected(h2.player, ctx);
  assert.deepEqual(call(ctx, connect(ctx, 'x2'), 'room:join', { code: r2.code }), { ok: false, code: 'room_not_found' });
});

test('تمرین با AI: شروع، بازی کارت با اعتبارسنجی، snapshot، پایان با خروج', async () => {
  const ctx = setup();
  const p = connect(ctx, 'تمرین');
  assert.deepEqual(call(ctx, p, 'practice:start', { difficulty: 'hard' }), { ok: true });
  const start = p.last('battle:start');
  assert.equal(start.mode, 'practice');
  assert.equal(start.opponent.ai, true);
  await wait(130);
  assert.ok(p.all('battle:snap').length >= 1, 'snapshot دوره‌ای ارسال می‌شود');

  const hand = start.snapshot.you.hand;
  assert.deepEqual(call(ctx, p, 'battle:play', { slot: 0, x: 9, y: 5 }), { ok: false, code: 'bad_territory' });
  assert.deepEqual(call(ctx, p, 'battle:play', { slot: 'a', x: 9, y: 22 }), { ok: false, code: 'bad_coords' });
  assert.deepEqual(call(ctx, p, 'battle:play', null), { ok: false, code: 'bad_coords' });
  assert.equal(call(ctx, p, 'battle:play', { slot: 7, x: 9, y: 22 }).code, 'bad_slot');
  // کارت ارزان‌ترین دست
  const { CARD_BY_ID } = await import('../shared/cards.js');
  const cheapest = hand.map((id, i) => [CARD_BY_ID[id], i]).sort((a, b) => a[0].cost - b[0].cost)[0];
  const x = cheapest[0].type === 'structure' ? 9 : 4.5;
  const res = call(ctx, p, 'battle:play', { slot: cheapest[1], x, y: 22 });
  assert.equal(res.ok, true, JSON.stringify(res));
  const room = ctx.battles.getForPlayer(p.player);
  room.step();
  room.step();
  const snap = p.all('battle:snap').at(-1);
  assert.ok(snap.e.some((e) => e.o === 0 && e.c === cheapest[0].id), 'کارت بازی‌شده در میدان است');
  assert.notEqual(snap.you.hand[cheapest[1]], cheapest[0].id === hand[cheapest[1]] ? 'x' : '', 'دست چرخیده');

  assert.deepEqual(call(ctx, p, 'battle:emote', { id: 'nope' }), { ok: false });
  assert.deepEqual(call(ctx, p, 'battle:emote', { id: 'nice' }), { ok: true });
  assert.equal(p.last('battle:emote').id, 'nice');

  call(ctx, p, 'battle:leave');
  const end = p.last('battle:end');
  assert.equal(end.outcome, 'lose');
  assert.equal(end.reason, 'leave');
  assert.equal(end.stats.cardsPlayed >= 1, true);
  assert.equal(p.player.status, 'idle');
  assert.equal(ctx.battles.rooms.size, 0);
});

test('بازیکنی که در نبرد نیست نمی‌تواند کارت بازی کند', () => {
  const ctx = setup();
  const p = connect(ctx, 'x');
  assert.deepEqual(call(ctx, p, 'battle:play', { slot: 0, x: 9, y: 22 }), { ok: false, code: 'not_in_battle' });
  assert.deepEqual(call(ctx, p, 'battle:leave'), { ok: false, code: 'not_in_battle' });
});

test('دسته‌ی نامعتبر رد می‌شود', () => {
  const ctx = setup();
  const p = connect(ctx, 'x');
  assert.deepEqual(call(ctx, p, 'queue:join', { deck: ['knight'] }), { ok: false, code: 'bad_deck' });
  assert.deepEqual(call(ctx, p, 'practice:start', { deck: [...DEFAULT_DECK.slice(0, 7), 'hack'] }), { ok: false, code: 'bad_deck' });
  assert.equal(p.player.status, 'idle');
});

test('محدودیت نرخ برای بازی کارت', () => {
  const ctx = setup();
  const p = connect(ctx, 'x');
  call(ctx, p, 'practice:start', {});
  let limited = 0;
  for (let i = 0; i < 20; i++) if (call(ctx, p, 'battle:play', { slot: 0, x: 9, y: 5 }).code === 'rate_limited') limited++;
  assert.ok(limited > 0);
});

test('قطع اتصال: نبرد ادامه دارد، اتصال مجدد در مهلت به همان نبرد برمی‌گردد', async () => {
  const ctx = setup({ reconnectGraceSec: 0.3 });
  const a = connect(ctx, 'الف');
  const b = connect(ctx, 'بابک');
  call(ctx, a, 'queue:join', {});
  call(ctx, b, 'queue:join', {});
  const battleId = a.last('battle:start').battleId;

  a.sock.connected = false;
  onPlayerDisconnected(a.player, ctx);
  await wait(100);
  assert.equal(ctx.battles.get(battleId) !== null, true, 'نبرد هنوز زنده است');
  assert.ok(b.all('battle:snap').length > 0, 'نبرد برای حریف ادامه دارد');

  // اتصال مجدد با سوکت جدید
  const sock2 = { connected: true, log: [], emit(ev, d) { this.log.push([ev, d]); } };
  a.player.socket = sock2;
  onPlayerConnected(a.player, ctx);
  const resumed = sock2.log.find(([e]) => e === 'battle:start')?.[1];
  assert.equal(resumed.battleId, battleId);
  assert.equal(resumed.resumed, true);
  await wait(450);
  assert.ok(ctx.battles.get(battleId), 'مهلت لغو شده؛ باخت ثبت نمی‌شود');
  assert.equal(b.last('battle:end'), undefined);
  assert.equal(a.player.status, 'battle');
});

test('قطع اتصال بیش از مهلت: باخت ثبت می‌شود و برای حریف پیروزی', async () => {
  const ctx = setup({ reconnectGraceSec: 0.15 });
  const a = connect(ctx, 'الف');
  const b = connect(ctx, 'بابک');
  call(ctx, a, 'queue:join', {});
  call(ctx, b, 'queue:join', {});
  a.sock.connected = false;
  onPlayerDisconnected(a.player, ctx);
  await wait(300);
  const endB = b.last('battle:end');
  assert.equal(endB.outcome, 'win');
  assert.equal(endB.reason, 'disconnect');
  assert.equal(a.player.status, 'idle');
  assert.equal(b.player.status, 'idle');
  assert.equal(ctx.battles.rooms.size, 0);
  assert.equal(b.all('battle:end').length, 1, 'نتیجه فقط یک‌بار');
});

test('خروج عمدی در نبرد انسانی: باخت برای خارج‌شونده، برد برای حریف', () => {
  const ctx = setup();
  const a = connect(ctx, 'الف');
  const b = connect(ctx, 'بابک');
  call(ctx, a, 'queue:join', {});
  call(ctx, b, 'queue:join', {});
  call(ctx, a, 'battle:leave');
  assert.equal(a.last('battle:end').outcome, 'lose');
  assert.equal(b.last('battle:end').outcome, 'win');
  assert.equal(b.last('battle:end').reason, 'leave');
  // دوباره می‌تواند وارد صف شود
  assert.deepEqual(call(ctx, a, 'queue:join', {}), { ok: true });
});

test('نبرد تا پایان زمان با ساعت سریع: نتیجه مساوی/برد و پاکسازی کامل', () => {
  const ctx = setup();
  const a = connect(ctx, 'الف');
  const b = connect(ctx, 'بابک');
  call(ctx, a, 'queue:join', {});
  call(ctx, b, 'queue:join', {});
  const room = ctx.battles.getForPlayer(a.player);
  for (let i = 0; i < 20 * 181; i++) room.step();
  assert.equal(a.last('battle:end').outcome, 'draw');
  assert.equal(b.last('battle:end').outcome, 'draw');
  assert.equal(a.last('battle:end').reason, 'time');
  assert.equal(ctx.battles.rooms.size, 0);
});
