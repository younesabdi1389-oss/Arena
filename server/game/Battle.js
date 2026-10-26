// هسته‌ی شبیه‌سازی نبرد — کاملاً مستقل از شبکه و زمان واقعی.
// با فراخوانی tick(dt) جلو می‌رود؛ بنابراین قابل تست و (در آینده) قابل بازپخش است.
// تمام منطق (اکسیر، استقرار، حرکت، آسیب، نتیجه) فقط اینجا و سمت سرور اجرا می‌شود.

import { ARENA, BATTLE, TOWERS, towerLayout, elixirRateAt } from '../../shared/config.js';
import { CARD_BY_ID, TOKENS, levelMultiplier } from '../../shared/cards.js';
import { checkPlacement, clampToTerritory } from '../../shared/rules.js';
import { Deck } from './Deck.js';

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mergeRules(rules) {
  return {
    ...BATTLE,
    ...rules,
    elixir: { ...BATTLE.elixir, ...(rules?.elixir ?? {}) },
  };
}

export class Battle {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {Array<{name:string, deck:string[], levels?:Record<string,number>}>} o.players  دو بازیکن؛ index = owner
   * @param {number} o.seed
   * @param {object} [o.rules]  override قوانین (رویدادهای ویژه‌ی آینده)
   */
  constructor({ id, players, seed, rules }) {
    this.id = id;
    this.seed = seed >>> 0;
    this.rules = mergeRules(rules);
    this.time = 0;
    this.tickCount = 0;
    this.nextId = 0;
    this.entities = new Map();
    this.pending = []; // رویدادهای زمان‌دار (طلسم‌ها)
    this.events = [];
    this.playLog = []; // لاگ معتبر کارت‌ها: پایه‌ی بازپخش آینده
    this.over = false;
    this.result = null;
    this.kingDead = [false, false];

    this.players = players.map((p, owner) => ({
      owner,
      name: p.name,
      levels: p.levels ?? {},
      elixir: this.rules.elixir.start,
      deck: new Deck(p.deck, this.seed + owner * 7919, this.rules.deck.hand),
      stats: { cardsPlayed: 0, unitsSpawned: 0, towersDestroyed: 0, elixirSpent: 0 },
    }));

    for (let owner = 0; owner < 2; owner++) {
      for (const t of towerLayout(owner)) this._spawnTower(owner, t);
    }
  }

  // ───────────────────────── ساخت موجودیت‌ها ─────────────────────────

  _spawnTower(owner, t) {
    const def = TOWERS[t.role];
    const e = {
      id: ++this.nextId, kind: 'tower', owner, cardId: t.role, role: t.role, lane: t.lane,
      x: t.x, y: t.y, hp: def.hp, maxHp: def.hp, damage: def.damage, hitSpeed: def.hitSpeed,
      range: def.range, radius: def.radius, speed: 0, air: false, attacksAir: true, attacksGround: true,
      targetMode: 'any', splash: 0, cd: 0, deployLeft: 0, targetId: null, dead: false,
    };
    this.entities.set(e.id, e);
    return e;
  }

  _spawnUnit(owner, def, level, x, y, deployTime = this.rules.deployTimeSec) {
    const m = levelMultiplier(level);
    const e = {
      id: ++this.nextId, kind: 'unit', owner, cardId: def.id, x, y,
      hp: def.hp * m, maxHp: def.hp * m, damage: def.damage * m, hitSpeed: def.hitSpeed,
      speed: def.speed, range: def.range, radius: def.radius, air: !!def.air,
      attacksAir: !!def.attacksAir, attacksGround: def.attacksGround !== false,
      targetMode: def.targets ?? 'any', splash: def.splash ?? 0, cd: 0,
      deployLeft: deployTime, targetId: null, dead: false, goal: null,
    };
    this.entities.set(e.id, e);
    this.events.push({ k: 'spawn', id: e.id, c: def.id, o: owner, x: r2(x), y: r2(y) });
    return e;
  }

  _spawnStructure(owner, def, level, x, y) {
    const m = levelMultiplier(level);
    const e = {
      id: ++this.nextId, kind: 'structure', owner, cardId: def.id, x, y,
      hp: def.hp * m, maxHp: def.hp * m, damage: def.damage * m, hitSpeed: def.hitSpeed,
      range: def.range, radius: def.radius, speed: 0, air: false,
      attacksAir: !!def.attacksAir, attacksGround: def.attacksGround !== false,
      targetMode: 'any', splash: def.splash ?? 0, cd: 0, deployLeft: this.rules.deployTimeSec,
      targetId: null, dead: false, lifeLeft: def.lifetime, lifeTotal: def.lifetime,
      spawn: def.spawn ? { token: def.spawn.token, interval: def.spawn.interval, timer: def.spawn.interval, level } : null,
    };
    this.entities.set(e.id, e);
    this.events.push({ k: 'spawn', id: e.id, c: def.id, o: owner, x: r2(x), y: r2(y) });
    return e;
  }

  // ───────────────────────── ورودی بازیکن ─────────────────────────

  _blockers() {
    const out = [];
    for (const e of this.entities.values()) {
      if (!e.dead && (e.kind === 'tower' || e.kind === 'structure')) out.push({ x: e.x, y: e.y, radius: e.radius });
    }
    return out;
  }

  handOf(owner) {
    return this.players[owner].deck.hand.map((id) => CARD_BY_ID[id]);
  }

  /** اعتبارسنجی کامل سمت سرور و اجرای کارت. */
  playCard(owner, slot, x, y) {
    if (this.over) return { ok: false, code: 'battle_over' };
    const p = this.players[owner];
    if (!p) return { ok: false, code: 'bad_slot' };
    if (!Number.isInteger(slot) || slot < 0 || slot >= p.deck.hand.length) return { ok: false, code: 'bad_slot' };
    const card = CARD_BY_ID[p.deck.hand[slot]];
    if (!card) return { ok: false, code: 'bad_slot' };
    if (p.elixir + 1e-9 < card.cost) return { ok: false, code: 'no_elixir' };
    const check = checkPlacement(card, owner, x, y, this._blockers());
    if (!check.ok) return check;

    const level = p.levels[card.id] ?? 1;
    p.elixir = Math.max(0, p.elixir - card.cost);
    p.deck.play(slot);
    p.stats.cardsPlayed++;
    p.stats.elixirSpent += card.cost;
    this.playLog.push({ t: r2(this.time), o: owner, slot, c: card.id, x: r2(x), y: r2(y), el: r2(p.elixir) });
    this.events.push({ k: 'play', o: owner, c: card.id, x: r2(x), y: r2(y) });

    if (card.type === 'unit') {
      const n = card.count;
      for (let i = 0; i < n; i++) {
        let px = x, py = y;
        if (n > 1) {
          const ang = (i / n) * Math.PI * 2 + Math.PI / 6;
          const rad = 0.6;
          ({ x: px, y: py } = clampToTerritory(owner, 'unit', x + Math.cos(ang) * rad, y + Math.sin(ang) * rad));
        }
        this._spawnUnit(owner, card, level, px, py);
        p.stats.unitsSpawned++;
      }
    } else if (card.type === 'structure') {
      this._spawnStructure(owner, card, level, x, y);
    } else {
      this.pending.push({ at: this.time + card.delay, owner, card, level, x, y });
      this.events.push({ k: 'spellCast', c: card.id, o: owner, x: r2(x), y: r2(y), r: card.radius, d: card.delay });
    }
    return { ok: true, cardId: card.id };
  }

  forfeit(owner, reason = 'forfeit') {
    if (this.over) return;
    this._finish(1 - owner, reason);
  }

  // ───────────────────────── حلقه‌ی شبیه‌سازی ─────────────────────────

  tick(dt = 1 / this.rules.tickRate) {
    if (this.over) return;
    this.time += dt;
    this.tickCount++;

    const rate = elixirRateAt(this.time, this.rules);
    for (const p of this.players) p.elixir = Math.min(this.rules.elixir.max, p.elixir + rate * dt);

    this._runPending();

    const list = [...this.entities.values()];
    for (const e of list) if (!e.dead) this._update(e, dt);
    this._resolveMovement(list, dt);

    for (const e of list) if (e.dead && e.kind !== 'tower') this.entities.delete(e.id);

    this._checkEnd();
  }

  _runPending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((s) => s.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((s) => s.at > this.time);
    for (const s of due) {
      const m = levelMultiplier(s.level);
      for (const e of this.entities.values()) {
        if (e.dead || e.owner === s.owner) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) - e.radius <= s.card.radius) {
          const mul = e.kind === 'tower' ? s.card.towerDamageMul : 1;
          this._damage(e, s.card.damage * m * mul);
        }
      }
      this.events.push({ k: 'spellHit', c: s.card.id, o: s.owner, x: r2(s.x), y: r2(s.y), r: s.card.radius });
    }
  }

  _update(e, dt) {
    if (e.kind === 'structure') {
      e.lifeLeft -= dt;
      e.hp -= (e.maxHp / e.lifeTotal) * dt; // فرسایش تدریجی
      if (e.hp <= 0 || e.lifeLeft <= 0) return this._kill(e);
    }
    if (e.deployLeft > 0) {
      e.deployLeft -= dt;
      return;
    }
    e.cd = Math.max(0, e.cd - dt);

    if (e.spawn) {
      e.spawn.timer -= dt;
      if (e.spawn.timer <= 0) {
        e.spawn.timer += e.spawn.interval;
        const dir = e.owner === 0 ? -1 : 1;
        this._spawnUnit(e.owner, TOKENS[e.spawn.token], e.spawn.level, e.x, e.y + dir * (e.radius + 0.5), 0.5);
      }
    }
    if (e.damage <= 0) return; // دیوار/لانه: بدون حمله

    let t = e.targetId ? this.entities.get(e.targetId) : null;
    const keep = e.kind === 'unit' ? e.range + 0.6 : e.range;
    if (!(t && this._canTarget(e, t) && this._edge(e, t) <= keep)) t = this._acquire(e);
    e.targetId = t ? t.id : null;
    if (!t) return;

    if (this._edge(e, t) <= e.range) {
      if (e.cd <= 0) this._attack(e, t);
    } else if (e.kind === 'unit') {
      this._move(e, t, dt);
    }
  }

  // ───────────────────────── هدف‌گیری ─────────────────────────

  _edge(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
  }

  /** آیا a مجاز به آسیب‌زدن به b است؟ (زمینی/هوایی و نوع هدف) */
  _canTarget(a, b) {
    if (b.dead || b.owner === a.owner) return false;
    if (b.air ? !a.attacksAir : !a.attacksGround) return false;
    if (a.kind !== 'unit' && b.kind === 'tower') return false;
    if (a.targetMode === 'buildings' && b.kind === 'unit') return false;
    return true;
  }

  _acquire(a) {
    const reach = a.kind === 'unit' ? this.rules.aggroRange : a.range;
    let best = null;
    let bd = Infinity;
    for (const b of this.entities.values()) {
      if (!this._canTarget(a, b)) continue;
      const d = this._edge(a, b);
      if (d <= reach && d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best || a.kind !== 'unit') return best;

    // هدف پیش‌فرض راهپیمایی: نزدیک‌ترین برج زنده‌ی دشمن (برای تانک‌ها: هر ساختمان)
    let march = null;
    let md = Infinity;
    for (const b of this.entities.values()) {
      if (b.kind === 'unit' || !this._canTarget(a, b)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < md) {
        md = d;
        march = b;
      }
    }
    return march;
  }

  _attack(a, t) {
    a.cd = a.hitSpeed;
    this.events.push({ k: 'atk', a: a.id, b: t.id, r: a.range > 1 ? 1 : 0, s: a.splash > 0 ? 1 : 0 });
    if (a.splash > 0) {
      for (const b of this.entities.values()) {
        if (!this._canTarget(a, b)) continue;
        if (Math.hypot(b.x - t.x, b.y - t.y) - b.radius <= a.splash) this._damage(b, a.damage);
      }
    } else {
      this._damage(t, a.damage);
    }
  }

  _damage(e, amount) {
    if (e.dead) return;
    e.hp -= amount;
    if (e.hp <= 0) this._kill(e);
  }

  _kill(e) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    this.events.push({ k: 'die', id: e.id, c: e.cardId, o: e.owner, t: e.kind, x: r2(e.x), y: r2(e.y) });
    if (e.kind === 'tower') {
      this.players[1 - e.owner].stats.towersDestroyed++;
      if (e.role === 'king') this.kingDead[e.owner] = true;
    }
  }

  // ───────────────────────── حرکت ─────────────────────────

  _move(e, t, dt) {
    let gx = t.x;
    let gy = t.y;
    if (!e.air) [gx, gy] = this._groundGoal(e, t);
    e.goal = { x: gx, y: gy };
    const dx = gx - e.x;
    const dy = gy - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;
    const step = Math.min(e.speed * dt, dist);
    e.x += (dx / dist) * step;
    e.y += (dy / dist) * step;
  }

  /**
   * مقصد میانی واحد زمینی: برای عبور از رودخانه حتماً از پل می‌گذرد.
   * بدون حالت درونی: فقط از موقعیت فعلی واحد و هدف محاسبه می‌شود.
   */
  _groundGoal(e, t) {
    const { top, bottom } = ARENA.river;
    const mid = (top + bottom) / 2;
    const inBand = e.y > top && e.y < bottom;
    const eSide = e.y > mid ? 1 : 0; // ۱ = نیمه‌ی پایین
    const tSide = t.y > mid ? 1 : 0;
    if (!inBand && eSide === tSide) return [t.x, t.y];

    if (inBand) {
      const br = this._nearestBridge(e.x);
      const exitY = tSide === 1 ? bottom + 0.4 : top - 0.4;
      return [clamp(e.x, br.x - br.halfWidth + 0.4, br.x + br.halfWidth - 0.4), exitY];
    }

    // انتخاب پل: کمترین مسیر تقریبی
    let br = ARENA.bridges[0];
    let bestCost = Infinity;
    for (const b of ARENA.bridges) {
      const c = Math.abs(e.x - b.x) + Math.abs(b.x - t.x);
      if (c < bestCost) {
        bestCost = c;
        br = b;
      }
    }
    const edgeY = eSide === 1 ? bottom : top;
    const approachY = eSide === 1 ? bottom + 0.4 : top - 0.4;
    const exitY = eSide === 1 ? top - 0.4 : bottom + 0.4;
    const near = Math.abs(e.y - edgeY) <= 0.9 && Math.abs(e.x - br.x) <= br.halfWidth - 0.4;
    if (near) return [clamp(e.x, br.x - br.halfWidth + 0.4, br.x + br.halfWidth - 0.4), exitY];
    return [br.x, approachY];
  }

  _nearestBridge(x) {
    let best = ARENA.bridges[0];
    for (const b of ARENA.bridges) if (Math.abs(x - b.x) < Math.abs(x - best.x)) best = b;
    return best;
  }

  /** جداسازی واحدها، برخورد با موانع، محدودیت رودخانه و مرزها */
  _resolveMovement(list, dt) {
    const movers = list.filter((e) => e.kind === 'unit' && !e.dead);
    const obstacles = list.filter((e) => (e.kind === 'tower' || e.kind === 'structure') && !e.dead);

    // جداسازی دو به دو (زمینی با زمینی، هوایی با هوایی)
    for (let i = 0; i < movers.length; i++) {
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i];
        const b = movers[j];
        if (a.air !== b.air) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = (a.radius + b.radius) * 0.9;
        if (d >= min) continue;
        if (d < 1e-4) {
          dx = (a.id % 2 ? 1 : -1) * 0.01;
          dy = 0.01;
          d = Math.hypot(dx, dy);
        }
        const push = min - d;
        const ma = a.radius * a.radius;
        const mb = b.radius * b.radius;
        const wa = mb / (ma + mb);
        const wb = ma / (ma + mb);
        a.x -= (dx / d) * push * wa;
        a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.y += (dy / d) * push * wb;
      }
    }

    for (const e of movers) {
      if (!e.air) {
        // موانع: برج‌ها و سازه‌ها (با لغزش جانبی برای جلوگیری از گیرکردن)
        for (const o of obstacles) {
          const dx = e.x - o.x;
          const dy = e.y - o.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const min = e.radius + o.radius;
          if (d >= min) continue;
          const nx = dx / d;
          const ny = dy / d;
          e.x = o.x + nx * min;
          e.y = o.y + ny * min;
          if (e.goal) {
            const tx = -ny;
            const ty = nx;
            const sign = tx * (e.goal.x - e.x) + ty * (e.goal.y - e.y) >= 0 ? 1 : -1;
            e.x += tx * sign * e.speed * dt * 0.6;
            e.y += ty * sign * e.speed * dt * 0.6;
          }
        }
        this._constrainRiver(e);
      }
      e.x = clamp(e.x, e.radius, ARENA.width - e.radius);
      e.y = clamp(e.y, e.radius, ARENA.height - e.radius);
    }
  }

  /** واحد زمینی هرگز روی آب نمی‌ماند: یا روی پل می‌ماند یا به ساحل برمی‌گردد */
  _constrainRiver(e) {
    const { top, bottom } = ARENA.river;
    if (!(e.y > top && e.y < bottom)) return;
    const br = this._nearestBridge(e.x);
    const lo = br.x - br.halfWidth + 0.2;
    const hi = br.x + br.halfWidth - 0.2;
    const cx = clamp(e.x, lo, hi);
    if (Math.abs(cx - e.x) > 0.6) {
      e.y = e.y < (top + bottom) / 2 ? top : bottom; // به نزدیک‌ترین ساحل
    } else {
      e.x = cx;
    }
  }

  // ───────────────────────── پایان نبرد ─────────────────────────

  _checkEnd() {
    if (this.over) return;
    const [k0, k1] = this.kingDead;
    if (k0 || k1) {
      if (k0 && k1) return this._finish(null, 'kings');
      return this._finish(k0 ? 1 : 0, 'king');
    }
    if (this.time >= this.rules.durationSec) {
      const d0 = this.players[0].stats.towersDestroyed;
      const d1 = this.players[1].stats.towersDestroyed;
      if (d0 > d1) return this._finish(0, 'time');
      if (d1 > d0) return this._finish(1, 'time');
      return this._finish(null, 'time'); // مساوی صریح (BATTLE.tiebreak = 'draw')
    }
  }

  _finish(winner, reason) {
    if (this.over) return;
    this.over = true;
    this.result = {
      winner, // 0 | 1 | null(مساوی)
      reason, // king | kings | time | forfeit | leave | disconnect
      time: r2(this.time),
      stats: this.players.map((p) => ({ ...p.stats })),
    };
    this.events.push({ k: 'end', winner, reason });
  }

  // ───────────────────────── خروجی برای شبکه ─────────────────────────

  flushEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  _serialize(e) {
    const o = {
      i: e.id,
      c: e.cardId,
      o: e.owner,
      k: e.kind === 'unit' ? 'u' : e.kind === 'structure' ? 's' : 't',
      x: r2(e.x),
      y: r2(e.y),
      h: Math.max(0, Math.ceil(e.hp)),
      m: Math.round(e.maxHp),
    };
    if (e.air) o.a = 1;
    if (e.deployLeft > 0) o.d = r2(e.deployLeft);
    if (e.targetId) o.g = e.targetId;
    if (e.dead) o.z = 1;
    if (e.kind === 'structure') o.l = r2(e.lifeLeft / e.lifeTotal);
    return o;
  }

  /** وضعیت قابل نمایش برای بازیکن owner (اکسیر و دست حریف پنهان است) */
  snapshotFor(owner) {
    const p = this.players[owner];
    return {
      t: r2(this.time),
      left: r2(Math.max(0, this.rules.durationSec - this.time)),
      you: { o: owner, elixir: r2(p.elixir), hand: p.deck.hand.slice(), next: p.deck.next },
      td: [this.players[0].stats.towersDestroyed, this.players[1].stats.towersDestroyed],
      e: [...this.entities.values()].map((e) => this._serialize(e)),
    };
  }
}
