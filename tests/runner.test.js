import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApp, makeFixture } from './helpers.js';

/**
 * The runner is the one place where browser input reaches process execution,
 * so these tests are the guardrail for that boundary. `true` stands in for the
 * rtk binary: it accepts any argv and exits 0, so a rejection here can only
 * come from the allowlist, never from the command failing on its own.
 */
describe('POST /api/run', () => {
  let fixture;
  let app;

  beforeEach(async () => {
    fixture = makeFixture();
    app = await loadApp({
      RTKDASH_DB: fixture.dbPath,
      RTKDASH_CONFIG_DIR: fixture.configDir,
      RTKDASH_RTK_BIN: 'true',
      RTKDASH_READONLY: '0',
    });
  });

  afterEach(() => fixture.cleanup());

  it('runs an allowlisted subcommand', async () => {
    const res = await request(app).post('/api/run').send({ command: 'gain' });
    expect(res.status).toBe(200);
    expect(res.body.exitCode).toBe(0);
    expect(res.body.command).toBe('true gain');
  });

  it('accepts allowlisted flags and enumerated option values', async () => {
    const res = await request(app)
      .post('/api/run')
      .send({ command: 'gain', args: ['--graph', '--format', 'json'] });
    expect(res.status).toBe(200);
    expect(res.body.command).toBe('true gain --graph --format json');
  });

  it.each([
    ['run', 'shell passthrough'],
    ['proxy', 'untracked passthrough'],
    ['trust', 'mutates trust store'],
    ['init', 'writes assistant config'],
    ['learn', 'writes correction data'],
    ['telemetry', 'changes consent'],
    ['rewrite', 'not in the catalog'],
  ])('rejects the %s subcommand (%s)', async (command) => {
    const res = await request(app).post('/api/run').send({ command });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('rejects destructive flags on an allowlisted subcommand', async () => {
    const res = await request(app)
      .post('/api/run')
      .send({ command: 'gain', args: ['--reset', '--yes'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Argument not allowed: --reset');
  });

  it('rejects option values outside the enumeration', async () => {
    const res = await request(app)
      .post('/api/run')
      .send({ command: 'gain', args: ['--format', 'yaml'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid value for --format: yaml');
  });

  it.each([
    ['gain; rm -rf /'],
    ['gain && curl evil.example.com'],
    ['gain | sh'],
    ['$(whoami)'],
    ['../../bin/sh'],
  ])('rejects shell metacharacters smuggled into the command name: %s', async (command) => {
    const res = await request(app).post('/api/run').send({ command });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it.each([
    [';rm -rf /'],
    ['&& curl evil.example.com'],
    ['--format=json'],
    ['-p'],
    ['/etc/passwd'],
  ])('rejects unrecognized argument: %s', async (arg) => {
    const res = await request(app).post('/api/run').send({ command: 'gain', args: [arg] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('rejects a cwd that is not an existing directory', async () => {
    const res = await request(app)
      .post('/api/run')
      .send({ command: 'gain', cwd: '/definitely/not/a/real/path' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Not a directory/);
  });

  it('exposes only catalog commands and their flags', async () => {
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(200);
    const names = res.body.commands.map((c) => c.name);
    expect(names).toContain('gain');
    expect(names).not.toContain('run');
    expect(names).not.toContain('proxy');
    for (const command of res.body.commands) {
      expect(command.flags).not.toContain('--reset');
    }
  });
});

describe('POST /api/run with RTKDASH_READONLY=1', () => {
  let fixture;

  beforeEach(() => {
    fixture = makeFixture();
  });
  afterEach(() => fixture.cleanup());

  it('refuses to execute anything', async () => {
    const app = await loadApp({
      RTKDASH_DB: fixture.dbPath,
      RTKDASH_CONFIG_DIR: fixture.configDir,
      RTKDASH_RTK_BIN: 'true',
      RTKDASH_READONLY: '1',
    });
    const res = await request(app).post('/api/run').send({ command: 'gain' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });
});
