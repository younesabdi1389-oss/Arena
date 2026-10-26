import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف/ارقام مشابه (O/0, I/1)
export const ROOM_TTL_MS = 10 * 60 * 1000;

/** نبرد دوستانه با کد اتاق ۵ نویسه‌ای */
export class FriendlyRooms {
  constructor({ battles, log }) {
    this.battles = battles;
    this.log = log;
    this.rooms = new Map(); // code -> { host, deck, createdAt }
  }

  _newCode() {
    for (let tries = 0; tries < 20; tries++) {
      let code = '';
      for (let i = 0; i < 5; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('could not allocate room code');
  }

  create(player, deck) {
    if (player.status !== 'idle') return { ok: false, code: 'busy' };
    const code = this._newCode();
    this.rooms.set(code, { host: player, deck, createdAt: Date.now() });
    player.status = 'room';
    player.roomCode = code;
    return { ok: true, code };
  }

  join(player, rawCode, deck) {
    if (player.status !== 'idle') return { ok: false, code: 'busy' };
    const code = String(rawCode ?? '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room || Date.now() - room.createdAt > ROOM_TTL_MS) {
      this.rooms.delete(code);
      return { ok: false, code: 'room_not_found' };
    }
    if (room.host === player) return { ok: false, code: 'self_join' };
    if (!room.host.connected || room.host.status !== 'room') {
      this.rooms.delete(code);
      return { ok: false, code: 'room_not_found' };
    }
    this.rooms.delete(code);
    this.battles.start({
      mode: 'friendly',
      entries: [
        { player: room.host, name: room.host.name, deck: room.deck },
        { player, name: player.name, deck },
      ],
    });
    return { ok: true };
  }

  /** لغو اتاق توسط میزبان یا هنگام قطع اتصال */
  cancel(player) {
    if (player.roomCode) this.rooms.delete(player.roomCode);
    if (player.status === 'room') player.status = 'idle';
    player.roomCode = null;
  }

  sweep() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (now - r.createdAt > ROOM_TTL_MS) {
        this.rooms.delete(code);
        if (r.host.status === 'room') r.host.status = 'idle';
        r.host.roomCode = null;
        r.host.emit('room:expired', { code });
      }
    }
  }
}
