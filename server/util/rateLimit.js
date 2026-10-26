// Token bucket ساده برای محدودیت نرخ (درخواست‌های سوکت و HTTP)
export class TokenBucket {
  constructor(capacity, refillPerSec, now = () => Date.now()) {
    this.capacity = capacity;
    this.refill = refillPerSec;
    this.tokens = capacity;
    this.now = now;
    this.last = now();
  }
  take(n = 1) {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refill);
    this.last = t;
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }
}

/** مجموعه‌ای از bucket ها بر اساس کلید (مثلاً IP) با پاک‌سازی دوره‌ای */
export class KeyedLimiter {
  constructor(capacity, refillPerSec) {
    this.capacity = capacity;
    this.refill = refillPerSec;
    this.buckets = new Map();
  }
  take(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = new TokenBucket(this.capacity, this.refill);
      this.buckets.set(key, b);
    }
    return b.take();
  }
  sweep(maxIdleMs = 10 * 60 * 1000) {
    const t = Date.now();
    for (const [k, b] of this.buckets) if (t - b.last > maxIdleMs) this.buckets.delete(k);
  }
}
