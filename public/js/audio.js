// موسیقی پس‌زمینه‌ی منوها (صفحه‌ی بارگذاری، ورود، خانه، دسته، صف، نتیجه).
// - یک نمونه‌ی Audio برای کل برنامه؛ با رندر دوباره‌ی رابط هرگز از اول پخش نمی‌شود.
// - شروع پخش در پس‌زمینه است و راه‌اندازی بازی منتظرش نمی‌ماند.
// - اگر مرورگر پخش خودکار را ببندد، دکمه‌ی صدا + اولین لمس/کلید کاربر پخش را آغاز می‌کند.
// - هنگام نبرد با محو تدریجی قطع می‌شود و با بازگشت به منوها از همان نقطه ادامه می‌یابد.
// - فایل موسیقی: public/assets/audio/loading.mp3 (نام را در MUSIC_SRC تغییر دهید؛ هر قالب مرورگر‌پسند کار می‌کند).
import { store } from './store.js';

export const MUSIC_SRC = '/assets/audio/loading.mp3';
const TARGET_VOLUME = 0.55;
const FADE_MS = 700;

let audio = null;
let state = 'idle'; // idle | probing | ready | unavailable
let wantPlaying = true; // برنامه با منو (صفحه‌ی بارگذاری) شروع می‌شود
let fadeTimer = 0;
let gestureArmed = false;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(info()));

export function info() {
  return {
    available: state === 'ready',
    enabled: store.musicOn,
    playing: !!audio && !audio.paused,
    blocked: state === 'ready' && store.musicOn && wantPlaying && (!audio || audio.paused),
  };
}
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function fadeTo(volume, then) {
  clearInterval(fadeTimer);
  if (!audio) return;
  const from = audio.volume;
  const t0 = performance.now();
  fadeTimer = setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / FADE_MS);
    try {
      audio.volume = Math.max(0, Math.min(1, from + (volume - from) * p));
    } catch {
      /* برخی مرورگرهای موبایل کنترل ولوم را نمی‌پذیرند (iOS) */
    }
    if (p >= 1) {
      clearInterval(fadeTimer);
      then?.();
    }
  }, 40);
}

async function tryPlay() {
  if (!audio || !wantPlaying || !store.musicOn || document.hidden) return;
  try {
    audio.volume = 0;
    await audio.play();
    fadeTo(TARGET_VOLUME);
    notify();
  } catch (err) {
    // NotAllowedError: پخش خودکار مسدود است ← منتظر اولین اقدام کاربر می‌مانیم
    if (err?.name !== 'AbortError') armGesture();
    notify();
  }
}

function armGesture() {
  if (gestureArmed) return;
  gestureArmed = true;
  const go = () => {
    gestureArmed = false;
    document.removeEventListener('pointerdown', go, true);
    document.removeEventListener('keydown', go, true);
    tryPlay();
  };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('keydown', go, true);
}

/** یک‌بار در شروع برنامه صدا بزنید؛ بدون await. */
export function initMusic() {
  if (state !== 'idle') return;
  state = 'probing';
  // وجود فایل را بدون دانلود کامل بررسی می‌کنیم تا نبودن فایل خطای پخش ایجاد نکند
  fetch(MUSIC_SRC, { method: 'HEAD' })
    .then((r) => {
      if (!r.ok) throw new Error(`music ${r.status}`);
      audio = new Audio(MUSIC_SRC);
      audio.loop = true;
      audio.preload = 'auto';
      audio.addEventListener('error', () => {
        state = 'unavailable';
        notify();
      });
      state = 'ready';
      notify();
      tryPlay();
    })
    .catch(() => {
      state = 'unavailable';
      notify();
    });
  document.addEventListener('visibilitychange', () => {
    if (!audio) return;
    if (document.hidden) audio.pause();
    else tryPlay();
  });
}

/** منو (true) یا نبرد (false) */
export function setMenuActive(active) {
  wantPlaying = active;
  if (!audio) return notify();
  if (active) tryPlay();
  else fadeTo(0, () => audio.pause());
  notify();
}

export function setMusicEnabled(on) {
  store.musicOn = on;
  if (!audio) return notify();
  if (on) tryPlay();
  else fadeTo(0, () => audio.pause());
  notify();
}

/** برای دکمه‌ی صدا: اگر مسدود بود پخش را شروع می‌کند، وگرنه خاموش/روشن می‌کند. */
export function toggleMusic() {
  const i = info();
  if (i.enabled && i.blocked) return tryPlay();
  setMusicEnabled(!i.enabled);
}
