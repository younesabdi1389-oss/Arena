// منطق رویدادهای کلاینت — مستقل از Socket.IO (فقط به player و ctx وابسته است)،
// پس بدون سوکت واقعی هم قابل تست است. socketServer.js فقط این‌ها را به رویدادهای سوکت وصل می‌کند.

import { parseDeck, parseDifficulty, parsePlay } from './validate.js';

const WARN_AFTER_INVALID = 20;

function invalid(player, ctx, what) {
  player.invalidCount++;
  if (player.invalidCount === WARN_AFTER_INVALID) {
    ctx.log?.warn(`player ${player.id} sent ${player.invalidCount} invalid requests (${what})`);
  }
}

export function createHandlers(ctx) {
  const { matchmaker, friendly, battles } = ctx;

  return {
    'queue:join'(player, raw) {
      if (!player.buckets.join.take()) return { ok: false, code: 'rate_limited' };
      const d = parseDeck(raw?.deck);
      if (!d.ok) return invalid(player, ctx, 'deck'), d;
      return matchmaker.join(player, d.deck);
    },

    'queue:leave'(player) {
      return { ok: matchmaker.leave(player) };
    },

    'room:create'(player, raw) {
      if (!player.buckets.join.take()) return { ok: false, code: 'rate_limited' };
      const d = parseDeck(raw?.deck);
      if (!d.ok) return invalid(player, ctx, 'deck'), d;
      return friendly.create(player, d.deck);
    },

    'room:join'(player, raw) {
      if (!player.buckets.join.take()) return { ok: false, code: 'rate_limited' };
      const d = parseDeck(raw?.deck);
      if (!d.ok) return invalid(player, ctx, 'deck'), d;
      if (typeof raw?.code !== 'string' || raw.code.length > 12) return invalid(player, ctx, 'code'), { ok: false, code: 'room_not_found' };
      return friendly.join(player, raw.code, d.deck);
    },

    'room:cancel'(player) {
      friendly.cancel(player);
      return { ok: true };
    },

    'practice:start'(player, raw) {
      if (!player.buckets.join.take()) return { ok: false, code: 'rate_limited' };
      if (player.status !== 'idle') return { ok: false, code: 'busy' };
      const d = parseDeck(raw?.deck);
      if (!d.ok) return invalid(player, ctx, 'deck'), d;
      const difficulty = parseDifficulty(raw?.difficulty);
      // دسته‌ی AI: پیش‌فرض بازی (می‌تواند بعداً بر اساس سطح بازیکن انتخاب شود)
      battles.start({
        mode: 'practice',
        entries: [
          { player, name: player.name, deck: d.deck },
          { name: ctx.aiNames[difficulty], deck: ctx.aiDeck.slice(), ai: difficulty },
        ],
      });
      return { ok: true };
    },

    'battle:play'(player, raw) {
      if (!player.buckets.play.take()) return { ok: false, code: 'rate_limited' };
      const room = battles.getForPlayer(player);
      if (!room) return { ok: false, code: 'not_in_battle' };
      const p = parsePlay(raw);
      if (!p) return invalid(player, ctx, 'play'), { ok: false, code: 'bad_coords' };
      const res = room.play(player, p.slot, p.x, p.y);
      if (!res.ok && res.code !== 'no_elixir') invalid(player, ctx, `play:${res.code}`);
      return res;
    },

    'battle:emote'(player, raw) {
      if (!player.buckets.emote.take()) return { ok: false, code: 'rate_limited' };
      const room = battles.getForPlayer(player);
      if (!room) return { ok: false, code: 'not_in_battle' };
      return { ok: room.emote(player, raw?.id) };
    },

    'battle:leave'(player) {
      const room = battles.getForPlayer(player);
      if (!room) return { ok: false, code: 'not_in_battle' };
      room.leave(player);
      return { ok: true };
    },
  };
}

/** وقتی سوکت بازیکن قطع شد (بسته‌شدن صفحه/قطع اینترنت) */
export function onPlayerDisconnected(player, ctx) {
  ctx.matchmaker.leave(player);
  ctx.friendly.cancel(player);
  ctx.battles.getForPlayer(player)?.handleDisconnect(player);
}

/** وقتی بازیکن (دوباره) وصل شد */
export function onPlayerConnected(player, ctx) {
  ctx.battles.getForPlayer(player)?.handleReconnect(player);
}
