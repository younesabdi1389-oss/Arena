import crypto from 'node:crypto';
import { Player } from './Player.js';

// ذخیره‌ی نشست‌ها فعلاً در حافظه است (مرحله‌ی ۱). با ریست سرور، نشست مهمان‌ها از بین می‌رود.
// در مرحله‌ی حساب دائمی، همین رابط با PostgreSQL پیاده‌سازی می‌شود (server/db).

export const NAME_RE = /^[\p{L}\p{N}_\- ]{2,16}$/u;

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  return NAME_RE.test(name) ? name : null;
}

export class SessionService {
  constructor({ idleMs = 24 * 60 * 60 * 1000, log } = {}) {
    this.idleMs = idleMs;
    this.log = log;
    this.byToken = new Map();
    this.byId = new Map();
  }

  createGuest(rawName) {
    const name = sanitizeName(rawName) ?? `Guest ${1000 + crypto.randomInt(9000)}`;
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('base64url');
    const player = new Player({ id, name, token });
    this.byToken.set(token, player);
    this.byId.set(id, player);
    this.log?.info(`guest created ${id}`);
    return player;
  }

  resolve(token) {
    if (typeof token !== 'string' || token.length > 100) return null;
    const p = this.byToken.get(token);
    if (!p) return null;
    p.touch();
    return p;
  }

  /** حذف مهمان‌های غیرفعال که در نبرد/صف نیستند */
  sweep() {
    const now = Date.now();
    for (const [token, p] of this.byToken) {
      if (p.status !== 'idle' || p.connected) continue;
      if (now - p.lastSeen > this.idleMs) {
        this.byToken.delete(token);
        this.byId.delete(p.id);
      }
    }
  }
}
