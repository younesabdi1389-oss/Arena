import en from './locales/en.js';

// To add a language: import it here and register it in LOCALES (see locales/en.js for the shape).
const LOCALES = { en };
let current = 'en';

export function setLocale(code) {
  if (!LOCALES[code]) return;
  current = code;
  document.documentElement.lang = code;
  document.documentElement.dir = LOCALES[code].dir;
}

export function locale() {
  return current;
}

/** t('home.welcome', { name }) */
export function t(path, params) {
  let v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), LOCALES[current]);
  if (v === undefined) v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), LOCALES.en);
  if (typeof v !== 'string') return v ?? path;
  return params ? v.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? '')) : v;
}

/** Number formatted for the current locale (Western digits, thousands separators). */
export function n(value, opts) {
  return Number(value).toLocaleString(LOCALES[current].locale, opts);
}

export function errorText(code) {
  return t(`errors.${code}`) === `errors.${code}` ? t('errors.server_error') : t(`errors.${code}`);
}
