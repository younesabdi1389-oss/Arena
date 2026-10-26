import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../server/game/Battle.js';
import { BotController } from '../server/game/BotController.js';
import { Deck } from '../server/game/Deck.js';
import { ARENA, BATTLE, TOWERS } from '../shared/config.js';
import { CARDS, CARD_BY_ID, DEFAULT_DECK, validateDeck, levelMultiplier } from '../shared/cards.js';
import { checkPlacement } from '../shared/rules.js';

const DT = 0.05;
const mk = (opts = {}) =>
  new Battle({
    id: 't',
    seed: opts.seed ?? 7,
    rules: opts.rules,
    players: [
      { name: 'A', deck: opts.deckA ?? DEFAULT_DECK.slice(), levels: opts.levels },
      { name: 'B', deck: opts.deckB ?? DEFAULT_DECK.slice() },
    ],
  });
const run = (b, sec) => {
  for (let i = 0; i < sec / DT && !b.over; i++) b.tick(DT);
};
/** کارت را به جایگاه ۰ دست بازیکن می‌گذارد (دست‌کاری داخلی فقط برای تست) */
const giveCard = (b, owner, id) => {
  const hand = b.players[owner].deck.hand;
  const q = b.players[owner].deck.queue;
  const qi = q.indexOf(id);
  if (qi >= 0) q[qi] = hand[0];
  else {
    const hi = hand.indexOf(id);
    if (hi >= 0) hand[hi] = hand[0];
  }
  hand[0] = id;
};
const tower = (b, owner, role, lane) =>
  [...b.entities.values()].find((e) => e.kind === 'tower' && e.owner === owner && e.role === role && (lane === undefined || e.lane === lane));

// ─────────── کارت‌ها ───────────

test('۱۶ کارت اولیه: ۱۰ واحد، ۲ طلسم، ۴ سازه و کمیابی‌های چهارگانه', () => {
  assert.equal(CARDS.length, 16);
  assert.equal(CARDS.filter((c) => c.type === 'unit').length, 10);
  assert.equal(CARDS.filter((c) => c.type === 'spell').length, 2);
  assert.equal(CARDS.filter((c) => c.type === 'structure').length, 4);
  assert.equal(new Set(CARDS.map((c) => c.id)).size, 16);
  assert.deepEqual([...new Set(CARDS.map((c) => c.rarity))].sort(), ['common', 'epic', 'legendary', 'rare']);
  assert.ok(validateDeck(DEFAULT_DECK));
  assert.ok(!validateDeck(['knight']));
  assert.ok(!validateDeck([...DEFAULT_DECK.slice(0, 7), 'knight']));
  assert.ok(!validateDeck([...DEFAULT_DECK.slice(0, 7), 'not_a_card']));
});

// ─────────── دسته ───────────

test('دسته: دست ۴ تایی، چرخش، قابل بازسازی با seed', () => {
  const d1 = new Deck(DEFAULT_DECK, 99);
  const d2 = new Deck(DEFAULT_DECK, 99);
  assert.deepEqual(d1.hand, d2.hand);
  assert.equal(d1.hand.length, 4);
  assert.equal(d1.queue.length, 4);
  const next = d1.next;
  const played = d1.hand[2];
  assert.equal(d1.play(2), played);
  assert.equal(d1.hand[2], next, 'کارت بعدی جای کارت بازی‌شده می‌نشیند');
  assert.equal(d1.queue.at(-1), played, 'کارت بازی‌شده به انتهای صف می‌رود');
  assert.equal(new Set([...d1.hand, ...d1.queue]).size, 8);
  assert.notDeepEqual(new Deck(DEFAULT_DECK, 1).hand.concat(new Deck(DEFAULT_DECK, 1).queue), new Deck(DEFAULT_DECK, 2).hand.concat(new Deck(DEFAULT_DECK, 2).queue));
});

// ─────────── اکسیر ───────────

test('اکسیر: شروع ۵، تولید خودکار، سقف ۱۰', () => {
  const b = mk();
  assert.equal(b.players[0].elixir, BATTLE.elixir.start);
  run(b, 2.8);
  assert.ok(Math.abs(b.players[0].elixir - 6) < 0.05, `elixir=${b.players[0].elixir}`);
  run(b, 60);
  assert.equal(b.players[0].elixir, BATTLE.elixir.max);
});

test('اکسیر: سرعت تولید و برنامه‌ی ضریب قابل تنظیم است', () => {
  const b = mk({ rules: { elixir: { perSecond: 1, schedule: [{ atSec: 2, multiplier: 2 }] } } });
  run(b, 2);
  assert.ok(Math.abs(b.players[0].elixir - 7) < 0.1);
  run(b, 1);
  assert.ok(Math.abs(b.players[0].elixir - 9) < 0.15);
});

// ─────────── اعتبارسنجی استقرار ───────────

test('استقرار: هزینه، قلمرو، مرز، مانع و اسلات سمت سرور اعتبارسنجی می‌شود', () => {
  const b = mk();
  giveCard(b, 0, 'golem'); // هزینه ۵
  const before = b.players[0].elixir;
  assert.equal(b.playCard(0, 0, 4.5, 22).ok, true);
  assert.ok(Math.abs(b.players[0].elixir - (before - 5)) < 1e-9);
  assert.equal(b.playCard(0, 9, 4.5, 22).code, 'bad_slot');
  assert.equal(b.playCard(0, -1, 4.5, 22).code, 'bad_slot');
  assert.equal(b.playCard(0, 1.5, 4.5, 22).code, 'bad_slot');

  const b2 = mk();
  giveCard(b2, 0, 'knight');
  assert.equal(b2.playCard(0, 0, 4.5, 10).code, 'bad_territory', 'قلمرو دشمن');
  assert.equal(b2.playCard(0, 0, 4.5, 16).code, 'bad_territory', 'روی رودخانه');
  assert.equal(b2.playCard(0, 0, -3, 22).code, 'out_of_bounds');
  assert.equal(b2.playCard(0, 0, NaN, 22).code, 'bad_coords');
  assert.equal(b2.playCard(0, 0, '4', 22).code, 'bad_coords');
  const t = tower(b2, 0, 'princess', 0);
  assert.equal(b2.playCard(0, 0, t.x, t.y).code, 'blocked', 'روی برج');
  assert.equal(b2.players[0].elixir, BATTLE.elixir.start, 'رد شدن نباید اکسیر مصرف کند');
  assert.equal(b2.players[0].deck.hand[0], 'knight', 'رد شدن نباید دست را بچرخاند');

  const b3 = mk({ rules: { elixir: { start: 2 } } });
  giveCard(b3, 0, 'knight');
  assert.equal(b3.playCard(0, 0, 9, 22).code, 'no_elixir');
});

test('استقرار: بازیکن ۱ فقط در نیمه‌ی بالا، سازه‌ها دور از رودخانه، طلسم همه‌جا', () => {
  const b = mk();
  giveCard(b, 1, 'knight');
  assert.equal(b.playCard(1, 0, 9, 22).code, 'bad_territory');
  assert.equal(b.playCard(1, 0, 9, 10).ok, true);
  const card = CARD_BY_ID.cannon;
  assert.equal(checkPlacement(card, 0, 9, 17.5).code, 'bad_territory', 'سازه چسبیده به رودخانه نیست');
  assert.equal(checkPlacement(card, 0, 9, 20).ok, true);
  assert.equal(checkPlacement(CARD_BY_ID.meteor, 0, 9, 5).ok, true);
});

test('ورودی بعد از پایان نبرد رد می‌شود', () => {
  const b = mk();
  b.forfeit(0);
  assert.equal(b.playCard(1, 0, 9, 10).code, 'battle_over');
});

// ─────────── حرکت ───────────

function checkInvariants(b) {
  for (const e of b.entities.values()) {
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `NaN position for ${e.cardId}`);
    assert.ok(e.x >= -0.001 && e.x <= ARENA.width + 0.001 && e.y >= -0.001 && e.y <= ARENA.height + 0.001, `out of arena ${e.cardId} ${e.x},${e.y}`);
    if (e.kind === 'unit' && !e.air && e.y > ARENA.river.top && e.y < ARENA.river.bottom) {
      const onBridge = ARENA.bridges.some((br) => Math.abs(e.x - br.x) <= br.halfWidth + 0.001);
      assert.ok(onBridge, `ground unit ${e.cardId} in river at ${e.x},${e.y}`);
    }
  }
}

test('واحد زمینی فقط از پل عبور می‌کند و به سمت دیگر می‌رسد', () => {
  const b = mk();
  giveCard(b, 0, 'scout');
  // وسط دو مسیر؛ باید نزدیک‌ترین پل را انتخاب کند
  assert.equal(b.playCard(0, 0, 9, 20).ok, true);
  const u = [...b.entities.values()].find((e) => e.kind === 'unit');
  let crossed = false;
  for (let i = 0; i < 20 * 25 && !u.dead; i++) {
    b.tick(DT);
    checkInvariants(b);
    if (u.y < ARENA.river.top) crossed = true;
  }
  assert.ok(crossed || u.dead, 'واحد باید از پل بگذرد یا در راه کشته شود');
});

test('واحد هوایی از روی رودخانه و بدون پل عبور می‌کند', () => {
  const b = mk();
  giveCard(b, 0, 'hawk');
  b.playCard(0, 0, 9, 20);
  const u = [...b.entities.values()].find((e) => e.kind === 'unit');
  let overWaterOffBridge = false;
  for (let i = 0; i < 20 * 8 && !u.dead; i++) {
    b.tick(DT);
    if (u.y > ARENA.river.top && u.y < ARENA.river.bottom && !ARENA.bridges.some((br) => Math.abs(u.x - br.x) <= br.halfWidth)) overWaterOffBridge = true;
  }
  assert.ok(overWaterOffBridge, 'شاهین باید مستقیماً از روی آب بگذرد');
});

// ─────────── هدف‌گیری ───────────

test('هدف‌گیری: زمینی/هوایی و نوع هدف', () => {
  const b = mk();
  const mkU = (owner, id) => b._spawnUnit(owner, CARD_BY_ID[id], 1, 9, owner ? 5 : 25);
  const archers = mkU(0, 'archers');
  const knight = mkU(0, 'knight');
  const golem = mkU(0, 'golem');
  const hawk = mkU(0, 'hawk');
  const enemyDrake = mkU(1, 'drake'); // هوایی
  const enemyKnight = mkU(1, 'knight');
  assert.equal(b._canTarget(archers, enemyDrake), true, 'کماندار به هوایی می‌زند');
  assert.equal(b._canTarget(knight, enemyDrake), false, 'شوالیه به هوایی نمی‌زند');
  assert.equal(b._canTarget(knight, enemyKnight), true);
  assert.equal(b._canTarget(golem, enemyKnight), false, 'غول فقط ساختمان');
  assert.equal(b._canTarget(golem, tower(b, 1, 'king')), true);
  assert.equal(b._canTarget(hawk, enemyDrake), false, 'شاهین به هوایی آسیب نمی‌زند');
  assert.equal(b._canTarget(hawk, enemyKnight), false, 'شاهین فقط ساختمان');
  assert.equal(b._canTarget(knight, mkU(0, 'archers')), false, 'هم‌تیمی هدف نیست');
  const cannon = b._spawnStructure(0, CARD_BY_ID.cannon, 1, 9, 22);
  const arrow = b._spawnStructure(0, CARD_BY_ID.arrow_tower, 1, 6, 22);
  assert.equal(b._canTarget(cannon, enemyDrake), false, 'توپ ضدهوایی نیست');
  assert.equal(b._canTarget(arrow, enemyDrake), true);
  assert.equal(b._canTarget(tower(b, 0, 'princess', 0), enemyDrake), true, 'برج‌ها به هوایی می‌زنند');
});

test('برج به واحد دشمن در برد شلیک می‌کند', () => {
  const b = mk();
  const t = tower(b, 1, 'princess', 0);
  const u = b._spawnUnit(0, CARD_BY_ID.knight, 1, t.x, t.y + 6, 0);
  const hp0 = u.hp;
  run(b, 2);
  assert.ok(u.hp < hp0, 'برج باید آسیب زده باشد');
});

test('آسیب منطقه‌ای (جادوگر) به چند هدف می‌زند', () => {
  const b = mk();
  const mage = b._spawnUnit(0, CARD_BY_ID.mage, 1, 9, 20, 0);
  const e1 = b._spawnUnit(1, CARD_BY_ID.knight, 1, 9, 17.5, 0);
  const e2 = b._spawnUnit(1, CARD_BY_ID.knight, 1, 9.6, 17.5, 0);
  b._attack(mage, e1);
  assert.ok(e1.hp < e1.maxHp && e2.hp < e2.maxHp);
});

// ─────────── طلسم ───────────

test('طلسم: بعد از تأخیر به دشمن در محدوده آسیب می‌زند و به خودی نه؛ برج ضریب کمتر', () => {
  const b = mk();
  const foe = b._spawnUnit(1, CARD_BY_ID.knight, 1, 9, 12, 0);
  const friend = b._spawnUnit(0, CARD_BY_ID.knight, 1, 9.5, 12, 0);
  const far = b._spawnUnit(1, CARD_BY_ID.knight, 1, 15, 12, 0);
  for (const e of b.entities.values()) e.damage = 0; // تا حمله‌ی عادی آزمون طلسم را مخدوش نکند (آسیب طلسم از کارت می‌آید)
  giveCard(b, 0, 'meteor');
  assert.equal(b.playCard(0, 0, 9, 12).ok, true);
  assert.equal(foe.hp, foe.maxHp, 'قبل از تأخیر آسیبی نیست');
  run(b, 0.8);
  assert.ok(foe.hp < foe.maxHp);
  assert.equal(friend.hp, friend.maxHp);
  assert.equal(far.hp, far.maxHp);

  const b2 = mk();
  const k = tower(b2, 1, 'king');
  giveCard(b2, 0, 'meteor');
  b2.playCard(0, 0, k.x, k.y);
  run(b2, 0.8);
  assert.ok(Math.abs(k.hp - (TOWERS.king.hp - 330 * CARD_BY_ID.meteor.towerDamageMul)) < 1);
});

// ─────────── سازه‌ها ───────────

test('سازه: فرسوده می‌شود و پس از عمرش حذف می‌شود؛ لانه واحد تولید می‌کند', () => {
  const b = mk();
  giveCard(b, 0, 'den');
  b.players[0].elixir = 10;
  assert.equal(b.playCard(0, 0, 9, 22).ok, true);
  const den = [...b.entities.values()].find((e) => e.cardId === 'den');
  run(b, 6.5);
  assert.ok([...b.entities.values()].some((e) => e.cardId === 'pup'), 'توله‌گرگ تولید شده');
  assert.ok(den.hp < den.maxHp);
  run(b, 25);
  assert.ok(!b.entities.has(den.id), 'سازه پس از lifetime حذف می‌شود');
});

// ─────────── نتیجه ───────────

test('نابودی برج اصلی = پیروزی فوری', () => {
  const b = mk();
  const k = tower(b, 1, 'king');
  k.hp = 50;
  giveCard(b, 0, 'meteor');
  b.playCard(0, 0, k.x, k.y);
  run(b, 1);
  assert.equal(b.over, true);
  assert.equal(b.result.winner, 0);
  assert.equal(b.result.reason, 'king');
  assert.ok(b.time < 3, 'پیش از پایان زمان تمام شده');
});

test('پایان زمان: برنده بر اساس تعداد برج‌های نابودشده، وگرنه مساوی صریح', () => {
  const b = mk();
  run(b, 179);
  assert.equal(b.over, false);
  run(b, 2);
  assert.equal(b.over, true);
  assert.equal(b.result.winner, null);
  assert.equal(b.result.reason, 'time');

  const b2 = mk();
  const p = tower(b2, 1, 'princess', 0);
  p.hp = 10;
  giveCard(b2, 0, 'meteor');
  b2.playCard(0, 0, p.x, p.y);
  run(b2, 200);
  assert.equal(b2.result.winner, 0);
  assert.equal(b2.result.reason, 'time');
  assert.equal(b2.result.stats[0].towersDestroyed, 1);
});

test('خروج: بازنده‌ی خروج تعیین می‌شود و نتیجه فقط یک‌بار ثبت می‌شود', () => {
  const b = mk();
  b.forfeit(1, 'leave');
  const first = b.result;
  b.forfeit(0, 'leave');
  b.tick(DT);
  assert.equal(b.result, first);
  assert.equal(b.result.winner, 0);
  assert.equal(b.events.filter((e) => e.k === 'end').length, 1);
});

test('سطح کارت قدرت واحد را افزایش می‌دهد', () => {
  const b = mk({ levels: { knight: 3 } });
  giveCard(b, 0, 'knight');
  b.playCard(0, 0, 9, 22);
  const u = [...b.entities.values()].find((e) => e.cardId === 'knight');
  assert.ok(Math.abs(u.maxHp - CARD_BY_ID.knight.hp * levelMultiplier(3)) < 1e-6);
  assert.ok(levelMultiplier(3) > levelMultiplier(1));
});

// ─────────── snapshot و بازسازی ───────────

test('snapshot: اکسیر/دست حریف پنهان است و داده‌ی لازم برای نمایش وجود دارد', () => {
  const b = mk();
  const s = b.snapshotFor(0);
  assert.equal(s.you.hand.length, 4);
  assert.ok(s.you.next);
  assert.deepEqual(Object.keys(s).sort(), ['e', 'left', 't', 'td', 'you']);
  assert.deepEqual(Object.keys(s.you).sort(), ['elixir', 'hand', 'next', 'o']);
  assert.deepEqual(s.you.hand, b.players[0].deck.hand);
  const other = b.snapshotFor(1);
  assert.deepEqual(other.you.hand, b.players[1].deck.hand);
  assert.equal(s.e.filter((e) => e.k === 't').length, 6);
});

test('شبیه‌سازی قطعی است: همان seed و همان ورودی‌ها → همان نتیجه', () => {
  const play = () => {
    const b = mk({ seed: 1234 });
    const bots = [new BotController(b, 0, 'normal', 5), new BotController(b, 1, 'normal', 6)];
    for (let i = 0; i < 20 * 60; i++) {
      bots.forEach((x) => x.update(DT));
      b.tick(DT);
    }
    return JSON.stringify([b.snapshotFor(0), b.playLog]);
  };
  assert.equal(play(), play());
});

// ─────────── fuzz: ربات در برابر ربات ───────────

for (const [d0, d1] of [['easy', 'hard'], ['normal', 'normal'], ['hard', 'hard']]) {
  test(`ربات ${d0} در برابر ${d1}: نبرد کامل بدون NaN/عبور از آب/خروج از میدان`, () => {
    const b = mk({ seed: 31 + d0.length });
    const bots = [new BotController(b, 0, d0, 1), new BotController(b, 1, d1, 2)];
    let maxUnits = 0;
    for (let i = 0; i < 20 * 190 && !b.over; i++) {
      bots.forEach((x) => x.update(DT));
      b.tick(DT);
      if (i % 3 === 0) checkInvariants(b);
      maxUnits = Math.max(maxUnits, b.entities.size);
    }
    assert.equal(b.over, true);
    assert.ok(b.players[0].stats.cardsPlayed >= 8 && b.players[1].stats.cardsPlayed >= 8, 'AI باید کارت بازی کند');
    assert.ok(b.players[0].elixir <= 10 && b.players[0].elixir >= 0);
    assert.ok(maxUnits < 200);
  });
}
