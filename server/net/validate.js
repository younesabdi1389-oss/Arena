import { AI_DIFFICULTIES } from '../../shared/config.js';
import { DEFAULT_DECK, validateDeck } from '../../shared/cards.js';

/** دسته‌ی ارسالی کلاینت: اگر نیامده پیش‌فرض، اگر آمده باید معتبر باشد. (در مرحله‌ی ۱ همه‌ی ۱۶ کارت در اختیارند.) */
export function parseDeck(raw) {
  if (raw === undefined || raw === null) return { ok: true, deck: DEFAULT_DECK.slice() };
  if (!validateDeck(raw)) return { ok: false, code: 'bad_deck' };
  return { ok: true, deck: raw.slice() };
}

export function parsePlay(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { slot, x, y } = raw;
  if (!Number.isInteger(slot) || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { slot, x, y };
}

export function parseDifficulty(raw) {
  return AI_DIFFICULTIES.includes(raw) ? raw : 'normal';
}
