// خواندن تنظیمات محیطی (.env). هیچ رازی در کد قرار نمی‌گیرد.
import 'dotenv/config';

export function loadConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);
  return {
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000,
    gameName: (env.GAME_NAME ?? 'Project Arena').slice(0, 40),
    nodeEnv: env.NODE_ENV ?? 'development',
    isProd: (env.NODE_ENV ?? 'development') === 'production',
    corsOrigins: (env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
