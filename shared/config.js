// تنظیمات مرکزی بازی — این فایل هم در سرور و هم در مرورگر import می‌شود.
// هیچ وابستگی Node در این فایل مجاز نیست.
// تمام قوانین قابل تنظیم نبرد اینجا هستند؛ رویدادها/آرناهای آینده می‌توانند
// بخشی از BATTLE را با `rules` override کنند (به Battle.js مراجعه کنید).

function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

/** هندسه میدان؛ واحد: «تایل». بازیکن ۰ پایین صفحه، بازیکن ۱ بالای صفحه. */
export const ARENA = deepFreeze({
  id: 'meadow',
  width: 18,
  height: 32,
  river: { top: 15, bottom: 17 },
  bridges: [
    { x: 4.5, halfWidth: 1.5 },
    { x: 13.5, halfWidth: 1.5 },
  ],
  lanes: [4.5, 13.5],
});

/** قوانین نبرد (قابل override در هر نبرد) */
export const BATTLE = deepFreeze({
  durationSec: 180,
  tickRate: 20, // محاسبات سرور در ثانیه
  snapshotEvery: 2, // هر چند تیک یک snapshot ارسال شود (۱۰ بار در ثانیه)
  elixir: {
    start: 5,
    max: 10,
    perSecond: 1 / 2.8,
    // برنامه‌ی ضریب سرعت تولید: [{ atSec: 120, multiplier: 2 }] — به‌صورت پیش‌فرض خالی
    schedule: [],
  },
  deck: { size: 8, hand: 4 },
  deployTimeSec: 1.0,
  aggroRange: 5.5,
  reconnectGraceSec: 30,
  // رفتار پایان زمان در تساوی تعداد برج‌های نابودشده: 'draw'
  tiebreak: 'draw',
});

/** برج‌ها */
export const TOWERS = deepFreeze({
  princess: { hp: 1400, damage: 55, hitSpeed: 0.8, range: 7.5, radius: 1.2 },
  king: { hp: 2400, damage: 70, hitSpeed: 1.0, range: 7.0, radius: 1.5 },
});

/** چیدمان برج‌ها برای بازیکن owner (۰ پایین، ۱ بالا) */
export function towerLayout(owner) {
  const Y = (y) => (owner === 1 ? ARENA.height - y : y);
  return [
    { role: 'princess', lane: 0, x: ARENA.lanes[0], y: Y(25.5) },
    { role: 'princess', lane: 1, x: ARENA.lanes[1], y: Y(25.5) },
    { role: 'king', lane: null, x: ARENA.width / 2, y: Y(29.5) },
  ];
}

/** ضریب سرعت اکسیر در زمان سپری‌شده‌ی نبرد */
export function elixirRateAt(elapsedSec, rules = BATTLE) {
  let m = 1;
  for (const s of rules.elixir.schedule) if (elapsedSec >= s.atSec) m = s.multiplier;
  return rules.elixir.perSecond * m;
}

/** پیام‌های سریع (چت آزاد وجود ندارد) */
export const EMOTES = deepFreeze([
  { id: 'good_luck', en: 'Good luck!', icon: '🍀' },
  { id: 'nice', en: 'Nice one!', icon: '👏' },
  { id: 'wow', en: 'Wow!', icon: '😮' },
  { id: 'oops', en: 'Oops!', icon: '😅' },
]);

export const AI_DIFFICULTIES = ['easy', 'normal', 'hard'];
