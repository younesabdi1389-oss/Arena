// تست یکپارچه با Socket.IO و Express واقعی (نیازمند npm install).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../server/app.js';

const server = createGameServer({ port: 0, gameName: 'Test', nodeEnv: 'test', isProd: false, corsOrigins: [], logLevel: 'error' });
const port = await server.listen(0);
const base = `http://127.0.0.1:${port}`;
const sockets = [];
after(async () => {
  sockets.forEach((s) => s.disconnect());
  await server.close();
});

const post = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const guest = async (name) => (await post('/api/guest', { name })).body;
const connect = (token) => {
  const s = io(base, { auth: { token }, reconnection: false, transports: ['websocket'] });
  sockets.push(s);
  return s;
};
const once = (s, ev, ms = 4000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), ms);
    s.once(ev, (d) => { clearTimeout(t); resolve(d); });
  });
const ack = (s, ev, payload) => new Promise((resolve) => s.emit(ev, payload, resolve));

test('ساخت مهمان، اعتبارسنجی نشست و رد توکن نامعتبر', async () => {
  const g = await guest('آرش');
  assert.equal(g.ok, true);
  assert.equal(g.player.name, 'آرش');
  assert.equal((await post('/api/session', { token: g.token })).status, 200);
  assert.equal((await post('/api/session', { token: 'bad' })).status, 401);
  const s = connect('bad');
  const err = await once(s, 'connect_error');
  assert.equal(err.message, 'unauthorized');
});

test('نبرد تمرینی: شروع، snapshot، ورودی نامعتبر رد می‌شود، خروج = باخت', async () => {
  const g = await guest('تمرین');
  const s = connect(g.token);
  await once(s, 'session:ready');
  const started = once(s, 'battle:start');
  assert.equal((await ack(s, 'practice:start', { difficulty: 'easy' })).ok, true);
  const start = await started;
  assert.equal(start.snapshot.you.hand.length, 4);
  assert.equal(start.mode, 'practice');
  await once(s, 'battle:snap');
  assert.equal((await ack(s, 'battle:play', { slot: 9, x: 5, y: 25 })).ok, false);
  assert.equal((await ack(s, 'battle:play', { slot: 0, x: -5, y: 2 })).ok, false); // خارج از میدان (برای هر نوع کارت نامعتبر است)
  const ended = once(s, 'battle:end');
  assert.equal((await ack(s, 'battle:leave')).ok, true);
  const end = await ended;
  assert.equal(end.outcome, 'lose');
  assert.equal(end.reason, 'leave');
});

test('اتاق دوستانه دو بازیکنه و جایگزینی اتصال هم‌حساب', async () => {
  const a = await guest('الف');
  const b = await guest('ب');
  const sa = connect(a.token);
  const sb = connect(b.token);
  await Promise.all([once(sa, 'session:ready'), once(sb, 'session:ready')]);
  const room = await ack(sa, 'room:create', {});
  assert.equal(room.ok, true);
  const [startA, startB] = [once(sa, 'battle:start'), once(sb, 'battle:start')];
  assert.equal((await ack(sb, 'room:join', { code: room.code })).ok, true);
  const [ma, mb] = await Promise.all([startA, startB]);
  assert.deepEqual([ma.side, mb.side], [0, 1]);

  // اتصال دوم با توکن همان حساب: اتصال اول قطع می‌شود و نبرد را از سر می‌گیرد
  const replaced = once(sa, 'session:replaced');
  const sa2 = connect(a.token);
  const resumed = await once(sa2, 'battle:start');
  await replaced;
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.side, 0);
  assert.equal((await ack(sa2, 'battle:leave')).ok, true);
});
