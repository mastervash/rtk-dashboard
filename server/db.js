import fs from 'node:fs';
import Database from 'better-sqlite3';
import { DB_PATH } from './paths.js';

let db = null;

export function getDb() {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    throw Object.assign(new Error(`rtk history database not found at ${DB_PATH}`), {
      status: 503,
    });
  }
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return db;
}

export function dbInfo() {
  let stat = null;
  try {
    stat = fs.statSync(DB_PATH);
  } catch {
    /* missing */
  }
  return {
    path: DB_PATH,
    exists: !!stat,
    sizeBytes: stat ? stat.size : 0,
    mtimeMs: stat ? stat.mtimeMs : 0,
  };
}

/**
 * `rtk git status` -> `git`. Falls back to the first word for rows that were
 * not rewritten into an `rtk <tool>` form.
 */
const TOOL_EXPR = `
  CASE
    WHEN rtk_cmd LIKE 'rtk %' THEN
      CASE
        WHEN instr(substr(rtk_cmd, 5), ' ') > 0
          THEN substr(rtk_cmd, 5, instr(substr(rtk_cmd, 5), ' ') - 1)
        ELSE substr(rtk_cmd, 5)
      END
    WHEN instr(rtk_cmd, ' ') > 0 THEN substr(rtk_cmd, 1, instr(rtk_cmd, ' ') - 1)
    ELSE rtk_cmd
  END`;

/**
 * Day bucket shifted into the viewer's timezone. rtk stores RFC3339 in UTC, so
 * bucketing on the raw string attributes an evening command to the next day for
 * anyone west of UTC. The offset is the browser's `getTimezoneOffset()`, i.e.
 * positive west of UTC, which is why the modifier negates it.
 *
 * The nanosecond fraction and trailing offset are trimmed first because
 * SQLite's date functions reject them.
 */
const DAY_EXPR = `substr(datetime(substr(timestamp, 1, 19), ?), 1, 10)`;

function tzModifier(tzOffset) {
  const minutes = Number(tzOffset);
  return `${Number.isFinite(minutes) ? -Math.trunc(minutes) : 0} minutes`;
}

const DAY_MS = 86_400_000;

/** Every ISO date from `start` to `end` inclusive. */
function dateRange(start, end) {
  const days = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += DAY_MS) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Builds the shared WHERE clause from query params.
 * @param {{days?: any, project?: any, tool?: any, q?: any}} f
 */
export function buildFilter(f = {}) {
  const where = [];
  const params = [];

  const days = Number(f.days ?? 0);
  if (Number.isFinite(days) && days > 0) {
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    where.push('timestamp >= ?');
    params.push(since);
  }
  if (f.project === '') {
    // The UI's "(unknown)" bucket — rows rtk recorded without a project.
    where.push("project_path = ''");
  } else if (f.project) {
    // Match the project and anything nested beneath it. The trailing slash
    // keeps `/home/dev/we` from matching `/home/dev/web`.
    where.push('(project_path = ? OR project_path LIKE ?)');
    params.push(String(f.project), `${String(f.project)}/%`);
  }
  if (f.tool) {
    where.push(`${TOOL_EXPR} = ?`);
    params.push(String(f.tool));
  }
  if (f.q) {
    where.push('(original_cmd LIKE ? OR rtk_cmd LIKE ?)');
    const like = `%${String(f.q)}%`;
    params.push(like, like);
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function summary(filter) {
  const { clause, params } = buildFilter(filter);
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*)                        AS commands,
         COALESCE(SUM(input_tokens), 0)  AS inputTokens,
         COALESCE(SUM(output_tokens), 0) AS outputTokens,
         COALESCE(SUM(saved_tokens), 0)  AS savedTokens,
         COALESCE(AVG(savings_pct), 0)   AS avgSavingsPct,
         COALESCE(SUM(exec_time_ms), 0)  AS totalTimeMs,
         COALESCE(AVG(exec_time_ms), 0)  AS avgTimeMs,
         COUNT(DISTINCT project_path)    AS projects,
         COUNT(DISTINCT ${TOOL_EXPR})    AS tools,
         MIN(timestamp)                  AS firstSeen,
         MAX(timestamp)                  AS lastSeen
       FROM commands ${clause}`
    )
    .get(...params);

  // Weighted rate reflects real token reduction; avgSavingsPct weights every
  // command equally regardless of size.
  row.weightedSavingsPct = row.inputTokens > 0 ? (row.savedTokens / row.inputTokens) * 100 : 0;
  return row;
}

export function timeseries(filter) {
  const { clause, params } = buildFilter(filter);
  const tz = tzModifier(filter?.tzOffset);

  const rows = getDb()
    .prepare(
      `SELECT ${DAY_EXPR}                 AS day,
              COUNT(*)                    AS commands,
              SUM(input_tokens)           AS inputTokens,
              SUM(output_tokens)          AS outputTokens,
              SUM(saved_tokens)           AS savedTokens,
              AVG(savings_pct)            AS avgSavingsPct
         FROM commands ${clause}
        GROUP BY day
        ORDER BY day ASC`
    )
    // The DAY_EXPR placeholder sits in the SELECT list, ahead of the WHERE.
    .all(tz, ...params);

  if (rows.length === 0) return rows;

  // Days with no activity are absent from a GROUP BY, which would compress an
  // idle week into a single narrow gap and overstate the trend. Fill them.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return dateRange(rows[0].day, rows[rows.length - 1].day).map(
    (day) =>
      byDay.get(day) ?? {
        day,
        commands: 0,
        inputTokens: 0,
        outputTokens: 0,
        savedTokens: 0,
        avgSavingsPct: 0,
      }
  );
}

export function projects(filter, limit = 50) {
  const { clause, params } = buildFilter(filter);
  return getDb()
    .prepare(
      `SELECT CASE WHEN project_path = '' THEN '(unknown)' ELSE project_path END AS project,
              COUNT(*)          AS commands,
              SUM(input_tokens) AS inputTokens,
              SUM(saved_tokens) AS savedTokens,
              AVG(savings_pct)  AS avgSavingsPct,
              MAX(timestamp)    AS lastSeen
         FROM commands ${clause}
        GROUP BY project_path
        ORDER BY savedTokens DESC, commands DESC
        LIMIT ?`
    )
    .all(...params, limit);
}

export function tools(filter, limit = 50) {
  const { clause, params } = buildFilter(filter);
  return getDb()
    .prepare(
      `SELECT ${TOOL_EXPR}      AS tool,
              COUNT(*)          AS commands,
              SUM(input_tokens) AS inputTokens,
              SUM(saved_tokens) AS savedTokens,
              AVG(savings_pct)  AS avgSavingsPct,
              AVG(exec_time_ms) AS avgTimeMs
         FROM commands ${clause}
        GROUP BY tool
        ORDER BY savedTokens DESC, commands DESC
        LIMIT ?`
    )
    .all(...params, limit);
}

export function commands(filter, { limit = 100, offset = 0, sort = 'timestamp', dir = 'desc' } = {}) {
  const { clause, params } = buildFilter(filter);
  const sortCol =
    { timestamp: 'timestamp', saved: 'saved_tokens', pct: 'savings_pct', time: 'exec_time_ms' }[
      sort
    ] || 'timestamp';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  const total = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM commands ${clause}`)
    .get(...params).n;

  const rows = getDb()
    .prepare(
      `SELECT id, timestamp, original_cmd AS originalCmd, rtk_cmd AS rtkCmd,
              input_tokens AS inputTokens, output_tokens AS outputTokens,
              saved_tokens AS savedTokens, savings_pct AS savingsPct,
              exec_time_ms AS execTimeMs, project_path AS project,
              ${TOOL_EXPR} AS tool
         FROM commands ${clause}
        ORDER BY ${sortCol} ${sortDir}, id ${sortDir}
        LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { total, limit, offset, rows };
}

export function failures({ limit = 100, offset = 0 } = {}) {
  const total = getDb().prepare('SELECT COUNT(*) AS n FROM parse_failures').get().n;
  const rows = getDb()
    .prepare(
      `SELECT id, timestamp, raw_command AS rawCommand, error_message AS errorMessage,
              fallback_succeeded AS fallbackSucceeded
         FROM parse_failures
        ORDER BY timestamp DESC, id DESC
        LIMIT ? OFFSET ?`
    )
    .all(limit, offset);
  return { total, limit, offset, rows };
}

/** Distinct values used to populate the UI filter dropdowns. */
export function facets() {
  const d = getDb();
  return {
    projects: d
      .prepare(
        `SELECT CASE WHEN project_path = '' THEN '(unknown)' ELSE project_path END AS project,
                COUNT(*) AS commands
           FROM commands GROUP BY project_path ORDER BY commands DESC LIMIT 100`
      )
      .all(),
    tools: d
      .prepare(
        `SELECT ${TOOL_EXPR} AS tool, COUNT(*) AS commands
           FROM commands GROUP BY tool ORDER BY commands DESC LIMIT 100`
      )
      .all(),
  };
}

export function maxCommandId() {
  try {
    return getDb().prepare('SELECT COALESCE(MAX(id), 0) AS id FROM commands').get().id;
  } catch {
    return 0;
  }
}
