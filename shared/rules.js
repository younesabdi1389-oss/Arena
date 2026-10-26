// قوانین استقرار — منطق خالص و مشترک.
// سرور مرجع نهایی است؛ مرورگر فقط برای نمایش سبز/قرمز از همین تابع استفاده می‌کند.

import { ARENA } from './config.js';

/** محدوده‌ی مجاز استقرار برای نوع کارت */
export function territoryBounds(owner, type) {
  const margin = 0.5;
  const structureGap = 1.5; // سازه‌ها نباید چسبیده به رودخانه باشند
  const gap = type === 'structure' ? structureGap : 0.3;
  if (owner === 0) {
    return { xMin: margin, xMax: ARENA.width - margin, yMin: ARENA.river.bottom + gap, yMax: ARENA.height - margin };
  }
  return { xMin: margin, xMax: ARENA.width - margin, yMin: margin, yMax: ARENA.river.top - gap };
}

/**
 * @param card تعریف کارت
 * @param owner 0 یا 1
 * @param blockers آرایه‌ی { x, y, radius } از برج‌ها و سازه‌ها
 * @returns {{ok:boolean, code?:string}}
 */
export function checkPlacement(card, owner, x, y, blockers = []) {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { ok: false, code: 'bad_coords' };
  }
  if (x < 0 || x > ARENA.width || y < 0 || y > ARENA.height) return { ok: false, code: 'out_of_bounds' };
  if (card.type === 'spell') return { ok: true };

  const b = territoryBounds(owner, card.type);
  if (x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax) return { ok: false, code: 'bad_territory' };

  const footprint = card.type === 'structure' ? card.radius : 0.5;
  for (const bl of blockers) {
    if (Math.hypot(bl.x - x, bl.y - y) < bl.radius + footprint + 0.2) return { ok: false, code: 'blocked' };
  }
  return { ok: true };
}

/** محدود کردن نقطه به قلمرو (برای چیدمان چند واحد دور نقطه‌ی استقرار) */
export function clampToTerritory(owner, type, x, y) {
  const b = territoryBounds(owner, type);
  return {
    x: Math.min(b.xMax, Math.max(b.xMin, x)),
    y: Math.min(b.yMax, Math.max(b.yMin, y)),
  };
}

/** آیا نقطه روی رودخانه (خارج از پل‌ها) است؟ */
export function bridgeAt(x, margin = 0.2) {
  for (const br of ARENA.bridges) {
    if (Math.abs(x - br.x) <= br.halfWidth - margin) return br;
  }
  return null;
}

export const PLACEMENT_ERRORS = Object.freeze({
  bad_coords: 'Invalid position',
  out_of_bounds: 'Outside the arena',
  bad_territory: 'You can only place in your own territory',
  blocked: 'No room here',
  no_elixir: 'Not enough elixir',
  bad_slot: 'Invalid card',
  battle_over: 'The battle is over',
  rate_limited: 'Too fast! Slow down a little',
  not_in_battle: "You're not in a battle",
});
