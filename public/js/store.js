// ذخیره‌ی محلی ترجیحات مرورگر (توکن نشست، دسته‌ی انتخابی، تنظیمات).
// هیچ داده‌ی حساس بازی اینجا مرجع نیست؛ سرور همه‌چیز را اعتبارسنجی می‌کند.
import { DEFAULT_DECK, validateDeck } from '/shared/cards.js';

const KEY = 'arena.v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') || {};
  } catch {
    return {};
  }
}
function write(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    /* حالت خصوصی/پر بودن حافظه: بدون ذخیره ادامه می‌دهیم */
  }
}

let memory = read();

export const store = {
  get token() {
    return memory.token ?? null;
  },
  set token(v) {
    memory = { ...memory, token: v };
    write(memory);
  },
  get name() {
    return memory.name ?? '';
  },
  set name(v) {
    memory = { ...memory, name: v };
    write(memory);
  },
  get deck() {
    return validateDeck(memory.deck) ? memory.deck.slice() : DEFAULT_DECK.slice();
  },
  set deck(v) {
    memory = { ...memory, deck: v.slice() };
    write(memory);
  },
  get reduceFx() {
    return memory.reduceFx ?? (matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  },
  set reduceFx(v) {
    memory = { ...memory, reduceFx: !!v };
    write(memory);
  },
  get musicOn() {
    return memory.musicOn ?? true;
  },
  set musicOn(v) {
    memory = { ...memory, musicOn: !!v };
    write(memory);
  },
  lastPractice: () => memory.lastPractice ?? 'normal',
  setLastPractice(v) {
    memory = { ...memory, lastPractice: v };
    write(memory);
  },
  clearSession() {
    memory = { ...memory, token: null };
    write(memory);
  },
};
