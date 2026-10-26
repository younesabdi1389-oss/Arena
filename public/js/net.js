// لایه‌ی ارتباط با سرور: REST برای ساخت نشست مهمان، Socket.IO برای نبرد.
// Socket.IO client از /socket.io/socket.io.js (سرور) بارگذاری می‌شود و `io` سراسری است.

const listeners = new Map();
let socket = null;

function dispatch(event, data) {
  for (const fn of listeners.get(event) ?? []) fn(data);
}

export const net = {
  get connected() {
    return !!socket?.connected;
  },

  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },

  async createGuest(name) {
    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw Object.assign(new Error('guest_failed'), { code: data.code ?? 'server_error', status: res.status });
    return data;
  },

  async checkSession(token) {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.ok ? data : null;
  },

  async config() {
    try {
      const res = await fetch('/api/config');
      return await res.json();
    } catch {
      return {};
    }
  },

  connect(token) {
    this.disconnect();
    socket = window.io({ auth: { token }, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 3000 });
    for (const ev of [
      'session:ready', 'session:replaced', 'battle:start', 'battle:snap', 'battle:end', 'battle:emote', 'room:expired',
    ]) {
      socket.on(ev, (data) => dispatch(ev, data));
    }
    socket.on('connect', () => dispatch('net:connect'));
    socket.on('disconnect', (reason) => dispatch('net:disconnect', reason));
    socket.on('connect_error', (err) => dispatch('net:error', err));
  },

  disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
  },

  /** emit با ack و مهلت؛ همیشه { ok, code? } برمی‌گرداند */
  request(event, payload, timeoutMs = 5000) {
    return new Promise((resolve) => {
      if (!socket?.connected) return resolve({ ok: false, code: 'offline' });
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ ok: false, code: 'timeout' });
        }
      }, timeoutMs);
      socket.emit(event, payload, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res ?? { ok: false, code: 'server_error' });
      });
    });
  },
};
