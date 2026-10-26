// کنترل صفحه‌ی نبرد: HUD (اکسیر، دست کارت، زمان)، انتخاب/کشیدن کارت، پیام‌های سریع.
// وضعیت واقعی (اکسیر، دست، نتیجه) همیشه از سرور می‌آید؛ اینجا فقط نمایش و ارسال درخواست است.
import { BATTLE, EMOTES, elixirRateAt } from '/shared/config.js';
import { CARD_BY_ID, cardName } from '/shared/cards.js';
import { PLACEMENT_ERRORS } from '/shared/rules.js';
import { t, n, errorText } from '../i18n.js';
import { $, el, toast } from '../ui.js';
import { net } from '../net.js';
import { cardEl } from '../cardView.js';
import { BattleView } from './BattleView.js';
import { splitTime, predictElixir } from './geometry.js';

const DRAG_THRESHOLD = 8; // px

export class BattleController {
  constructor({ reduceFx }) {
    this.canvas = $('#arena');
    this.view = new BattleView(this.canvas, { reduceFx });
    this.handEl = $('#hand');
    this.nextEl = $('#next-card');
    this.ghost = $('#drag-ghost');
    this.active = false;
    this.snapAt = 0;
    this.snap = null;
    this.rules = BATTLE;
    this.selectedSlot = null;
    this.handIds = [];
    this.cardNodes = [];
    this.dragging = null;
    this.pendingPlay = false;
    this._bound = false;
    this._raf = 0;
    this._hud = null; // گره‌های HUD (یک‌بار پیدا می‌شوند، نه در هر فریم)
    this._hudLast = { w: '', num: '', timer: '', low: null };
    this._emoteTimers = {};
    this._bindStatic();
    // اندازه‌ی بوم با تغییر چیدمان (دسته‌ی کارت، چرخش گوشی، نوار آدرس مرورگر) هماهنگ می‌ماند
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(this.canvas.parentElement);
  }

  // ───────────────────────── چرخه‌ی حیات ─────────────────────────

  begin(startMsg) {
    this.active = true;
    this.side = startMsg.side;
    this.rules = { ...BATTLE, ...startMsg.rules, elixir: { ...BATTLE.elixir, ...(startMsg.rules?.elixir ?? {}) } };
    this.selectedSlot = null;
    this.handIds = [];
    this.handEl.replaceChildren();
    this.cardNodes = [];
    $('#battle-opp').textContent = startMsg.opponent.name;
    $('#score-you').textContent = n(0);
    $('#score-opp').textContent = n(0);
    $('#emote-panel').hidden = true;
    $('#reconnect-overlay').hidden = true;
    this.view.reduceFx = !!document.body.classList.contains('reduce-fx');
    this.snap = startMsg.snapshot;
    this.snapAt = performance.now();
    // ابتدا صفحه را نمایش می‌دهیم تا اندازه‌ی بوم قابل محاسبه باشد (فراخواننده showScreen را قبل از begin صدا می‌زند)
    this.view.start(startMsg.side, { ...startMsg.snapshot, ev: [] });
    this._renderHand(true);
    // battle:start دوباره (بازگشت بعد از قطع اتصال) می‌رسد در حالی که حلقه‌ی قبلی هنوز زنده است؛ حلقه‌ی تکراری نسازیم
    cancelAnimationFrame(this._raf);
    this._tickHud();
    if (!startMsg.resumed) this.banner(t('battle.go'));
  }

  end() {
    this.active = false;
    this.view.stop();
    cancelAnimationFrame(this._raf);
    this._cancelDrag();
    $('#emote-panel').hidden = true;
  }

  onSnapshot(snap) {
    if (!this.active) return;
    this.snap = snap;
    this.snapAt = performance.now();
    this.view.pushSnapshot(snap);
    $('#score-you').textContent = n(snap.td[this.side]);
    $('#score-opp').textContent = n(snap.td[1 - this.side]);
    this._renderHand(false);
  }

  setReconnecting(on) {
    $('#reconnect-overlay').hidden = !on;
    if (on) $('#reconnect-text').textContent = t('battle.reconnecting');
  }

  resize() {
    if (this.active) this.view.resize();
  }

  banner(text) {
    const b = $('#battle-banner');
    b.textContent = text;
    b.hidden = false;
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => (b.hidden = true), 2300);
  }

  // ───────────────────────── HUD ─────────────────────────

  _currentElixir() {
    if (!this.snap) return 0;
    const elapsed = (performance.now() - this.snapAt) / 1000;
    const rate = elixirRateAt(this.snap.t + elapsed, this.rules);
    return predictElixir(this.snap.you.elixir, elapsed, rate, this.rules.elixir.max);
  }

  _tickHud() {
    if (!this.active) return;
    const h = (this._hud ??= { fill: $('#elixir-fill'), num: $('#elixir-num'), timer: $('#battle-timer') });
    const last = this._hudLast;
    const el_ = this._currentElixir();
    const max = this.rules.elixir.max;
    // فقط وقتی مقدار تغییر کرده به DOM می‌نویسیم (جلوگیری از بازچینش بی‌مورد در هر فریم)
    const w = `${Math.min(100, (el_ / max) * 100).toFixed(1)}%`;
    if (w !== last.w) h.fill.style.width = last.w = w;
    const num = n(Math.floor(el_ + 1e-6));
    if (num !== last.num) h.num.textContent = last.num = num;
    const left = Math.max(0, this.snap.left - (performance.now() - this.snapAt) / 1000);
    const { m, s } = splitTime(left);
    const txt = `${n(m)}:${n(s, { minimumIntegerDigits: 2 })}`;
    if (txt !== last.timer) h.timer.textContent = last.timer = txt;
    const low = left <= 10;
    if (low !== last.low) h.timer.classList.toggle('low', (last.low = low));
    this.cardNodes.forEach((node, i) => {
      const card = CARD_BY_ID[this.handIds[i]];
      node?.classList.toggle('disabled', !!card && el_ + 1e-6 < card.cost);
    });
    this._raf = requestAnimationFrame(() => this._tickHud());
  }

  _renderHand(force) {
    const hand = this.snap.you.hand;
    hand.forEach((id, i) => {
      if (!force && this.handIds[i] === id && this.cardNodes[i]) return;
      const node = cardEl(CARD_BY_ID[id], { level: 1 });
      node.dataset.slot = String(i);
      if (!force) node.classList.add('dealt');
      const old = this.cardNodes[i];
      if (old) old.replaceWith(node);
      else this.handEl.append(node);
      this.cardNodes[i] = node;
      this.handIds[i] = id;
      if (this.selectedSlot === i) {
        // کارت انتخاب‌شده مصرف شد (یا جایگزین شد)
        this._select(null);
      }
    });
    const nextCard = CARD_BY_ID[this.snap.you.next];
    this.nextEl.replaceChildren(
      el('span', { text: t('battle.next') }),
      nextCard ? cardEl(nextCard, { mini: true }) : null,
    );
    this.nextEl.setAttribute('aria-label', `${t('battle.next')}: ${nextCard ? cardName(nextCard) : ''}`);
  }

  _select(slot) {
    this.selectedSlot = slot;
    this.cardNodes.forEach((node, i) => node?.classList.toggle('selected', i === slot));
    this.view.setSelected(slot === null ? null : CARD_BY_ID[this.handIds[slot]]);
  }

  // ───────────────────────── ورودی ─────────────────────────

  _bindStatic() {
    if (this._bound) return;
    this._bound = true;

    // انتخاب یا شروع کشیدن کارت
    this.handEl.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button > 0) return;
      const node = e.target.closest('.card');
      if (!node) return;
      const slot = Number(node.dataset.slot);
      this.dragging = { slot, startX: e.clientX, startY: e.clientY, moved: false, id: e.pointerId };
      this._select(slot);
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const d = this.dragging;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) {
        d.moved = true;
        this._showGhost(d.slot);
      }
      if (d.moved) {
        this.ghost.style.left = `${e.clientX}px`;
        this.ghost.style.top = `${e.clientY}px`;
        this.view.setHover(this.view.clientToWorld(e.clientX, e.clientY));
      }
    });
    const finish = (e, cancelled) => {
      const d = this.dragging;
      if (!d) return;
      this.dragging = null;
      this.ghost.hidden = true;
      if (d.moved && !cancelled) {
        const pt = this.view.clientToWorld(e.clientX, e.clientY);
        if (pt) this._play(d.slot, pt);
        else this._select(null); // رها کردن بیرون از میدان = لغو
      }
      if (d.moved) this.view.setHover(null);
    };
    window.addEventListener('pointerup', (e) => finish(e, false));
    window.addEventListener('pointercancel', (e) => finish(e, true));

    // مکان‌نما و تأیید روی میدان (انتخاب کارت ← لمس میدان)
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.selectedSlot === null || this.dragging?.moved) return;
      this.view.setHover(this.view.clientToWorld(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.selectedSlot === null) return;
      this.view.setHover(this.view.clientToWorld(e.clientX, e.clientY));
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.dragging?.moved) this.view.setHover(null);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (this.selectedSlot === null || this.dragging) return;
      const pt = this.view.clientToWorld(e.clientX, e.clientY);
      if (pt) this._play(this.selectedSlot, pt);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') this._select(null);
      if (['1', '2', '3', '4'].includes(e.key)) this._select(Number(e.key) - 1);
    });

    // پیام‌های سریع (چت آزاد وجود ندارد)
    const panel = $('#emote-panel');
    for (const em of EMOTES) {
      panel.append(
        el('button', {
          type: 'button',
          text: `${em.icon} ${em.en}`,
          onClick: async () => {
            panel.hidden = true;
            const r = await net.request('battle:emote', { id: em.id });
            if (!r.ok) toast(errorText(r.code), 'error');
          },
        }),
      );
    }
    $('#emote-toggle').addEventListener('click', () => {
      panel.hidden = !panel.hidden;
    });
  }

  _showGhost(slot) {
    const card = CARD_BY_ID[this.handIds[slot]];
    this.ghost.replaceChildren(cardEl(card, { mini: true }));
    this.ghost.hidden = false;
  }

  _cancelDrag() {
    this.dragging = null;
    this.ghost.hidden = true;
    this._select(null);
  }

  /** ارسال درخواست استقرار. پیش‌بررسی فقط برای تجربه‌ی کاربری است؛ سرور تصمیم نهایی را می‌گیرد. */
  async _play(slot, pt) {
    const card = CARD_BY_ID[this.handIds[slot]];
    if (!card) return;
    if (this._currentElixir() + 1e-6 < card.cost) {
      toast(PLACEMENT_ERRORS.no_elixir, 'error', 1200);
      return;
    }
    if (!this.view.placementOk(card, pt)) {
      toast(t('battle.invalidSpot'), 'error', 1200);
      return;
    }
    if (this.pendingPlay) return;
    this.pendingPlay = true;
    const res = await net.request('battle:play', { slot, x: pt.x, y: pt.y }, 3000);
    this.pendingPlay = false;
    if (!res.ok) {
      toast(errorText(res.code), 'error', 1400);
      return;
    }
    this._select(null);
    this.view.setHover(null);
  }

  // ───────────────────────── پیام سریع دریافتی ─────────────────────────

  showEmote({ from, id }) {
    const em = EMOTES.find((x) => x.id === id);
    if (!em) return;
    const bubble = $(from === 'you' ? '#emote-bubble-you' : '#emote-bubble-opp');
    bubble.textContent = `${em.icon} ${em.en}`;
    bubble.hidden = false;
    clearTimeout(this._emoteTimers[from]);
    this._emoteTimers[from] = setTimeout(() => (bubble.hidden = true), 2200);
  }
}
