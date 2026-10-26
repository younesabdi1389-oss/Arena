// مسابقه‌یابی آنلاین.
// مرحله‌ی ۱: همه‌ی بازیکنان رتبه‌ی یکسان (۰) دارند و اولین دو نفر صف با هم جفت می‌شوند.
// ساختار آماده‌ی مرحله‌ی جام‌هاست: بازیکن «rating» دارد و بازه‌ی قابل‌قبول با زمان انتظار
// بزرگ می‌شود (acceptableDiff)؛ فقط کافی است rating از پروفایل خوانده شود.

export const DEFAULT_ACCEPTABLE_DIFF = (waitSec) => 100 + waitSec * 25;

export class Matchmaker {
  constructor({ battles, log, acceptableDiff = () => Infinity, intervalMs = 1000 }) {
    this.battles = battles;
    this.log = log;
    this.acceptableDiff = acceptableDiff;
    this.queue = [];
    this.timer = null;
    this.intervalMs = intervalMs;
  }

  start() {
    this.timer = setInterval(() => this.tryMatch(), this.intervalMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  join(player, deck, rating = 0) {
    if (player.status === 'queue') return { ok: false, code: 'already_queued' };
    if (player.status !== 'idle') return { ok: false, code: 'busy' };
    player.status = 'queue';
    this.queue.push({ player, deck, rating, since: Date.now() });
    this.tryMatch();
    return { ok: true };
  }

  leave(player) {
    const i = this.queue.findIndex((q) => q.player === player);
    if (i >= 0) this.queue.splice(i, 1);
    if (player.status === 'queue') player.status = 'idle';
    return i >= 0;
  }

  tryMatch() {
    // حذف ورودی‌های نامعتبر (قطع‌شده یا وضعیت عوض‌شده)
    this.queue = this.queue.filter((q) => {
      const ok = q.player.status === 'queue' && q.player.connected;
      if (!ok && q.player.status === 'queue') q.player.status = 'idle';
      return ok;
    });

    const used = new Set();
    for (const a of this.queue) {
      if (used.has(a)) continue;
      const waitA = (Date.now() - a.since) / 1000;
      let best = null;
      for (const b of this.queue) {
        if (b === a || used.has(b) || b.player === a.player) continue;
        const diff = Math.abs(a.rating - b.rating);
        const waitB = (Date.now() - b.since) / 1000;
        if (diff > Math.max(this.acceptableDiff(waitA), this.acceptableDiff(waitB))) continue;
        if (!best || diff < best.diff) best = { b, diff };
      }
      if (best) {
        used.add(a);
        used.add(best.b);
        this._createMatch(a, best.b);
      }
    }
    if (used.size) this.queue = this.queue.filter((q) => !used.has(q));
  }

  _createMatch(a, b) {
    // ترتیب سمت‌ها تصادفی نیست تا هر دو همیشه یک پیکربندی ثابت داشته باشند؛ سمت فقط دید دوربین است.
    this.battles.start({
      mode: 'online',
      entries: [
        { player: a.player, name: a.player.name, deck: a.deck },
        { player: b.player, name: b.player.name, deck: b.deck },
      ],
    });
  }
}
