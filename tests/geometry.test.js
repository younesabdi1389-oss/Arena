// تست توابع خالص نمایش (بدون DOM) — public/js/battle/geometry.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeView, splitTime, predictElixir, lerp } from '../public/js/battle/geometry.js';

test('چرخش دید بازیکن ۱ برگشت‌پذیر است و بازیکن ۰ بدون تغییر', () => {
  const v0 = makeView(0, 18, 32);
  assert.deepEqual(v0.toView(3, 5), [3, 5]);
  const v1 = makeView(1, 18, 32);
  assert.deepEqual(v1.toView(3, 5), [15, 27]);
  const [vx, vy] = v1.toView(3, 5);
  assert.deepEqual(v1.fromView(vx, vy), [3, 5]);
});

test('قلمرو بازیکن ۱ (بالا) در دید خودش پایین صفحه است', () => {
  const v1 = makeView(1, 18, 32);
  const [, vy] = v1.toView(9, 29.5 /* برج اصلی بازیکن ۱ در مختصات مطلق: y = 32 − 29.5 */);
  assert.ok(Math.abs(vy - 2.5) < 1e-9); // بالای صفحه = برج حریف
});

test('زمان و اکسیر پیش‌بینی‌شده', () => {
  assert.deepEqual(splitTime(180), { m: 3, s: 0 });
  assert.deepEqual(splitTime(59.2), { m: 1, s: 0 });
  assert.deepEqual(splitTime(-5), { m: 0, s: 0 });
  assert.equal(predictElixir(9.8, 10, 1 / 2.8, 10), 10);
  assert.ok(Math.abs(predictElixir(5, 2.8, 1 / 2.8, 10) - 6) < 1e-9);
  assert.equal(lerp(0, 10, 0.25), 2.5);
});
