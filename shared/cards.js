// تعریف داده‌محور کارت‌ها — ۱۶ کارت اولیه: ۱۰ واحد، ۲ طلسم، ۴ سازه.
// همه‌ی نام‌ها، آمار و توضیحات اختصاصی این پروژه هستند.
// برای افزودن کارت جدید فقط یک آبجکت به CARDS اضافه کنید (ساختار توانایی ویژه: فیلد `abilities` رزرو شده است).
//
// واحدها: مسافت‌ها به «تایل»، سرعت به تایل/ثانیه، hitSpeed به ثانیه بین دو حمله.
// range برای فاصله‌ی «لبه تا لبه» است (شعاع دو موجودیت کم می‌شود).

export const RARITIES = Object.freeze({
  common: { en: 'Common', color: '#9aa7b5' },
  rare: { en: 'Rare', color: '#f0993c' },
  epic: { en: 'Epic', color: '#b25be8' },
  legendary: { en: 'Legendary', color: '#ffd23f' },
});

export const CARD_TYPES = Object.freeze({
  unit: { en: 'Unit' },
  spell: { en: 'Spell' },
  structure: { en: 'Structure' },
});

const unit = (o) => ({
  type: 'unit',
  count: 1,
  air: false,
  attacksAir: false,
  attacksGround: true,
  targets: 'any', // 'any' | 'buildings'
  splash: 0,
  abilities: [],
  ...o,
});
const structure = (o) => ({
  type: 'structure',
  attacksAir: false,
  attacksGround: true,
  splash: 0,
  abilities: [],
  ...o,
});
const spell = (o) => ({ type: 'spell', towerDamageMul: 0.35, abilities: [], ...o });

export const CARDS = Object.freeze([
  // ───────── واحدها (۱۰) ─────────
  unit({
    id: 'scout', names: { en: 'Scout' }, icon: '🏃', color: '#8ad06b', rarity: 'common', cost: 1,
    desc: { en: 'Cheap and quick; cycles your hand fast and blocks slow units.' },
    hp: 160, damage: 38, hitSpeed: 0.9, speed: 2.6, range: 0.3, radius: 0.35,
  }),
  unit({
    id: 'wolves', names: { en: 'Mist Wolves' }, icon: '🐺', color: '#9aa4b8', rarity: 'common', cost: 2, count: 3,
    desc: { en: 'Three fast, fragile wolves; sharp tower pressure, weak to area spells.' },
    hp: 150, damage: 42, hitSpeed: 0.8, speed: 2.8, range: 0.3, radius: 0.35,
  }),
  unit({
    id: 'knight', names: { en: 'Dawn Knight' }, icon: '🛡️', color: '#5aa0e6', rarity: 'common', cost: 3,
    desc: { en: 'A balanced ground fighter; solid on defense and a decent mid-lane attacker.' },
    hp: 900, damage: 90, hitSpeed: 1.1, speed: 1.6, range: 0.3, radius: 0.5,
  }),
  unit({
    id: 'archers', names: { en: 'Forest Archers' }, icon: '🏹', color: '#59b85f', rarity: 'common', cost: 3, count: 2,
    attacksAir: true,
    desc: { en: 'Two long-range archers; they hit ground and air but are fragile.' },
    hp: 200, damage: 46, hitSpeed: 1.0, speed: 1.5, range: 5, radius: 0.4,
  }),
  unit({
    id: 'hawk', names: { en: 'Storm Hawk' }, icon: '🦅', color: '#c98f5a', rarity: 'common', cost: 3, air: true,
    targets: 'buildings',
    desc: { en: 'Fast flier; attacks only buildings and towers and cannot damage air units.' },
    hp: 420, damage: 100, hitSpeed: 1.0, speed: 3.0, range: 0.3, radius: 0.45,
  }),
  unit({
    id: 'drake', names: { en: 'Ash Drake' }, icon: '🐲', color: '#e2574c', rarity: 'rare', cost: 3, air: true,
    attacksAir: true,
    desc: { en: 'Short-range flier; both an anti-air answer and a threat to towers.' },
    hp: 480, damage: 62, hitSpeed: 1.0, speed: 2.0, range: 3, radius: 0.5,
  }),
  unit({
    id: 'mage', names: { en: 'Flame Mage' }, icon: '🧙', color: '#e8793a', rarity: 'rare', cost: 4, attacksAir: true,
    splash: 1.3,
    desc: { en: 'Ranged area damage; wipes out small swarms but is fragile itself.' },
    hp: 380, damage: 100, hitSpeed: 1.5, speed: 1.4, range: 5, radius: 0.45,
  }),
  unit({
    id: 'bomber', names: { en: 'Bomber' }, icon: '💣', color: '#6b6f7a', rarity: 'epic', cost: 3,
    splash: 1.5,
    desc: { en: 'Ground artillery; heavy splash damage to ground targets, defenseless against air.' },
    hp: 170, damage: 160, hitSpeed: 1.8, speed: 1.5, range: 4.5, radius: 0.4,
  }),
  unit({
    id: 'golem', names: { en: 'Stone Golem' }, icon: '🗿', color: '#8d7a66', rarity: 'rare', cost: 5, targets: 'buildings',
    desc: { en: 'Slow tank; targets only buildings and needs support behind it.' },
    hp: 2300, damage: 115, hitSpeed: 1.5, speed: 0.95, range: 0.3, radius: 0.8,
  }),
  unit({
    id: 'phoenix', names: { en: 'Golden Phoenix' }, icon: '☀️', color: '#ffc83d', rarity: 'legendary', cost: 5, air: true,
    attacksAir: true, splash: 1.2,
    desc: { en: 'Airborne giant with area damage; powerful but expensive. Flame Mage and Forest Archers are its main answers.' },
    hp: 950, damage: 130, hitSpeed: 1.4, speed: 1.7, range: 2.2, radius: 0.6,
  }),

  // ───────── طلسم‌ها (۲) ─────────
  spell({
    id: 'meteor', names: { en: 'Meteor' }, icon: '☄️', color: '#ff7a3d', rarity: 'epic', cost: 4,
    desc: { en: 'A heavy hit in a small radius; ideal for destroying a single high-value unit.' },
    radius: 2.4, damage: 330, delay: 0.7,
  }),
  spell({
    id: 'hail', names: { en: 'Hailstorm' }, icon: '🌨️', color: '#7fc4f0', rarity: 'common', cost: 3,
    desc: { en: 'Light damage over a wide area; a cheap answer to low-health swarms.' },
    radius: 4, damage: 130, delay: 0.5,
  }),

  // ───────── سازه‌های دفاعی (۴) ─────────
  structure({
    id: 'arrow_tower', names: { en: 'Arrow Tower' }, icon: '🗼', color: '#b08d5b', rarity: 'common', cost: 4,
    attacksAir: true,
    desc: { en: 'All-round long-range defense; lasts 30 seconds and decays over time.' },
    hp: 700, damage: 55, hitSpeed: 0.9, range: 6, radius: 0.9, lifetime: 30,
  }),
  structure({
    id: 'cannon', names: { en: 'Trench Cannon' }, icon: '⚙️', color: '#7b8794', rarity: 'rare', cost: 3,
    desc: { en: 'Anti-ground with heavy hits; cannot fire at air units.' },
    hp: 650, damage: 90, hitSpeed: 1.1, range: 5.5, radius: 0.9, lifetime: 30,
  }),
  structure({
    id: 'den', names: { en: 'Wolf Den' }, icon: '🏚️', color: '#7a5c4a', rarity: 'rare', cost: 4,
    spawn: { token: 'pup', interval: 4.5 },
    desc: { en: 'Spawns a wolf pup every 4.5 seconds; indirect defense and counterattack.' },
    hp: 800, damage: 0, hitSpeed: 1, range: 0, radius: 0.9, lifetime: 30,
  }),
  structure({
    id: 'wall', names: { en: 'Stone Wall' }, icon: '🧱', color: '#a39a8c', rarity: 'common', cost: 2,
    desc: { en: 'No attack; it just draws enemy attention and buys time.' },
    hp: 1100, damage: 0, hitSpeed: 1, range: 0, radius: 0.9, lifetime: 25,
  }),
]);

/** واحدهای کمکی که فقط سازه‌ها تولید می‌کنند (خارج از ۱۶ کارت قابل بازی) */
export const TOKENS = Object.freeze({
  pup: unit({
    id: 'pup', names: { en: 'Wolf Pup' }, icon: '🐕', color: '#b8a58a', rarity: 'common', cost: 0,
    hp: 90, damage: 30, hitSpeed: 0.8, speed: 2.8, range: 0.3, radius: 0.3,
  }),
});

export const CARD_BY_ID = Object.freeze(Object.fromEntries(CARDS.map((c) => [c.id, c])));

export const DEFAULT_DECK = Object.freeze([
  'knight', 'archers', 'wolves', 'golem', 'mage', 'drake', 'meteor', 'arrow_tower',
]);

/** ضریب قدرت بر اساس سطح کارت (سطح ۱ = ۱٫۰). */
export function levelMultiplier(level = 1) {
  const l = Math.max(1, Math.floor(level) || 1);
  return Math.pow(1.1, l - 1);
}

export function cardName(card, locale = 'en') {
  return card.names[locale] ?? card.names.en;
}
export function cardDesc(card, locale = 'en') {
  return card.desc?.[locale] ?? card.desc?.en ?? '';
}

/** اعتبارسنجی دسته: دقیقاً size کارت یکتا و شناخته‌شده */
export function validateDeck(ids, size = 8) {
  if (!Array.isArray(ids) || ids.length !== size) return false;
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== 'string' || !CARD_BY_ID[id] || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}
