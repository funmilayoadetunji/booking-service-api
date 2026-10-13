import { createApp } from './app.js';
import { config } from './config/env.js';
import { createPool } from './db/pool.js';

const pool = createPool(config);
const app = createApp(pool, config);

const server = app.listen(config.port, () => {
  console.log(`Booking Service API listening on http://localhost:${config.port}`);
  console.log(`Swagger UI available at http://localhost:${config.port}/docs`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received; shutting down gracefully.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
