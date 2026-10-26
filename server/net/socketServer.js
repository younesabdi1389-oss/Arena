// اتصال Socket.IO به handlers. تمام منطق در handlers.js/BattleRoom.js است؛ اینجا فقط سیم‌کشی است.
import { onPlayerConnected, onPlayerDisconnected } from './handlers.js';

const EVENTS = [
  'queue:join', 'queue:leave', 'room:create', 'room:join', 'room:cancel',
  'practice:start', 'battle:play', 'battle:emote', 'battle:leave',
];

export function attachSocketServer(io, ctx) {
  // احراز هویت: توکن نشست که از POST /api/guest گرفته شده
  io.use((socket, next) => {
    const player = ctx.sessions.resolve(socket.handshake.auth?.token);
    if (!player) return next(new Error('unauthorized'));
    socket.data.player = player;
    next();
  });

  io.on('connection', (socket) => {
    const player = socket.data.player;

    // اتصال جدید جایگزین اتصال قبلی همان حساب می‌شود (مثلاً تب دوم یا اتصال مجدد موبایل)
    const old = player.socket;
    player.socket = socket;
    if (old && old !== socket) {
      old.emit('session:replaced');
      old.disconnect(true);
    }

    socket.emit('session:ready', { player: player.publicProfile(), status: player.status });
    onPlayerConnected(player, ctx);

    for (const ev of EVENTS) {
      socket.on(ev, (raw, ack) => {
        let res;
        try {
          player.touch();
          res = ctx.handlers[ev](player, raw) ?? { ok: true };
        } catch (err) {
          ctx.log.error(`handler ${ev} failed`, err);
          res = { ok: false, code: 'server_error' };
        }
        if (typeof ack === 'function') ack(res);
      });
    }

    socket.on('disconnect', () => {
      if (player.socket !== socket) return; // قبلاً جایگزین شده
      player.socket = null;
      onPlayerDisconnected(player, ctx);
    });
  });
}
