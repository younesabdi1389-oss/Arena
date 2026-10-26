const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(level = 'info') {
  const min = LEVELS[level] ?? LEVELS.info;
  const log = (lvl, scope, msg, meta) => {
    if (LEVELS[lvl] < min) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase()} [${scope}] ${msg}`;
    const out = lvl === 'error' || lvl === 'warn' ? console.error : console.log;
    if (meta !== undefined) out(line, meta);
    else out(line);
  };
  return {
    child(scope) {
      return {
        debug: (m, x) => log('debug', scope, m, x),
        info: (m, x) => log('info', scope, m, x),
        warn: (m, x) => log('warn', scope, m, x),
        error: (m, x) => log('error', scope, m, x),
      };
    },
  };
}
