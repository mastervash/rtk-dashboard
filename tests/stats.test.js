import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApp, makeFixture } from './helpers.js';

/**
 * A small hand-built dataset with known totals, so every assertion is a real
 * number rather than a shape check.
 *
 * Totals: 6 commands, 1000 input, 460 saved, 2 projects, 3 tools.
 */
const COMMANDS = [
  { at: '2026-03-01T10:00:00Z', originalCmd: 'ls -la', rtkCmd: 'rtk ls -la', inputTokens: 100, savedTokens: 70, project: '/home/dev/api', execTimeMs: 5 },
  { at: '2026-03-01T11:00:00Z', originalCmd: 'grep -r x .', rtkCmd: 'rtk grep -r x .', inputTokens: 200, savedTokens: 20, project: '/home/dev/api', execTimeMs: 10 },
  { at: '2026-03-02T09:00:00Z', originalCmd: 'git status', rtkCmd: 'rtk git status', inputTokens: 150, savedTokens: 75, project: '/home/dev/api', execTimeMs: 20 },
  // 2026-03-03 deliberately empty — exercises gap filling.
  { at: '2026-03-04T09:00:00Z', originalCmd: 'git diff', rtkCmd: 'rtk git diff', inputTokens: 250, savedTokens: 125, project: '/home/dev/web', execTimeMs: 30 },
  { at: '2026-03-04T14:00:00Z', originalCmd: 'ls src', rtkCmd: 'rtk ls src', inputTokens: 100, savedTokens: 80, project: '/home/dev/web/ui', execTimeMs: 4 },
  { at: '2026-03-05T08:00:00Z', originalCmd: 'grep foo', rtkCmd: 'rtk grep foo', inputTokens: 200, savedTokens: 90, project: '', execTimeMs: 8 },
];

const FAILURES = [
  { at: '2026-03-04T10:00:00Z', rawCommand: 'git log --format=%H', errorMessage: 'bad format', fallbackSucceeded: 1 },
  { at: '2026-03-05T10:00:00Z', rawCommand: 'find . -newermt x', errorMessage: 'bad predicate', fallbackSucceeded: 0 },
];

let fixture;
let app;

beforeAll(async () => {
  fixture = makeFixture({ commands: COMMANDS, failures: FAILURES });
  app = await loadApp({
    RTKDASH_DB: fixture.dbPath,
    RTKDASH_CONFIG_DIR: fixture.configDir,
    RTKDASH_READONLY: '0',
  });
});

afterAll(() => fixture.cleanup());

describe('GET /api/summary', () => {
  it('totals every command when unfiltered', async () => {
    const { body } = await request(app).get('/api/summary?days=0');
    expect(body.commands).toBe(6);
    expect(body.inputTokens).toBe(1000);
    expect(body.savedTokens).toBe(460);
    expect(body.projects).toBe(4);
    expect(body.tools).toBe(3);
  });

  it('reports a token-weighted rate alongside the unweighted mean', async () => {
    const { body } = await request(app).get('/api/summary?days=0');
    expect(body.weightedSavingsPct).toBeCloseTo(46, 5);
    // Unweighted treats the 100-token ls the same as the 250-token git diff.
    expect(body.avgSavingsPct).not.toBeCloseTo(body.weightedSavingsPct, 5);
  });

  it('filters by tool', async () => {
    const { body } = await request(app).get('/api/summary?days=0&tool=git');
    expect(body.commands).toBe(2);
    expect(body.savedTokens).toBe(200);
  });

  it('includes nested paths when filtering by project', async () => {
    const { body } = await request(app).get('/api/summary?days=0&project=/home/dev/web');
    // /home/dev/web plus /home/dev/web/ui
    expect(body.commands).toBe(2);
    expect(body.savedTokens).toBe(205);
  });

  it('does not treat a project prefix as a sibling match', async () => {
    const { body } = await request(app).get('/api/summary?days=0&project=/home/dev/we');
    expect(body.commands).toBe(0);
  });

  it('searches original and rewritten commands', async () => {
    const { body } = await request(app).get('/api/summary?days=0&q=grep');
    expect(body.commands).toBe(2);
  });

  it('maps the "(unknown)" project label onto the empty project path', async () => {
    const { body } = await request(app).get('/api/summary?days=0&project=(unknown)');
    expect(body.commands).toBe(1);
    expect(body.savedTokens).toBe(90);
  });
});

describe('GET /api/timeseries', () => {
  it('fills days that have no commands', async () => {
    const { body } = await request(app).get('/api/timeseries?days=0');
    const days = body.map((d) => d.day);
    expect(days).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
    const idle = body.find((d) => d.day === '2026-03-03');
    expect(idle).toMatchObject({ commands: 0, savedTokens: 0, inputTokens: 0 });
  });

  it('buckets by the requested UTC offset rather than always UTC', async () => {
    // 2026-03-01T10:00Z is 2026-02-28T23:00 in UTC-11.
    const { body } = await request(app).get('/api/timeseries?days=0&tzOffset=660');
    expect(body[0].day).toBe('2026-02-28');
    expect(body[0].commands).toBe(1);
  });

  it('sums tokens into the right day', async () => {
    const { body } = await request(app).get('/api/timeseries?days=0');
    const first = body.find((d) => d.day === '2026-03-01');
    expect(first.commands).toBe(2);
    expect(first.savedTokens).toBe(90);
  });
});

describe('GET /api/projects and /api/tools', () => {
  it('ranks projects by tokens saved', async () => {
    const { body } = await request(app).get('/api/projects?days=0');
    expect(body[0].project).toBe('/home/dev/api');
    expect(body[0].savedTokens).toBe(165);
    expect(body.map((p) => p.project)).toContain('(unknown)');
  });

  it('derives the tool from the rewritten command', async () => {
    const { body } = await request(app).get('/api/tools?days=0');
    const byTool = Object.fromEntries(body.map((t) => [t.tool, t]));
    expect(Object.keys(byTool).sort()).toEqual(['git', 'grep', 'ls']);
    expect(byTool.ls.commands).toBe(2);
    expect(byTool.ls.savedTokens).toBe(150);
  });
});

describe('GET /api/commands', () => {
  it('paginates and reports the unpaginated total', async () => {
    const { body } = await request(app).get('/api/commands?days=0&limit=2&offset=0');
    expect(body.total).toBe(6);
    expect(body.rows).toHaveLength(2);
  });

  it('sorts by saved tokens descending', async () => {
    const { body } = await request(app).get('/api/commands?days=0&sort=saved&dir=desc');
    expect(body.rows[0].savedTokens).toBe(125);
  });

  it('sorts ascending when asked', async () => {
    const { body } = await request(app).get('/api/commands?days=0&sort=saved&dir=asc');
    expect(body.rows[0].savedTokens).toBe(20);
  });

  it('ignores an unknown sort key instead of injecting it', async () => {
    const res = await request(app).get('/api/commands?days=0&sort=saved_tokens;DROP TABLE commands');
    expect(res.status).toBe(200);
    const check = await request(app).get('/api/summary?days=0');
    expect(check.body.commands).toBe(6);
  });

  it('caps the page size', async () => {
    const { body } = await request(app).get('/api/commands?days=0&limit=99999');
    expect(body.limit).toBe(500);
  });
});

describe('GET /api/failures', () => {
  it('returns parse failures newest first', async () => {
    const { body } = await request(app).get('/api/failures');
    expect(body.total).toBe(2);
    expect(body.rows[0].rawCommand).toBe('find . -newermt x');
    expect(body.rows[0].fallbackSucceeded).toBe(0);
  });
});

describe('GET /api/facets', () => {
  it('lists projects and tools for the filter dropdowns', async () => {
    const { body } = await request(app).get('/api/facets');
    expect(body.projects.map((p) => p.project)).toContain('(unknown)');
    expect(body.tools.map((t) => t.tool).sort()).toEqual(['git', 'grep', 'ls']);
  });
});

describe('missing database', () => {
  it('reports a 503 rather than crashing', async () => {
    const app503 = await loadApp({
      RTKDASH_DB: '/nonexistent/history.db',
      RTKDASH_CONFIG_DIR: fixture.configDir,
    });
    const res = await request(app503).get('/api/summary');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not found/i);
  });
});
