import { env } from './env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level: Level, message: string, meta?: unknown): void {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const time = new Date().toISOString().slice(11, 23);
  const prefix = '[' + time + '] ' + level.toUpperCase().padEnd(5) + ' ' + message;
  if (meta === undefined) console.log(prefix);
  else console.log(prefix, typeof meta === 'string' ? meta : JSON.stringify(meta));
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
