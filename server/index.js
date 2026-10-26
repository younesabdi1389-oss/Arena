import { loadConfig } from './config.js';
import { createGameServer } from './app.js';

const config = loadConfig();
const server = createGameServer(config);

const port = await server.listen(config.port);
console.log(`${config.gameName} — http://localhost:${port}  (${config.nodeEnv})`);

const shutdown = async () => {
  console.log('shutting down...');
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
