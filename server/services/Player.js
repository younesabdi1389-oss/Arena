import { TokenBucket } from '../util/rateLimit.js';

/**
 * بازیکن متصل (در این مرحله: مهمان). فقط یک «socket» با متد emit لازم دارد؛
 * به همین دلیل منطق اتاق و مسابقه‌یابی بدون Socket.IO هم قابل تست است.
 */
export class Player {
  constructor({ id, name, token }) {
    this.id = id;
    this.name = name;
    this.token = token;
    this.isGuest = true;
    this.socket = null;
    this.status = 'idle'; // idle | queue | room | battle
    this.battleId = null;
    this.roomCode = null;
    this.createdAt = Date.now();
    this.lastSeen = Date.now();
    this.buckets = {
      play: new TokenBucket(6, 4),
      emote: new TokenBucket(2, 0.3),
      join: new TokenBucket(5, 0.5),
    };
    this.invalidCount = 0;
  }

  get connected() {
    return !!this.socket && this.socket.connected !== false;
  }

  emit(event, payload) {
    if (this.connected) this.socket.emit(event, payload);
  }

  touch() {
    this.lastSeen = Date.now();
  }

  /** نمایه‌ی عمومی (فعلاً فقط نام؛ آواتار/سطح/جام در مراحل بعد) */
  publicProfile() {
    return { id: this.id, name: this.name };
  }
}
