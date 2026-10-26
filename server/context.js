// ساخت سرویس‌های بازی (بدون Express/Socket.IO) — برای اجرا و تست مستقل از شبکه
import { createLogger } from './util/logger.js';
import { SessionService } from './services/sessionService.js';
import { BattleManager } from './net/BattleManager.js';
import { Matchmaker } from './net/Matchmaker.js';
import { FriendlyRooms } from './net/FriendlyRooms.js';
import { createHandlers } from './net/handlers.js';

export function createContext({ logLevel = 'info', rules, matchmaker: mmOpts } = {}) {
  const logger = createLogger(logLevel);
  const log = logger.child('game');
  const sessions = new SessionService({ log });
  const battles = new BattleManager({ log, rules });
  const matchmaker = new Matchmaker({ battles, log, ...mmOpts });
  const friendly = new FriendlyRooms({ battles, log });
  const ctx = {
    log,
    sessions,
    battles,
    matchmaker,
    friendly,
    aiNames: { easy: 'Novice Bot', normal: 'Skilled Bot', hard: 'Master Bot' },
    aiDeck: ['knight', 'wolves', 'archers', 'hawk', 'mage', 'golem', 'hail', 'cannon'],
  };
  ctx.handlers = createHandlers(ctx);

  const sweepTimer = setInterval(() => {
    sessions.sweep();
    friendly.sweep();
  }, 60 * 1000);
  sweepTimer.unref?.();
  matchmaker.start();

  ctx.shutdown = () => {
    clearInterval(sweepTimer);
    matchmaker.stop();
    battles.shutdown();
  };
  return ctx;
}
