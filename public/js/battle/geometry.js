// توابع خالص هندسه‌ی نمایش (بدون وابستگی به DOM/ماژول‌های دیگر) — در Node هم تست می‌شوند.
// مختصات سرور «مطلق» است: بازیکن ۰ پایین و بازیکن ۱ بالا. برای بازیکن ۱ تصویر ۱۸۰ درجه می‌چرخد
// تا همیشه قلمرو خودش پایین صفحه باشد. ورودی‌ها قبل از ارسال به سرور به مختصات مطلق برمی‌گردند.

export function makeView(side, width, height) {
  const flip = side === 1;
  const toView = (x, y) => (flip ? [width - x, height - y] : [x, y]);
  const fromView = toView; // چرخش ۱۸۰° معکوس خودش است
  return { toView, fromView, flip };
}

/** نقطه‌ی پیکسلی (نسبت به گوشه‌ی کانواس) → مختصات تایل در فضای نمایش */
export function pxToTile(px, py, tile) {
  return [px / tile, py / tile];
}

/** قالب mm:ss بدون وابستگی به زبان (قالب‌بندی ارقام در لایه‌ی UI انجام می‌شود) */
export function splitTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return { m: Math.floor(s / 60), s: s % 60 };
}

/** درون‌یابی خطی ساده */
export const lerp = (a, b, t) => a + (b - a) * t;

/** اکسیر پیش‌بینی‌شده‌ی نمایشی: آخرین مقدار سرور + نرخ تولید × زمان سپری‌شده (سقف max) */
export function predictElixir(serverValue, elapsedSec, ratePerSec, max) {
  return Math.min(max, serverValue + Math.max(0, elapsedSec) * ratePerSec);
}
