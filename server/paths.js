import os from 'node:os';
import path from 'node:path';

const home = os.homedir();

export const DB_PATH =
  process.env.RTKDASH_DB || path.join(home, '.local', 'share', 'rtk', 'history.db');

export const CONFIG_DIR =
  process.env.RTKDASH_CONFIG_DIR || path.join(home, '.config', 'rtk');

export const RTK_BIN = process.env.RTKDASH_RTK_BIN || 'rtk';

export const API_PORT = Number(process.env.RTKDASH_API_PORT || 5178);

/** Loopback by default. Only widen this behind an authenticating proxy. */
export const API_HOST = process.env.RTKDASH_HOST || '127.0.0.1';

/**
 * Origins allowed to call /api. Loopback is always permitted; add the public
 * hostname a reverse proxy serves the dashboard on, comma-separated, or set
 * `*` to skip the check entirely (only safe when the proxy authenticates).
 */
export const ALLOWED_ORIGINS = (process.env.RTKDASH_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const READONLY = process.env.RTKDASH_READONLY === '1';

/** Files under CONFIG_DIR the editor is allowed to touch. */
export const EDITABLE_FILES = ['config.toml', 'filters.toml'];
