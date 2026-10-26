// رندر Canvas میدان نبرد + نگه‌داری وضعیت نمایشی (درون‌یابی snapshot ها و افکت‌ها).
// این کلاس هیچ منطق بازی‌ای ندارد؛ فقط آنچه سرور گزارش کرده را نمایش می‌دهد.
import { ARENA, TOWERS } from '/shared/config.js';
import { CARD_BY_ID, TOKENS } from '/shared/cards.js';
import { territoryBounds, checkPlacement } from '/shared/rules.js';
import { makeView, lerp } from './geometry.js';

const W = ARENA.width;
const H = ARENA.height;
// حاشیه‌ی بالا/پایین بوم برای اجزای بلند (پرچم و نوار سلامت برج‌های ردیف بالا) — فقط نمایشی است
const PAD_T = 2.4;
const PAD_B = 0.4;
const PAD_X = 1.3; // حاشیه‌ی کناری تزئینی (صخره، بوته، مشعل، پرچم)
const INTERP_DELAY = 110; // ms — کمی بیشتر از فاصله‌ی دو snapshot (۱۰۰ms) برای حرکت نرم
const MINE = '#3d8bff';
const THEIRS = '#ff4d5a';

const cardDef = (id) => CARD_BY_ID[id] ?? TOKENS[id];

export class BattleView {
  constructor(canvas, { reduceFx = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.reduceFx = reduceFx;
    this.side = 0;
    this.view = makeView(0, W, H);
    this.prev = null; // { at, map }
    this.curr = null;
    this.known = new Map(); // id → آخرین موقعیت/مشخصات شناخته‌شده (برای افکت‌هایی که به موجودیت‌های تازه‌مرده اشاره می‌کنند)
    this.fx = []; // افکت‌های زمان‌دار
    this.flash = new Map(); // id → زمان پایان فلش آسیب
    this.lunge = new Map(); // id → زمان پایان حرکت حمله
    this.lastHp = new Map();
    this.selected = null; // کارت انتخاب‌شده برای نمایش محدوده‌ی مجاز
    this.hover = null; // مختصات مطلق نشانگر
    this.tile = 10;
    this.bg = null;
    this.raf = 0;
    this.running = false;
    this.dpr = 1;
  }

  // ───────────────────────── چرخه‌ی حیات ─────────────────────────

  start(side, snapshot) {
    this.side = side;
    this.view = makeView(side, W, H);
    this.prev = null;
    this.curr = null;
    this.known.clear();
    this.fx.length = 0;
    this.flash.clear();
    this.lunge.clear();
    this.lastHp.clear();
    this.selected = null;
    this.hover = null;
    this.pushSnapshot(snapshot);
    this.bg = null; // the background depends on the side being viewed
    this.resize();
    if (!this.running) {
      this.running = true;
      const loop = (ts) => {
        if (!this.running) return;
        this.draw(ts);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** اندازه‌ی بوم متناسب با فضای موجود با حفظ نسبت ۱۸:۳۲ */
  resize() {
    const wrap = this.canvas.parentElement;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    if (!availW || !availH) return;
    const tile = Math.max(6, Math.floor(Math.min(availW / (W + 2 * PAD_X), availH / (H + PAD_T + PAD_B)) * 100) / 100);
    const dpr = Math.min(window.devicePixelRatio || 1, this.reduceFx ? 1.25 : 2);
    const cw = Math.round((W + 2 * PAD_X) * tile * dpr);
    const ch = Math.round((H + PAD_T + PAD_B) * tile * dpr);
    // ResizeObserver, window resize and start() often arrive with an unchanged size; resetting the canvas
    // (which clears it) and rebuilding the cached background would be wasted work
    if (cw === this.canvas.width && ch === this.canvas.height && tile === this.tile) return;
    this.tile = tile;
    this.dpr = dpr;
    this.canvas.style.width = `${(W + 2 * PAD_X) * tile}px`;
    this.canvas.style.height = `${(H + PAD_T + PAD_B) * tile}px`;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.bg = null; // پس‌زمینه با اندازه‌ی جدید دوباره ساخته می‌شود
  }

  // ───────────────────────── ورودی از سرور ─────────────────────────

  pushSnapshot(snap) {
    const now = performance.now();
    const map = new Map();
    for (const e of snap.e) {
      map.set(e.i, e);
      this.known.set(e.i, { x: e.x, y: e.y, c: e.c, k: e.k, o: e.o, a: e.a });
      const last = this.lastHp.get(e.i);
      if (last !== undefined && e.h < last) this.flash.set(e.i, now + 120);
      this.lastHp.set(e.i, e.h);
    }
    this.prev = this.curr;
    this.curr = { at: now, map, snap };
    if (snap.ev?.length) this.handleEvents(snap.ev, now);
  }

  handleEvents(events, now) {
    const lim = this.reduceFx ? 40 : 120;
    for (const ev of events) {
      if (this.fx.length > lim) break;
      switch (ev.k) {
        case 'atk': {
          const a = this.known.get(ev.a);
          const b = this.known.get(ev.b);
          if (!a || !b) break;
          if (ev.r) this.fx.push({ type: 'shot', from: [a.x, a.y], to: [b.x, b.y], t0: now, dur: 220, air: !!b.a, splash: !!ev.s, mine: a.o === this.side });
          else {
            this.lunge.set(ev.a, now + 160);
            this.fx.push({ type: 'spark', x: b.x, y: b.y, t0: now, dur: 200, mine: a.o === this.side });
          }
          break;
        }
        case 'spellCast':
          this.fx.push({ type: 'telegraph', x: ev.x, y: ev.y, r: ev.r, t0: now, dur: ev.d * 1000, color: CARD_BY_ID[ev.c]?.color ?? '#fff' });
          break;
        case 'spellHit':
          this.fx.push({ type: 'blast', x: ev.x, y: ev.y, r: ev.r, t0: now, dur: 450, color: CARD_BY_ID[ev.c]?.color ?? '#fff' });
          break;
        case 'spawn':
          this.fx.push({ type: 'ring', x: ev.x, y: ev.y, t0: now, dur: 450, color: ev.o === this.side ? MINE : THEIRS });
          break;
        case 'die':
          this.fx.push({ type: 'puff', x: ev.x, y: ev.y, t0: now, dur: ev.t === 'tower' ? 900 : 420, big: ev.t === 'tower' });
          this.known.delete(ev.id);
          break;
        default:
          break;
      }
    }
  }

  // ───────────────────────── ورودی کاربر ─────────────────────────

  /** نقطه‌ی کلاینت (clientX/Y) → مختصات مطلق تایل؛ null اگر بیرون از بوم باشد */
  clientToWorld(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    const vx = ((cx - r.left) / r.width) * (W + 2 * PAD_X) - PAD_X;
    const vy = ((cy - r.top) / r.height) * (H + PAD_T + PAD_B) - PAD_T;
    if (vy < 0 || vy > H || vx < 0 || vx > W) return null;
    const [x, y] = this.view.fromView(vx, vy);
    return { x, y };
  }

  setSelected(card) {
    this.selected = card;
    if (!card) this.hover = null;
  }

  setHover(pt) {
    this.hover = pt;
  }

  /** مانع‌های فعلی برای پیش‌نمایش معتبر/نامعتبر (فقط تجربه‌ی کاربری؛ سرور دوباره بررسی می‌کند) */
  blockers() {
    const out = [];
    if (!this.curr) return out;
    for (const e of this.curr.map.values()) {
      if (e.z) continue;
      if (e.k === 't') out.push({ x: e.x, y: e.y, radius: TOWERS[e.c].radius });
      else if (e.k === 's') out.push({ x: e.x, y: e.y, radius: CARD_BY_ID[e.c]?.radius ?? 0.9 });
    }
    return out;
  }

  placementOk(card, pt) {
    return checkPlacement(card, this.side, pt.x, pt.y, this.blockers()).ok;
  }

  // ───────────────────────── رندر ─────────────────────────

  /** موقعیت درون‌یابی‌شده‌ی موجودیت */
  _pos(e, alpha) {
    if (!this.prev || alpha >= 1) return [e.x, e.y];
    const p = this.prev.map.get(e.i);
    return p ? [lerp(p.x, e.x, alpha), lerp(p.y, e.y, alpha)] : [e.x, e.y];
  }

  draw(ts) {
    if (!this.curr) return;
    const ctx = this.ctx;
    const k = this.tile * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.bg) this._buildBackground(k);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(1, 0, 0, 1, PAD_X * k, PAD_T * k); // از اینجا به بعد مختصات = دنیای بازی (تایل × k)

    const now = performance.now();
    const span = this.prev ? Math.max(1, this.curr.at - this.prev.at) : 1;
    // موقعیت در لحظه‌ی (now - INTERP_DELAY) بین prev و curr
    const t = this.prev ? Math.min(1, Math.max(0, (now - INTERP_DELAY - this.prev.at) / span)) : 1;

    this._water(ctx, k, ts);
    if (this.selected) this._territory(ctx, k);

    // مرتب‌سازی بر اساس y نمایش تا عمق ۲.۵بعدی درست باشد؛ هوایی‌ها آخر
    const items = [];
    for (const e of this.curr.map.values()) {
      const [x, y] = this._pos(e, t);
      const [vx, vy] = this.view.toView(x, y);
      items.push({ e, x, y, vx, vy });
    }
    items.sort((p, q) => (p.e.a ? 1 : 0) - (q.e.a ? 1 : 0) || p.vy - q.vy);

    for (const it of items) if (!it.e.a) this._shadow(ctx, k, it);
    for (const it of items) {
      if (it.e.k === 't') this._tower(ctx, k, it, now);
      else if (it.e.k === 's') this._structure(ctx, k, it, now);
      else if (!it.e.a) this._unit(ctx, k, it, now, ts);
    }
    for (const it of items) if (it.e.a) this._shadow(ctx, k, it);
    for (const it of items) if (it.e.a) this._unit(ctx, k, it, now, ts);

    this._effects(ctx, k, now);
    if (this.selected && this.hover) this._ghost(ctx, k, ts);
  }

  // ───────────── پس‌زمینه‌ی ثابت (یک‌بار روی بوم مخفی) ─────────────

  _buildBackground(k) {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.translate(PAD_X * k, PAD_T * k);
    const V = (x, y) => this.view.toView(x, y).map((v) => v * k);

    // چمن دو نیمه با رنگ متفاوت (قلمرو من روشن‌تر)
    const grass = (y0, y1, c0, c1) => {
      const gr = g.createLinearGradient(0, y0 * k, 0, y1 * k);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      g.fillStyle = gr;
      g.fillRect(-PAD_X * k, y0 * k, (W + 2 * PAD_X) * k, (y1 - y0) * k);
    };
    grass(-PAD_T, ARENA.river.top, '#3f8f4a', '#4da357');
    grass(ARENA.river.bottom, H + PAD_B, '#4da357', '#3f8f4a');

    // کاشی‌های چمن (شطرنجی ملایم) برای عمق و خوانایی مختصات
    g.fillStyle = '#0a3a1a';
    for (let ty = 0; ty < H; ty++) {
      if (ty >= ARENA.river.top && ty < ARENA.river.bottom) continue;
      for (let tx = 0; tx < W; tx++) {
        g.globalAlpha = (tx + ty) % 2 ? 0.09 : 0;
        if (g.globalAlpha) g.fillRect(tx * k, ty * k, k, k);
      }
    }
    g.globalAlpha = 1;
    // نور ملایم مرکز هر نیمه
    for (const cy of [8, 24]) {
      const rg = g.createRadialGradient((W / 2) * k, cy * k, 0, (W / 2) * k, cy * k, 12 * k);
      rg.addColorStop(0, 'rgba(255,255,200,0.14)');
      rg.addColorStop(1, 'rgba(255,255,200,0)');
      g.fillStyle = rg;
      g.fillRect(0, (cy - 12) * k, W * k, 24 * k);
    }

    // مسیر خاکی دو لاین (از برج‌ها تا پل‌ها) با لبه و کاشی
    const lane = (xa, ya, xb, yb) => {
      const [x0, y0] = V(xa, ya);
      const [x1, y1] = V(xb, yb);
      const lx = Math.min(x0, x1);
      const ly = Math.min(y0, y1);
      const lw = Math.abs(x1 - x0);
      const lh = Math.abs(y1 - y0);
      g.fillStyle = '#d8b878cc';
      g.fillRect(lx, ly, lw, lh);
      g.strokeStyle = '#8a6a3a88';
      g.lineWidth = 0.08 * k;
      g.strokeRect(lx, ly, lw, lh);
      g.strokeStyle = '#8a6a3a33';
      g.lineWidth = 0.04 * k;
      for (let yy = ly + k; yy < ly + lh; yy += k) { g.beginPath(); g.moveTo(lx, yy); g.lineTo(lx + lw, yy); g.stroke(); }
    };
    for (const lx of ARENA.lanes) {
      lane(lx - 1.3, 0.5, lx + 1.3, ARENA.river.top);
      lane(lx - 1.3, ARENA.river.bottom, lx + 1.3, H - 0.5);
    }

    // دانه‌های تزئینی ثابت (سبزه) با seed ثابت: عمق بصری
    let s = 12345;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.fillStyle = '#ffffff14';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      if (y > ARENA.river.top - 0.5 && y < ARENA.river.bottom + 0.5) continue;
      g.beginPath();
      g.arc(x * k, y * k, (0.08 + rnd() * 0.12) * k, 0, 7);
      g.fill();
    }

    // پل‌ها
    for (const b of ARENA.bridges) {
      const [x0, y0] = V(b.x - b.halfWidth, ARENA.river.top - 0.3);
      const [x1, y1] = V(b.x + b.halfWidth, ARENA.river.bottom + 0.3);
      const bx = Math.min(x0, x1);
      const by = Math.min(y0, y1);
      const bw = Math.abs(x1 - x0);
      const bh = Math.abs(y1 - y0);
      g.fillStyle = '#00000044';
      g.fillRect(bx + 0.12 * k, by + 0.2 * k, bw, bh);
      const wood = g.createLinearGradient(0, by, 0, by + bh);
      wood.addColorStop(0, '#b8895a');
      wood.addColorStop(1, '#8a5f38');
      g.fillStyle = wood;
      g.fillRect(bx, by, bw, bh);
      g.strokeStyle = '#5b3a1f';
      g.lineWidth = Math.max(1, 0.05 * k);
      for (let y = by + 0.5 * k; y < by + bh; y += 0.55 * k) {
        g.beginPath();
        g.moveTo(bx, y);
        g.lineTo(bx + bw, y);
        g.stroke();
      }
      g.fillStyle = '#6e4a2a';
      g.fillRect(bx - 0.12 * k, by, 0.24 * k, bh);
      g.fillRect(bx + bw - 0.12 * k, by, 0.24 * k, bh);
    }

    // ساحل سنگی رودخانه
    for (const y of [ARENA.river.top - 0.35, ARENA.river.bottom]) {
      g.fillStyle = '#b9ad94';
      g.fillRect(-PAD_X * k, y * k, (W + 2 * PAD_X) * k, 0.35 * k);
      g.fillStyle = '#ffffff55';
      g.fillRect(-PAD_X * k, y * k, (W + 2 * PAD_X) * k, 0.08 * k);
    }
    this._sideDecor(g, k);

    // تزئینات حاشیه‌ی بالا و پایین: جشنواره با پرچم‌های رنگی و چراغ‌های طلایی
    const deco = (y0, y1) => {
      const gr = g.createLinearGradient(0, y0 * k, 0, y1 * k);
      gr.addColorStop(0, '#2a1666');
      gr.addColorStop(1, '#5a2aa8');
      g.fillStyle = gr;
      g.fillRect(-PAD_X * k, Math.min(y0, y1) * k, (W + 2 * PAD_X) * k, Math.abs(y1 - y0) * k);
    };
    deco(-PAD_T, -0.05);
    deco(H + 0.05, H + PAD_B);
    for (let i = -PAD_X * 2; i < (W + PAD_X) * 2; i++) {
      const x = i * 0.5 + 0.25;
      g.fillStyle = i % 3 === 0 ? '#ffd34d' : i % 3 === 1 ? '#ff5a6a' : '#54e6ff';
      g.beginPath();
      g.moveTo((x - 0.22) * k, -1.25 * k);
      g.lineTo((x + 0.22) * k, -1.25 * k);
      g.lineTo(x * k, -0.7 * k);
      g.fill();
    }
    g.strokeStyle = '#ffffff99';
    g.lineWidth = 0.05 * k;
    g.beginPath();
    g.moveTo(-PAD_X * k, -1.25 * k);
    g.lineTo((W + PAD_X) * k, -1.25 * k);
    g.stroke();
    g.fillStyle = '#ffe27a';
    for (let i = -PAD_X * 2; i < (W + PAD_X) * 2; i++) {
      g.beginPath();
      g.arc((i * 0.5 + 0.25) * k, -0.3 * k, 0.1 * k, 0, 7);
      g.fill();
    }
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 0.14 * k;
    g.beginPath();
    g.moveTo(-PAD_X * k, -0.02 * k);
    g.lineTo((W + PAD_X) * k, -0.02 * k);
    g.moveTo(-PAD_X * k, (H + 0.02) * k);
    g.lineTo((W + PAD_X) * k, (H + 0.02) * k);
    g.stroke();

    // نرده و چراغ پل‌ها
    for (const b of ARENA.bridges) {
      const [x0] = V(b.x - b.halfWidth, 0);
      const [x1] = V(b.x + b.halfWidth, 0);
      for (const bx of [Math.min(x0, x1), Math.max(x0, x1)]) {
        g.fillStyle = '#5b3a1f';
        g.fillRect(bx - 0.1 * k, (ARENA.river.top - 0.3) * k, 0.2 * k, (ARENA.river.bottom - ARENA.river.top + 0.6) * k);
        for (const yy of [ARENA.river.top - 0.3, ARENA.river.bottom + 0.3]) {
          // پایه‌ی سنگی با نگین طلایی
          const sz = 0.95 * k;
          const sg = g.createLinearGradient(bx - sz / 2, yy * k - sz / 2, bx + sz / 2, yy * k + sz / 2);
          sg.addColorStop(0, '#d8d2c6');
          sg.addColorStop(1, '#8d8678');
          g.fillStyle = '#00000044';
          g.fillRect(bx - sz / 2 + 0.1 * k, yy * k - sz / 2 + 0.16 * k, sz, sz);
          g.fillStyle = sg;
          g.fillRect(bx - sz / 2, yy * k - sz / 2, sz, sz);
          g.strokeStyle = '#4a463d';
          g.lineWidth = 0.06 * k;
          g.strokeRect(bx - sz / 2, yy * k - sz / 2, sz, sz);
          g.fillStyle = '#ffd34d';
          g.beginPath();
          g.moveTo(bx, yy * k - 0.22 * k);
          g.lineTo(bx + 0.18 * k, yy * k);
          g.lineTo(bx, yy * k + 0.22 * k);
          g.lineTo(bx - 0.18 * k, yy * k);
          g.fill();
        }
      }
    }

    // خط میانی قلمرو (روی پل‌ها هم نامحسوس)
    g.setLineDash([0.4 * k, 0.4 * k]);
    g.strokeStyle = '#ffffff22';
    g.lineWidth = 0.06 * k;
    g.beginPath();
    g.moveTo(0, (H / 2) * k);
    g.lineTo(W * k, (H / 2) * k);
    g.stroke();
    g.setLineDash([]);

    // قاب بیرونی
    g.strokeStyle = '#00000066';
    g.lineWidth = 0.15 * k;
    g.strokeRect(0, 0, W * k, H * k);
    this.bg = c;
  }

  /** تزئینات حاشیه‌ی کناری: صخره، بوته، گل، مشعل و پرچم تیم‌ها (ثابت؛ روی پس‌زمینه کشیده می‌شود) */
  _sideDecor(g, k) {
    let seed = 987;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (const side of [-1, 1]) {
      const cx = side < 0 ? -PAD_X / 2 : W + PAD_X / 2;
      // سایه‌ی لبه
      const eg = g.createLinearGradient((side < 0 ? -PAD_X : W) * k, 0, (side < 0 ? 0.4 : W + PAD_X - 0.4) * k, 0);
      eg.addColorStop(side < 0 ? 0 : 1, 'rgba(0,30,10,0.55)');
      eg.addColorStop(side < 0 ? 1 : 0, 'rgba(0,30,10,0)');
      g.fillStyle = eg;
      g.fillRect((side < 0 ? -PAD_X : W) * k, 0, PAD_X * k, H * k);
      for (let i = 0; i < 16; i++) {
        const y = 1 + rnd() * (H - 2);
        if (y > ARENA.river.top - 0.8 && y < ARENA.river.bottom + 0.8) continue;
        const x = cx + (rnd() - 0.5) * PAD_X * 0.9;
        const kind = rnd();
        if (kind < 0.4) {
          // صخره
          const r = 0.35 + rnd() * 0.35;
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.beginPath();
          g.ellipse(x * k, (y + r * 0.45) * k, r * 1.1 * k, r * 0.5 * k, 0, 0, 7);
          g.fill();
          const rg = g.createLinearGradient(0, (y - r) * k, 0, (y + r * 0.5) * k);
          rg.addColorStop(0, '#9aa0b4');
          rg.addColorStop(1, '#575c72');
          g.fillStyle = rg;
          g.beginPath();
          g.ellipse(x * k, y * k, r * k, r * 0.75 * k, 0, 0, 7);
          g.fill();
        } else if (kind < 0.8) {
          // بوته
          g.fillStyle = '#1f7a3a';
          for (let j = 0; j < 3; j++) {
            g.beginPath();
            g.arc((x + (j - 1) * 0.25) * k, (y + (j % 2) * 0.1) * k, 0.3 * k, 0, 7);
            g.fill();
          }
          g.fillStyle = '#35b055';
          g.beginPath();
          g.arc(x * k, (y - 0.1) * k, 0.24 * k, 0, 7);
          g.fill();
        } else {
          // گل
          g.fillStyle = ['#ffd34d', '#ff7aa8', '#9ad8ff'][Math.floor(rnd() * 3)];
          for (let j = 0; j < 4; j++) {
            g.beginPath();
            g.arc((x + (rnd() - 0.5) * 0.7) * k, (y + (rnd() - 0.5) * 0.5) * k, 0.07 * k, 0, 7);
            g.fill();
          }
        }
      }
      // مشعل‌ها دو طرف رودخانه
      for (const ty of [ARENA.river.top - 1.6, ARENA.river.bottom + 1.9]) {
        g.fillStyle = '#6b4423';
        g.fillRect((cx - 0.12) * k, ty * k, 0.24 * k, 1.1 * k);
        g.fillStyle = '#c99a4a';
        g.fillRect((cx - 0.26) * k, (ty - 0.12) * k, 0.52 * k, 0.2 * k);
        g.shadowColor = '#ff9a1f';
        g.shadowBlur = 0.8 * k;
        const fg = g.createRadialGradient(cx * k, (ty - 0.45) * k, 0, cx * k, (ty - 0.45) * k, 0.4 * k);
        fg.addColorStop(0, '#fff3a0');
        fg.addColorStop(1, '#ff7a1f');
        g.fillStyle = fg;
        g.beginPath();
        g.moveTo((cx - 0.22) * k, (ty - 0.1) * k);
        g.quadraticCurveTo((cx - 0.3) * k, (ty - 0.55) * k, cx * k, (ty - 0.95) * k);
        g.quadraticCurveTo((cx + 0.3) * k, (ty - 0.55) * k, (cx + 0.22) * k, (ty - 0.1) * k);
        g.fill();
        g.shadowBlur = 0;
      }
      // پرچم تیم: آبی (پایین) و قرمز (بالا) — بعد از چرخش دید هر بازیکن، پایین همیشه «خودش» است
      for (const [by, col, col2] of [[H - 5.5, '#2f6fe0', '#163f94'], [5.5, '#e0455a', '#8e1730']]) {
        g.fillStyle = '#6b4423';
        g.fillRect((cx - 0.5) * k, (by - 1.6) * k, 0.18 * k, 3.4 * k);
        const bg = g.createLinearGradient(0, (by - 1.4) * k, 0, (by + 1.4) * k);
        bg.addColorStop(0, col);
        bg.addColorStop(1, col2);
        g.fillStyle = bg;
        g.beginPath();
        g.moveTo((cx - 0.3) * k, (by - 1.4) * k);
        g.lineTo((cx + 0.5) * k, (by - 1.4) * k);
        g.lineTo((cx + 0.5) * k, (by + 0.9) * k);
        g.lineTo((cx + 0.1) * k, (by + 1.4) * k);
        g.lineTo((cx - 0.3) * k, (by + 0.9) * k);
        g.fill();
        g.strokeStyle = '#ffd34d';
        g.lineWidth = 0.06 * k;
        g.stroke();
        g.fillStyle = '#ffd34d';
        g.font = `${0.7 * k}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('♛', (cx + 0.1) * k, by * k);
      }
    }
  }

  _water(ctx, k, ts) {
    const y0 = ARENA.river.top * k;
    const y1 = ARENA.river.bottom * k;
    const gr = ctx.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#2f86c9');
    gr.addColorStop(0.5, '#47a8e8');
    gr.addColorStop(1, '#2f86c9');
    ctx.fillStyle = gr;
    // آب فقط بین پل‌ها دیده می‌شود (پل‌ها روی پس‌زمینه کشیده شده‌اند)؛ پس ابتدا آب را می‌کشیم و پل را از bg دوباره می‌اندازیم
    ctx.save();
    ctx.beginPath();
    ctx.rect(-PAD_X * k, y0, (W + 2 * PAD_X) * k, y1 - y0);
    for (const b of ARENA.bridges) {
      const [bx0] = this.view.toView(b.x - b.halfWidth, 0);
      const [bx1] = this.view.toView(b.x + b.halfWidth, 0);
      ctx.rect(Math.min(bx0, bx1) * k, y0, Math.abs(bx1 - bx0) * k, y1 - y0);
    }
    ctx.fill('evenodd');
    ctx.restore();
    if (this.reduceFx) return;
    // لکه‌های نور زیر آب و جرقه‌ها
    ctx.save();
    ctx.beginPath();
    ctx.rect(-PAD_X * k, y0, (W + 2 * PAD_X) * k, y1 - y0);
    ctx.clip();
    for (let i = 0; i < 9; i++) {
      const cx = (((i * 2.9 + ts / 2600) % (W + 4)) - 2) * k;
      const cy = (ARENA.river.top + 0.8 + ((i * 0.61) % 1.4)) * k;
      ctx.fillStyle = 'rgba(190,245,255,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 1.1 * k, 0.28 * k, 0, 0, 7);
      ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const tw = (Math.sin(ts / 400 + i * 2.3) + 1) / 2;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + tw * 0.6})`;
      ctx.beginPath();
      ctx.arc(((i * 1.43 + 0.5) % W) * k, (ARENA.river.top + 0.4 + ((i * 0.77) % 1.3)) * k, 0.07 * k, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 0.08 * k;
    const ph = ts / 700;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 1.7 + ph * 1.2) % (W + 2)) - 1;
      const y = (ARENA.river.top + 0.5 + ((i * 0.37) % 1.6)) * k;
      ctx.beginPath();
      ctx.moveTo(x * k, y);
      ctx.quadraticCurveTo((x + 0.4) * k, y - 0.15 * k, (x + 0.8) * k, y);
      ctx.stroke();
    }
  }

  /** قلمرو مجاز کارت انتخاب‌شده: سبز مجاز، قرمز ممنوع */
  _territory(ctx, k) {
    const card = this.selected;
    ctx.save();
    if (card.type === 'spell') {
      ctx.fillStyle = 'rgba(68,209,122,0.10)';
      ctx.fillRect(0, 0, W * k, H * k);
    } else {
      const b = territoryBounds(this.side, card.type);
      const [x0, y0] = this.view.toView(b.xMin, b.yMin);
      const [x1, y1] = this.view.toView(b.xMax, b.yMax);
      const rx = Math.min(x0, x1) * k;
      const ry = Math.min(y0, y1) * k;
      const rw = Math.abs(x1 - x0) * k;
      const rh = Math.abs(y1 - y0) * k;
      ctx.fillStyle = 'rgba(255,60,70,0.18)';
      ctx.beginPath();
      ctx.rect(0, 0, W * k, H * k);
      ctx.rect(rx, ry, rw, rh);
      ctx.fill('evenodd'); // بیرون قلمرو مجاز: قرمز
      ctx.fillStyle = 'rgba(68,209,122,0.22)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(120,255,170,0.65)';
      ctx.lineWidth = 0.08 * k;
      ctx.setLineDash([0.4 * k, 0.3 * k]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      // دور موانع قرمز
      ctx.fillStyle = 'rgba(255,60,70,0.30)';
      const foot = card.type === 'structure' ? card.radius : 0.5;
      for (const bl of this.blockers()) {
        const [bx, by] = this.view.toView(bl.x, bl.y);
        ctx.beginPath();
        ctx.arc(bx * k, by * k, (bl.radius + foot + 0.2) * k, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ───────────── اشیاء ─────────────

  _shadow(ctx, k, { e, vx, vy }) {
    const r = this._radius(e);
    const lift = e.a ? 0.9 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(vx * k, (vy + lift) * k + r * 0.35 * k, r * 0.95 * k, r * 0.45 * k, 0, 0, 7);
    ctx.fill();
  }

  _radius(e) {
    if (e.k === 't') return TOWERS[e.c].radius;
    return cardDef(e.c)?.radius ?? 0.5;
  }

  _teamColor(e) {
    return e.o === this.side ? MINE : THEIRS;
  }

  _hpBar(ctx, k, x, y, w, frac, color) {
    const h = 0.24 * k;
    ctx.fillStyle = '#0b1030';
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 2, y - 2, w + 4, h + 4, h / 2 + 2);
    ctx.fill();
    ctx.fillStyle = '#2b3350';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, h, h / 2);
    ctx.fill();
    const fw = w * Math.max(0, Math.min(1, frac));
    if (fw > 1) {
      ctx.fillStyle = frac > 0.5 ? color : frac > 0.25 ? '#ffc83d' : '#ff5a4a';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y, fw, h, h / 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - w / 2 + h / 3, y + h * 0.15, Math.max(0, fw - h * 0.66), h * 0.28);
    }
  }

  _tower(ctx, k, { e, vx, vy }, now) {
    const king = e.c === 'king';
    const r = TOWERS[e.c].radius;
    const team = this._teamColor(e);
    const x = vx * k;
    const y = vy * k;
    const flash = (this.flash.get(e.i) ?? 0) > now;
    ctx.save();
    if (e.z) {
      // ویرانه
      ctx.fillStyle = '#4a4540';
      ctx.beginPath();
      ctx.ellipse(x, y, r * k, r * 0.7 * k, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#2d2a27';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(i * 1.3) * r * 0.6 * k, y + Math.sin(i * 1.3) * r * 0.4 * k, 0.28 * k, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    // قاعده
    ctx.fillStyle = '#00000040';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.45 * k, r * 1.05 * k, r * 0.5 * k, 0, 0, 7);
    ctx.fill();
    const bodyH = (king ? 2.4 : 2.0) * k;
    const bodyW = r * 1.7 * k;
    const stone = ctx.createLinearGradient(x - bodyW / 2, 0, x + bodyW / 2, 0);
    stone.addColorStop(0, flash ? '#fff' : '#b9b3a8');
    stone.addColorStop(0.5, flash ? '#fff' : '#d8d2c6');
    stone.addColorStop(1, flash ? '#fff' : '#8e887d');
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.roundRect(x - bodyW / 2, y - bodyH + r * 0.5 * k, bodyW, bodyH, 0.15 * k);
    ctx.fill();
    // آجرکاری و شکاف تیراندازی
    ctx.strokeStyle = 'rgba(60,55,50,0.35)';
    ctx.lineWidth = 0.04 * k;
    const bTop = y - bodyH + r * 0.5 * k;
    for (let by = bTop + 0.45 * k; by < bTop + bodyH; by += 0.45 * k) {
      ctx.beginPath();
      ctx.moveTo(x - bodyW / 2, by);
      ctx.lineTo(x + bodyW / 2, by);
      ctx.stroke();
    }
    if (king) {
      ctx.fillStyle = '#3a2418';
      ctx.beginPath();
      ctx.roundRect(x - 0.38 * k, y + r * 0.5 * k - 0.9 * k, 0.76 * k, 0.9 * k, [0.38 * k, 0.38 * k, 0, 0]);
      ctx.fill();
    }
    // کنگره
    ctx.fillStyle = stone;
    const topY = y - bodyH + r * 0.5 * k;
    for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * bodyW * 0.36 - 0.18 * k, topY - 0.35 * k, 0.36 * k, 0.4 * k);
    // پرچم تیم
    ctx.fillStyle = team;
    ctx.beginPath();
    ctx.moveTo(x, topY - 0.3 * k);
    ctx.lineTo(x, topY - 1.4 * k);
    ctx.lineTo(x + (king ? 1 : 0.8) * k * (this.view.flip ? -1 : 1), topY - 1.1 * k);
    ctx.lineTo(x, topY - 0.8 * k);
    ctx.fill();
    ctx.strokeStyle = '#3a2f22';
    ctx.lineWidth = 0.06 * k;
    ctx.beginPath();
    ctx.moveTo(x, topY - 0.3 * k);
    ctx.lineTo(x, topY - 1.45 * k);
    ctx.stroke();
    // تاج برج اصلی
    ctx.font = `${(king ? 1.1 : 0.8) * k}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (king) ctx.fillText('👑', x, y - bodyH * 0.45 + r * 0.5 * k);
    else {
      // سپر طلایی با تاج روی برج
      const py = y - bodyH * 0.5 + r * 0.5 * k;
      ctx.fillStyle = '#244fb0';
      ctx.beginPath();
      ctx.moveTo(x - 0.5 * k, py - 0.5 * k);
      ctx.lineTo(x + 0.5 * k, py - 0.5 * k);
      ctx.lineTo(x + 0.5 * k, py + 0.15 * k);
      ctx.lineTo(x, py + 0.65 * k);
      ctx.lineTo(x - 0.5 * k, py + 0.15 * k);
      ctx.fill();
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 0.07 * k;
      ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      ctx.font = `${0.8 * k}px sans-serif`;
      ctx.fillText('♛', x, py - 0.05 * k);
    }
    // حلقه‌ی تیم
    ctx.strokeStyle = team;
    ctx.lineWidth = 0.1 * k;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.45 * k, r * 1.05 * k, r * 0.5 * k, 0, 0, 7);
    ctx.stroke();
    this._hpBar(ctx, k, x, topY - 1.9 * k, 1.9 * k, e.h / e.m, team);
    ctx.restore();
  }

  _structure(ctx, k, { e, vx, vy }, now) {
    const def = CARD_BY_ID[e.c];
    const r = def?.radius ?? 0.9;
    const x = vx * k;
    const y = vy * k;
    const flash = (this.flash.get(e.i) ?? 0) > now;
    ctx.save();
    ctx.globalAlpha = e.d ? 0.55 : 1;
    ctx.fillStyle = '#00000040';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.4 * k, r * 1.05 * k, r * 0.5 * k, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = flash ? '#fff' : (def?.color ?? '#888');
    ctx.beginPath();
    ctx.roundRect(x - r * k * 0.9, y - r * k * 1.0, r * k * 1.8, r * k * 1.5, 0.18 * k);
    ctx.fill();
    ctx.strokeStyle = this._teamColor(e);
    ctx.lineWidth = 0.12 * k;
    ctx.stroke();
    ctx.font = `${1.2 * k}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def?.icon ?? '?', x, y - 0.2 * k);
    ctx.globalAlpha = 1;
    this._hpBar(ctx, k, x, y - r * k * 1.5, 1.5 * k, e.h / e.m, this._teamColor(e));
    if (e.l !== undefined) {
      ctx.fillStyle = '#ffffffaa';
      ctx.fillRect(x - 0.75 * k, y - r * k * 1.5 + 0.28 * k, 1.5 * k * e.l, 0.07 * k);
    }
    ctx.restore();
  }

  _unit(ctx, k, { e, vx, vy }, now, ts) {
    const def = cardDef(e.c);
    const r = def?.radius ?? 0.5;
    const team = this._teamColor(e);
    const flash = (this.flash.get(e.i) ?? 0) > now;
    const lunge = (this.lunge.get(e.i) ?? 0) > now;
    const bob = this.reduceFx ? 0 : Math.sin(ts / 110 + e.i * 1.7) * 0.07;
    const lift = e.a ? 0.9 : 0;
    const x = vx * k;
    const y = (vy - lift + bob) * k;
    const deploying = e.d > 0;
    ctx.save();
    ctx.globalAlpha = deploying ? 0.55 : 1;
    const scale = lunge ? 1.22 : 1;
    // بدنه: دایره‌ی رنگی کارت با حلقه‌ی تیم
    const body = ctx.createRadialGradient(x - r * 0.3 * k, y - r * 0.4 * k, r * 0.1 * k, x, y, r * 1.2 * k);
    body.addColorStop(0, flash ? '#fff' : '#ffffffcc');
    body.addColorStop(0.35, flash ? '#fff' : (def?.color ?? '#999'));
    body.addColorStop(1, flash ? '#fff' : '#00000088');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.15 * k * scale, 0, 7);
    ctx.fill();
    ctx.lineWidth = 0.12 * k;
    ctx.strokeStyle = team;
    ctx.stroke();
    ctx.font = `${Math.max(0.7, r * 1.6) * k * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def?.icon ?? '?', x, y + 0.03 * k);
    if (deploying) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.08 * k;
      ctx.beginPath();
      ctx.arc(x, y, (r * 1.15 + 0.25) * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, 1 - e.d), false);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (e.h < e.m) this._hpBar(ctx, k, x, y - (r * 1.15 + 0.5) * k, Math.max(0.9, r * 2) * k, e.h / e.m, team);
    ctx.restore();
  }

  // ───────────── افکت‌ها ─────────────

  _effects(ctx, k, now) {
    const keep = [];
    for (const f of this.fx) {
      const p = (now - f.t0) / f.dur;
      if (p >= 1) continue;
      keep.push(f);
      ctx.save();
      switch (f.type) {
        case 'shot': {
          const [x0, y0] = this.view.toView(f.from[0], f.from[1]);
          const [x1, y1] = this.view.toView(f.to[0], f.to[1]);
          const lift = 0.5;
          const x = lerp(x0, x1, p);
          const y = lerp(y0, y1, p) - Math.sin(p * Math.PI) * lift;
          ctx.fillStyle = f.mine ? '#cfe3ff' : '#ffd0d4';
          ctx.shadowColor = f.mine ? MINE : THEIRS;
          ctx.shadowBlur = this.reduceFx ? 0 : 8;
          ctx.beginPath();
          ctx.arc(x * k, y * k, (f.splash ? 0.25 : 0.16) * k, 0, 7);
          ctx.fill();
          break;
        }
        case 'spark': {
          const [x, y] = this.view.toView(f.x, f.y);
          ctx.strokeStyle = '#fff';
          ctx.globalAlpha = 1 - p;
          ctx.lineWidth = 0.1 * k;
          ctx.beginPath();
          ctx.arc(x * k, y * k, (0.3 + p * 0.5) * k, 0, 7);
          ctx.stroke();
          break;
        }
        case 'ring': {
          const [x, y] = this.view.toView(f.x, f.y);
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = 0.9 * (1 - p);
          ctx.lineWidth = 0.14 * k;
          ctx.beginPath();
          ctx.ellipse(x * k, y * k, (0.4 + p * 1.2) * k, (0.4 + p * 1.2) * 0.55 * k, 0, 0, 7);
          ctx.stroke();
          break;
        }
        case 'telegraph': {
          const [x, y] = this.view.toView(f.x, f.y);
          ctx.strokeStyle = f.color;
          ctx.fillStyle = f.color;
          ctx.globalAlpha = 0.25 + 0.15 * Math.sin(p * 14);
          ctx.beginPath();
          ctx.arc(x * k, y * k, f.r * k, 0, 7);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = 0.1 * k;
          ctx.stroke();
          break;
        }
        case 'blast': {
          const [x, y] = this.view.toView(f.x, f.y);
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(x * k, y * k, f.r * k * (0.4 + p * 0.7), 0, 7);
          ctx.fill();
          ctx.strokeStyle = f.color;
          ctx.lineWidth = 0.3 * k * (1 - p);
          ctx.beginPath();
          ctx.arc(x * k, y * k, f.r * k * (0.6 + p * 0.6), 0, 7);
          ctx.stroke();
          break;
        }
        case 'puff': {
          const [x, y] = this.view.toView(f.x, f.y);
          const n = f.big ? 10 : 5;
          ctx.globalAlpha = 1 - p;
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2;
            const d = (f.big ? 1.6 : 0.8) * p;
            ctx.fillStyle = i % 2 ? '#d9d4cb' : '#8a857c';
            ctx.beginPath();
            ctx.arc((x + Math.cos(ang) * d) * k, (y + Math.sin(ang) * d * 0.7 - p * 0.6) * k, (f.big ? 0.5 : 0.28) * k * (1 - p * 0.4), 0, 7);
            ctx.fill();
          }
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }
    this.fx = keep;
  }

  /** پیش‌نمایش محل استقرار زیر نشانگر: سبز مجاز / قرمز غیرمجاز */
  _ghost(ctx, k, ts) {
    const card = this.selected;
    const pt = this.hover;
    const ok = this.placementOk(card, pt);
    const col = ok ? '68,209,122' : '255,70,80';
    const [vx, vy] = this.view.toView(pt.x, pt.y);
    const r = card.type === 'unit' ? 0.7 : card.radius;
    ctx.save();
    ctx.fillStyle = `rgba(${col},0.30)`;
    ctx.strokeStyle = `rgba(${col},0.95)`;
    ctx.lineWidth = 0.12 * k;
    ctx.beginPath();
    ctx.arc(vx * k, vy * k, r * k, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.9 + (this.reduceFx ? 0 : Math.sin(ts / 150) * 0.1);
    ctx.font = `${Math.max(1, r * 1.3) * k}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.icon, vx * k, vy * k);
    ctx.restore();
  }
}
