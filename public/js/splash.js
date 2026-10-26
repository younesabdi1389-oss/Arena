// لودینگ اول: فیلم (public/assets/video/loading.mp4 + loading.webm) با صدای خودش و نوار پیشرفت ۱ تا ۱۰۰.
//
// پیشرفت واقعی است، نه تایمر الکی:
//   درصد = کمینه‌ی (پیشرفت پخش فیلم، نسبت کارهای واقعی بارگذاری که تمام شده‌اند)
// کارها با track() ثبت می‌شوند (تصاویر منو، فونت، آماده‌شدن اولین صفحه‌ی بازی). راه‌اندازی بازی
// همزمان با فیلم ادامه دارد و منتظر آن نیست؛ فقط پوشش فیلم تا ۱۰۰٪ بالای صفحه می‌ماند.
//
// Sound: we try to autoplay with sound. If the browser blocks it, a "Tap to start" screen is shown and the first tap starts the film with sound.
// If the player muted music (store.musicOn=false) the film plays silently.
import { n, t } from './i18n.js';
import { store } from './store.js';

const NO_VIDEO_MS = 2600; // اگر فیلم قابل پخش نبود، حداقل این‌قدر نوار را نشان بده
const GRACE_AFTER_VIDEO_MS = 6000; // بعد از پایان فیلم، حداکثر این‌قدر منتظر کارهای عقب‌مانده می‌مانیم
const HARD_LIMIT_MS = 30000;
const FADE_MS = 450;

export function startSplash() {
  const root = document.getElementById('splash');
  let resolveDone;
  const finished = new Promise((r) => (resolveDone = r));
  if (!root) {
    resolveDone();
    return { track: (p) => p, finished };
  }

  const video = root.querySelector('#splash-video');
  const fill = root.querySelector('#splash-fill');
  const pct = root.querySelector('#splash-pct');
  const bar = root.querySelector('#splash-bar');
  const chip = root.querySelector('#splash-sound');
  const t0 = performance.now();

  let total = 0;
  let doneCount = 0;
  let videoState = 'loading'; // loading | playing | ended | none
  let endedAt = 0;
  let shown = 0;
  let last = t0;
  let raf = 0;
  let finishing = false;

  const track = (p) => {
    total += 1;
    Promise.resolve(p)
      .catch(() => {})
      .finally(() => {
        doneCount += 1;
      });
    return p;
  };

  // ───────── فیلم ─────────
  const markNone = () => {
    if (videoState !== 'ended') videoState = 'none';
  };
  video.addEventListener('playing', () => {
    if (videoState !== 'ended') videoState = 'playing';
  });
  video.addEventListener('ended', () => {
    videoState = 'ended';
    endedAt = performance.now();
  });
  video.addEventListener('error', markNone);
  const sources = [...video.querySelectorAll('source')];
  sources[sources.length - 1]?.addEventListener('error', markNone); // همه‌ی منبع‌ها شکست خوردند

  // Browsers refuse to autoplay video WITH sound before the first tap on the page; code cannot override that.
  // So: try with sound first. If it is blocked, show a start screen — the very first tap then begins the film
  // with sound from its first frame (no silent playback, no second prompt). If the player turned music off,
  // the film simply plays muted.
  const begin = async () => {
    video.muted = !store.musicOn;
    try {
      await video.play();
    } catch (err) {
      if (err?.name === 'NotSupportedError') return markNone();
      video.muted = true; // last resort: silent rather than a stuck screen
      try {
        await video.play();
      } catch {
        markNone();
      }
    }
  };
  chip.textContent = `▶ ${t('splash.tapStart')}`;
  const onFirstTap = () => {
    document.removeEventListener('pointerdown', onFirstTap, true);
    document.removeEventListener('keydown', onFirstTap, true);
    chip.hidden = true;
    begin();
  };
  (async () => {
    video.volume = 1;
    video.muted = !store.musicOn;
    try {
      await video.play();
    } catch (err) {
      if (err?.name === 'NotSupportedError') return markNone();
      if (!store.musicOn) return begin();
      video.pause();
      chip.hidden = false; // start screen: waits for the first tap
      document.addEventListener('pointerdown', onFirstTap, true);
      document.addEventListener('keydown', onFirstTap, true);
    }
  })();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && videoState === 'playing' && video.paused && !video.ended) video.play().catch(() => {});
  });

  // ───────── نوار پیشرفت ─────────
  const videoFrac = (now) => {
    if (videoState === 'ended') return 1;
    if (videoState === 'none') return Math.min(1, (now - t0) / NO_VIDEO_MS);
    const d = video.duration;
    return Number.isFinite(d) && d > 0 ? Math.min(1, video.currentTime / d) : 0;
  };
  const taskFrac = () => (total ? Math.min(1, doneCount / total) : 1);

  const paint = () => {
    const v = Math.max(1, Math.min(100, Math.round(shown * 100)));
    fill.style.width = `${v}%`;
    pct.textContent = `${n(v)}%`;
    bar.setAttribute('aria-valuenow', String(v));
  };

  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // بعد از پایان فیلم نباید برای کارهای معطل تا ابد صبر کرد
    if ((videoState === 'ended' && now - endedAt > GRACE_AFTER_VIDEO_MS) || now - t0 > HARD_LIMIT_MS) doneCount = total;
    const target = Math.min(videoFrac(now), taskFrac());
    if (target > shown) shown = Math.min(target, shown + Math.max(0.02, (target - shown) * 4) * dt);
    paint();
    if (shown >= 0.999 && target >= 1) return finish();
    raf = requestAnimationFrame(frame);
  };

  async function finish() {
    if (finishing) return;
    finishing = true;
    cancelAnimationFrame(raf);
    shown = 1;
    paint();
    await new Promise((r) => setTimeout(r, 300)); // نوار پر را لحظه‌ای نشان بده
    root.classList.add('out');
    await new Promise((r) => setTimeout(r, FADE_MS));
    try {
      video.pause();
      video.removeAttribute('src');
      for (const s of sources) s.remove();
      video.load(); // آزادسازی حافظه و صدا
    } catch {
      /* مهم نیست */
    }
    root.remove();
    document.body.classList.remove('splashing');
    document.body.dataset.splash = 'done';
    resolveDone();
  }

  paint();
  raf = requestAnimationFrame(frame);
  return { track, finished };
}
