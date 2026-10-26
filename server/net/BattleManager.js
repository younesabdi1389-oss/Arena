import crypto from 'node:crypto';
import { BattleRoom } from './BattleRoom.js';

/** نگه‌دارنده‌ی نبردهای فعال؛ تنها نقطه‌ی ساخت BattleRoom */
export class BattleManager {
  constructor({ log, rules } = {}) {
    this.log = log;
    this.rules = rules; // override قوانین برای کل سرور (فقط تست/توسعه)
    this.rooms = new Map();
  }

  start({ mode, entries, rules }) {
    const id = crypto.randomUUID();
    const room = new BattleRoom({
      id,
      mode,
      entries,
      rules: { ...this.rules, ...rules },
      log: this.log,
      onFinish: (r) => this.rooms.delete(r.id),
    });
    this.rooms.set(id, room);
    room.start();
    return room;
  }

  get(id) {
    return this.rooms.get(id) ?? null;
  }

  getForPlayer(player) {
    return player.battleId ? this.get(player.battleId) : null;
  }

  shutdown() {
    for (const r of this.rooms.values()) r.stop();
    this.rooms.clear();
  }
}
