// هوش مصنوعی قانون‌محور برای حالت تمرین.
// دقیقاً با همان API بازیکن (battle.playCard) بازی می‌کند؛ پس هیچ مزیتی مثل اکسیر مجانی ندارد.
// دشواری با جدول پارامترهای شفاف کنترل می‌شود (AI_PROFILES) و قابل تنظیم است.

import { ARENA } from '../../shared/config.js';
import { checkPlacement } from '../../shared/rules.js';
import { createRng } from '../util/rng.js';

export const AI_PROFILES = Object.freeze({
  easy: { thinkMin: 2.5, thinkMax: 4.5, attackElixir: 8.5, mistake: 0.35, spellSkill: 0.4 },
  normal: { thinkMin: 1.4, thinkMax: 2.8, attackElixir: 7, mistake: 0.15, spellSkill: 0.8 },
  hard: { thinkMin: 0.7, thinkMax: 1.6, attackElixir: 6, mistake: 0.04, spellSkill: 1 },
});

export class BotController {
  constructor(battle, owner, difficulty = 'normal', seed = 1) {
    this.battle = battle;
    this.owner = owner;
    this.enemy = 1 - owner;
    this.profile = AI_PROFILES[difficulty] ?? AI_PROFILES.normal;
    this.rng = createRng(seed);
    this.cool = this.rng.range(1.5, 3); // مکث اولیه
    this.dir = owner === 1 ? 1 : -1; // جهت حرکت به سمت رودخانه
  }

  update(dt) {
    if (this.battle.over) return;
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = this.rng.range(this.profile.thinkMin, this.profile.thinkMax);
    this._think();
  }

  // ─────────── کمکی‌ها ───────────

  _enemyUnits() {
    return [...this.battle.entities.values()].filter((e) => e.kind === 'unit' && e.owner === this.enemy && !e.dead);
  }
  _myUnits() {
    return [...this.battle.entities.values()].filter((e) => e.kind === 'unit' && e.owner === this.owner && !e.dead);
  }
  _laneOf(x) {
    return x < ARENA.width / 2 ? 0 : 1;
  }
  _towerY() {
    return this.owner === 1 ? ARENA.height - 25.5 : 25.5;
  }
  _onMySide(u) {
    return this.owner === 1 ? u.y < ARENA.river.bottom + 0.5 : u.y > ARENA.river.top - 0.5;
  }

  _hand() {
    const p = this.battle.players[this.owner];
    return p.deck.hand.map((id, slot) => ({ slot, card: this.battle.handOf(this.owner)[slot] }));
  }

  /** نزدیک‌ترین نقطه‌ی معتبر به نقطه‌ی دلخواه */
  _place(card, wantX, wantY) {
    const blockers = this.battle._blockers();
    const cands = [];
    for (let dx = -3; dx <= 3; dx += 0.75) {
      for (let dy = -3; dy <= 3; dy += 0.75) cands.push([wantX + dx, wantY + dy, Math.hypot(dx, dy)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, y] of cands) {
      if (checkPlacement(card, this.owner, x, y, blockers).ok) return { x, y };
    }
    return null;
  }

  _play(slot, card, wantX, wantY) {
    const pos = card.type === 'spell' ? { x: wantX, y: wantY } : this._place(card, wantX, wantY);
    if (!pos) return false;
    return this.battle.playCard(this.owner, slot, pos.x, pos.y).ok;
  }

  /** ارزش یک طلسم در مرکز (cx, cy): مجموع آسیب مؤثر روی دشمن‌ها منهای تلفات خودی */
  _spellValue(card, cx, cy) {
    let v = 0;
    for (const e of this.battle.entities.values()) {
      if (e.dead || e.kind !== 'unit') continue;
      if (Math.hypot(e.x - cx, e.y - cy) - e.radius > card.radius) continue;
      const eff = Math.min(card.damage, e.hp);
      v += e.owner === this.enemy ? eff : -eff;
    }
    return v;
  }

  _bestSpellSpot(card) {
    let best = null;
    for (const u of this._enemyUnits()) {
      const v = this._spellValue(card, u.x, u.y);
      if (!best || v > best.v) best = { v, x: u.x, y: u.y };
    }
    return best;
  }

  // ─────────── تصمیم‌گیری ───────────

  _think() {
    const b = this.battle;
    const me = b.players[this.owner];
    const hand = this._hand().filter((h) => h.card.cost <= me.elixir);
    if (!hand.length) return;

    const threats = this._enemyUnits().filter((u) => this._onMySide(u));
    if (threats.length) {
      if (this._defend(hand, threats)) return;
    }
    if (me.elixir >= this.profile.attackElixir - this.rng.range(0, 1.5)) this._attack(hand);
  }

  _defend(hand, threats) {
    // خطرناک‌ترین مسیر
    const lanes = [[], []];
    for (const t of threats) lanes[this._laneOf(t.x)].push(t);
    const power = (g) => g.reduce((s, u) => s + u.hp * 0.1 + u.damage, 0);
    const lane = power(lanes[0]) >= power(lanes[1]) ? 0 : 1;
    const group = lanes[lane];
    const hasAir = group.some((u) => u.air);
    const cx = group.reduce((s, u) => s + u.x, 0) / group.length;

    const options = [];
    for (const { slot, card } of hand) {
      let score = -card.cost * 0.15;
      if (card.type === 'unit') {
        if (hasAir && !card.attacksAir) score -= 6;
        if (card.targets === 'buildings') score -= 2.5;
        score += card.hp / 450 + (card.damage * card.count) / 90;
        if (card.splash && group.length >= 3) score += 2;
      } else if (card.type === 'structure') {
        if (card.damage <= 0) score += 0.5;
        else score += hasAir && !card.attacksAir ? -4 : 2;
      } else {
        const spot = this._bestSpellSpot(card);
        if (!spot || spot.v < card.cost * 70) continue;
        score += (spot.v / 100) * this.profile.spellSkill;
        options.push({ slot, card, score, x: spot.x, y: spot.y });
        continue;
      }
      options.push({ slot, card, score });
    }
    if (!options.length) return false;
    options.sort((a, b) => b.score - a.score);
    const choice = this.rng.next() < this.profile.mistake ? this.rng.pick(options) : options[0];

    if (choice.card.type === 'spell') return this._play(choice.slot, choice.card, choice.x, choice.y);
    const laneX = ARENA.lanes[lane];
    const wantX = laneX + (cx > laneX ? 1.2 : -1.2);
    const wantY = this._towerY() - this.dir * (choice.card.type === 'structure' ? -2.5 : 1.5);
    return this._play(choice.slot, choice.card, wantX, wantY);
  }

  _attack(hand) {
    const units = hand.filter((h) => h.card.type === 'unit');
    const pool = units.length ? units : hand.filter((h) => h.card.type === 'structure' && h.card.spawn);
    if (!pool.length) return;
    // ترجیح کارت‌های گران‌تر برای ساخت فشار؛ کمی تصادفی
    pool.sort((a, b) => b.card.cost - a.card.cost);
    const pick = this.rng.next() < this.profile.mistake ? this.rng.pick(pool) : pool[0];

    // مسیر: جایی که واحدهای خودی هستند، وگرنه مسیر کم‌دفاع‌تر دشمن
    const mine = this._myUnits();
    const theirs = this._enemyUnits();
    let lane;
    if (mine.length) {
      const c = [0, 0];
      for (const u of mine) c[this._laneOf(u.x)] += u.hp;
      lane = c[0] >= c[1] ? 0 : 1;
    } else {
      const c = [0, 0];
      for (const u of theirs) c[this._laneOf(u.x)] += u.hp;
      lane = c[0] <= c[1] ? 0 : 1;
      if (c[0] === c[1]) lane = this.rng.int(2);
    }
    const laneX = ARENA.lanes[lane];
    const fast = pick.card.speed >= 2.4;
    const backY = this.owner === 1 ? 3.8 : ARENA.height - 3.8;
    const wantY = fast ? this._towerY() + this.dir * 2.5 : pick.card.targets === 'buildings' ? backY : this._towerY() + this.dir * 0.5;
    this._play(pick.slot, pick.card, laneX, wantY);
  }
}
