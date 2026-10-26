// اتاق نبرد: Battle را با ساعت واقعی جلو می‌برد، snapshot ها را می‌فرستد،
// قطع/اتصال مجدد (۳۰ ثانیه مهلت) و خروج عمدی را مدیریت می‌کند.

import { BATTLE, EMOTES } from '../../shared/config.js';
import { Battle } from '../game/Battle.js';
import { BotController } from '../game/BotController.js';
import { randomSeed } from '../util/rng.js';

export class BattleRoom {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {string} o.mode  'online' | 'friendly' | 'practice'
   * @param {Array<{player?:object, name:string, deck:string[], ai?:string}>} o.entries  index = owner
   * @param {object} [o.rules]
   * @param {(room:BattleRoom)=>void} [o.onFinish]
   */
  constructor({ id, mode, entries, rules, log, onFinish, seed = randomSeed(), now = () => performance.now() }) {
    this.id = id;
    this.mode = mode;
    this.entries = entries;
    this.log = log;
    this.onFinish = onFinish;
    this.now = now;
    this.battle = new Battle({
      id,
      seed,
      rules,
      players: entries.map((e) => ({ name: e.name, deck: e.deck })),
    });
    this.rules = this.battle.rules;
    this.bots = [];
    entries.forEach((e, owner) => {
      if (e.ai) this.bots[owner] = new BotController(this.battle, owner, e.ai, seed + owner * 31);
    });
    this.dtMs = 1000 / this.rules.tickRate;
    this.acc = 0;
    this.last = this.now();
    this.timer = null;
    this.grace = [null, null];
    this.finished = false;
  }

  ownerOf(player) {
    return this.entries.findIndex((e) => e.player === player);
  }

  humans() {
    return this.entries.map((e, owner) => ({ ...e, owner })).filter((e) => e.player);
  }

  // ───────────────────────── چرخه‌ی حیات ─────────────────────────

  start() {
    for (const h of this.humans()) {
      h.player.status = 'battle';
      h.player.battleId = this.id;
      h.player.roomCode = null;
    }
    for (const h of this.humans()) this._sendStart(h.owner, false);
    this._broadcast();
    this.last = this.now();
    this.timer = setInterval(() => this.pump(), this.dtMs / 2);
    this.log?.info(`battle ${this.id} started (${this.mode})`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (let i = 0; i < 2; i++) {
      if (this.grace[i]) clearTimeout(this.grace[i]);
      this.grace[i] = null;
    }
  }

  /** با ساعت واقعی tick ها را اجرا می‌کند (حداکثر ۵ تیک جبرانی در هر بار) */
  pump() {
    const t = this.now();
    this.acc += t - this.last;
    this.last = t;
    let steps = 0;
    while (this.acc >= this.dtMs && steps < 5 && !this.finished) {
      this.step();
      this.acc -= this.dtMs;
      steps++;
    }
    if (steps === 5) this.acc = 0;
  }

  /** یک تیک کامل: AI ← شبیه‌سازی ← ارسال */
  step() {
    if (this.finished) return;
    const dt = 1 / this.rules.tickRate;
    for (const bot of this.bots) bot?.update(dt);
    this.battle.tick(dt);
    if (this.battle.tickCount % this.rules.snapshotEvery === 0 || this.battle.over) this._broadcast();
    if (this.battle.over) this._finish();
  }

  // ───────────────────────── ارتباط با کلاینت ─────────────────────────

  _sendStart(owner, resumed) {
    const e = this.entries[owner];
    const opp = this.entries[1 - owner];
    e.player?.emit('battle:start', {
      battleId: this.id,
      mode: this.mode,
      side: owner,
      resumed,
      opponent: { name: opp.name, ai: !!opp.ai },
      durationSec: this.rules.durationSec,
      rules: { elixir: this.rules.elixir, deployTimeSec: this.rules.deployTimeSec },
      snapshot: this.battle.snapshotFor(owner),
    });
  }

  _broadcast() {
    const ev = this.battle.flushEvents();
    for (const h of this.humans()) {
      h.player.emit('battle:snap', { ...this.battle.snapshotFor(h.owner), ev });
    }
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.stop();
    const res = this.battle.result;
    for (const h of this.humans()) {
      const p = h.player;
      if (p.battleId === this.id) {
        p.status = 'idle';
        p.battleId = null;
      }
      const mine = res.stats[h.owner];
      const theirs = res.stats[1 - h.owner];
      p.emit('battle:end', {
        battleId: this.id,
        mode: this.mode,
        outcome: res.winner === null ? 'draw' : res.winner === h.owner ? 'win' : 'lose',
        reason: res.reason,
        time: res.time,
        stats: {
          cardsPlayed: mine.cardsPlayed,
          unitsSpawned: mine.unitsSpawned,
          elixirSpent: mine.elixirSpent,
          towersDestroyed: mine.towersDestroyed, // برج‌های حریف که نابود کردی
          towersLost: theirs.towersDestroyed, // برج‌های خودت که نابود شد
        },
      });
    }
    this.log?.info(`battle ${this.id} finished winner=${res.winner} reason=${res.reason}`);
    this.onFinish?.(this);
  }

  // ───────────────────────── ورودی‌ها ─────────────────────────

  play(player, slot, x, y) {
    const owner = this.ownerOf(player);
    if (owner < 0) return { ok: false, code: 'not_in_battle' };
    return this.battle.playCard(owner, slot, x, y);
  }

  emote(player, id) {
    const owner = this.ownerOf(player);
    if (owner < 0 || this.finished) return false;
    if (!EMOTES.some((e) => e.id === id)) return false;
    player.emit('battle:emote', { from: 'you', id });
    this.entries[1 - owner].player?.emit('battle:emote', { from: 'opponent', id });
    return true;
  }

  /** خروج عمدی (کلاینت قبلاً تأیید گرفته است) = باخت */
  leave(player) {
    const owner = this.ownerOf(player);
    if (owner < 0 || this.finished) return;
    this.battle.forfeit(owner, 'leave');
    this._broadcast();
    this._finish();
  }

  /** قطع اتصال: نبرد ادامه دارد و بازیکن مهلت اتصال مجدد دارد. بسته‌شدن صفحه ≠ خروج عمدی. */
  handleDisconnect(player) {
    const owner = this.ownerOf(player);
    if (owner < 0 || this.finished || this.grace[owner]) return;
    this.grace[owner] = setTimeout(() => {
      this.grace[owner] = null;
      if (this.finished) return;
      this.battle.forfeit(owner, 'disconnect');
      this._broadcast();
      this._finish();
    }, this.rules.reconnectGraceSec * 1000);
    this.log?.info(`battle ${this.id}: player ${owner} disconnected, grace started`);
  }

  handleReconnect(player) {
    const owner = this.ownerOf(player);
    if (owner < 0 || this.finished) return;
    if (this.grace[owner]) clearTimeout(this.grace[owner]);
    this.grace[owner] = null;
    this._sendStart(owner, true);
    this.log?.info(`battle ${this.id}: player ${owner} reconnected`);
  }
}
