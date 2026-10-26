// ساخت سرور HTTP + Socket.IO. index.js فقط آن را اجرا می‌کند؛ تست‌ها هم از همین استفاده می‌کنند.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { createContext } from './context.js';
import { attachSocketServer } from './net/socketServer.js';
import { KeyedLimiter } from './util/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export function createGameServer(config, ctxOptions = {}) {
  const ctx = createContext({ logLevel: config.logLevel, ...ctxOptions });
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'",
    );
    next();
  });
  app.use(express.json({ limit: '2kb' }));

  const guestLimiter = new KeyedLimiter(5, 5 / 60); // ۵ حساب مهمان در دقیقه برای هر IP
  const limiterSweep = setInterval(() => guestLimiter.sweep(), 5 * 60 * 1000);
  limiterSweep.unref?.();

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get('/api/config', (req, res) => res.json({ gameName: config.gameName }));

  app.post('/api/guest', (req, res) => {
    if (!guestLimiter.take(req.ip)) return res.status(429).json({ ok: false, code: 'rate_limited' });
    const player = ctx.sessions.createGuest(req.body?.name);
    res.json({ ok: true, token: player.token, player: player.publicProfile() });
  });

  // اعتبارسنجی نشست موجود (برای ورود مجدد با توکن ذخیره‌شده)
  app.post('/api/session', (req, res) => {
    const player = ctx.sessions.resolve(req.body?.token);
    if (!player) return res.status(401).json({ ok: false, code: 'unauthorized' });
    res.json({ ok: true, player: player.publicProfile() });
  });

  const noCache = config.isProd ? undefined : { setHeaders: (r) => r.setHeader('Cache-Control', 'no-cache') };
  app.use('/shared', express.static(path.join(ROOT, 'shared'), noCache));
  app.use(express.static(path.join(ROOT, 'public'), noCache));

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: config.corsOrigins.length ? { origin: config.corsOrigins } : undefined,
    maxHttpBufferSize: 4 * 1024,
    pingInterval: 5000,
    pingTimeout: 8000,
  });
  attachSocketServer(io, ctx);

  return {
    app,
    httpServer,
    io,
    ctx,
    listen: (port = config.port) =>
      new Promise((resolve) => httpServer.listen(port, () => resolve(httpServer.address().port))),
    close: async () => {
      clearInterval(limiterSweep);
      ctx.shutdown();
      await new Promise((r) => io.close(() => r()));
    },
  };
}
