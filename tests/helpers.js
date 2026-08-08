import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

/** Mirrors the schema rtk creates, so tests exercise the real queries. */
export const SCHEMA = `
  CREATE TABLE commands (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    original_cmd TEXT NOT NULL,
    rtk_cmd TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    saved_tokens INTEGER NOT NULL,
    savings_pct REAL NOT NULL,
    exec_time_ms INTEGER DEFAULT 0,
    project_path TEXT DEFAULT ''
  );
  CREATE TABLE parse_failures (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    raw_command TEXT NOT NULL,
    error_message TEXT NOT NULL,
    fallback_succeeded INTEGER NOT NULL DEFAULT 0
  );
`;

/** rtk writes RFC3339 with a nanosecond fraction and an explicit +00:00. */
export function rtkTimestamp(iso) {
  return `${new Date(iso).toISOString().replace('Z', '')}000000+00:00`;
}

let counter = 0;

/**
 * Creates a throwaway rtk-shaped database.
 *
 * @param {{commands?: any[], failures?: any[]}} data
 * @returns {{dir: string, dbPath: string, configDir: string, cleanup: () => void}}
 */
export function makeFixture({ commands = [], failures = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rtkdash-test-${counter++}-`));
  const dbPath = path.join(dir, 'history.db');
  const configDir = path.join(dir, 'config');
  fs.mkdirSync(configDir);

  const db = new Database(dbPath);
  db.exec(SCHEMA);

  const insert = db.prepare(
    `INSERT INTO commands
       (timestamp, original_cmd, rtk_cmd, input_tokens, output_tokens, saved_tokens,
        savings_pct, exec_time_ms, project_path)
     VALUES (@timestamp, @originalCmd, @rtkCmd, @inputTokens, @outputTokens, @savedTokens,
             @savingsPct, @execTimeMs, @project)`
  );
  for (const row of commands) {
    const input = row.inputTokens ?? 100;
    const saved = row.savedTokens ?? 0;
    insert.run({
      timestamp: rtkTimestamp(row.at),
      originalCmd: row.originalCmd ?? 'git status',
      rtkCmd: row.rtkCmd ?? 'rtk git status',
      inputTokens: input,
      outputTokens: row.outputTokens ?? input - saved,
      savedTokens: saved,
      savingsPct: row.savingsPct ?? (input > 0 ? (saved / input) * 100 : 0),
      execTimeMs: row.execTimeMs ?? 0,
      project: row.project ?? '/home/dev/app',
    });
  }

  const insertFailure = db.prepare(
    `INSERT INTO parse_failures (timestamp, raw_command, error_message, fallback_succeeded)
     VALUES (?, ?, ?, ?)`
  );
  for (const f of failures) {
    insertFailure.run(rtkTimestamp(f.at), f.rawCommand, f.errorMessage, f.fallbackSucceeded ?? 0);
  }

  db.close();

  return {
    dir,
    dbPath,
    configDir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * Loads a fresh copy of the app bound to a fixture. paths.js reads env at
 * import time, so the module graph has to be reset per configuration.
 */
export async function loadApp(env = {}) {
  const { vi } = await import('vitest');
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  const { createApp } = await import('../server/app.js');
  return createApp({ serveStatic: false });
}
