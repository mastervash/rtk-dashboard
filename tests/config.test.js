import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApp, makeFixture } from './helpers.js';

const VALID = '[tracking]\nenabled = true\nhistory_days = 90\n';

describe('config editor', () => {
  let fixture;
  let app;

  beforeEach(async () => {
    fixture = makeFixture();
    fs.writeFileSync(path.join(fixture.configDir, 'config.toml'), VALID);
    app = await loadApp({
      RTKDASH_DB: fixture.dbPath,
      RTKDASH_CONFIG_DIR: fixture.configDir,
      RTKDASH_READONLY: '0',
    });
  });

  afterEach(() => fixture.cleanup());

  it('lists only the editable files', async () => {
    const { body } = await request(app).get('/api/config');
    expect(body.files.map((f) => f.name)).toEqual(['config.toml', 'filters.toml']);
    expect(body.files[0].content).toBe(VALID);
    expect(body.files[1].exists).toBe(false);
  });

  it('validates TOML without writing', async () => {
    const ok = await request(app).post('/api/config/validate').send({ content: VALID });
    expect(ok.body.valid).toBe(true);

    const bad = await request(app).post('/api/config/validate').send({ content: '[oops\n' });
    expect(bad.body.valid).toBe(false);
    expect(bad.body.error).toBeTruthy();

    expect(fs.readFileSync(path.join(fixture.configDir, 'config.toml'), 'utf8')).toBe(VALID);
  });

  it('writes valid TOML and keeps a backup of the previous file', async () => {
    const next = '[tracking]\nenabled = false\nhistory_days = 30\n';
    const res = await request(app).put('/api/config/config.toml').send({ content: next });

    expect(res.status).toBe(200);
    expect(fs.readFileSync(path.join(fixture.configDir, 'config.toml'), 'utf8')).toBe(next);

    const backups = fs.readdirSync(fixture.configDir).filter((f) => f.endsWith('.bak'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(fixture.configDir, backups[0]), 'utf8')).toBe(VALID);
  });

  it('refuses invalid TOML and leaves the file untouched', async () => {
    const res = await request(app).put('/api/config/config.toml').send({ content: '[oops\n' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid TOML/);
    expect(fs.readFileSync(path.join(fixture.configDir, 'config.toml'), 'utf8')).toBe(VALID);
  });

  it.each([
    'passwd',
    '../../../etc/passwd',
    '..%2F..%2Fetc%2Fpasswd',
    'config.toml.bak',
    '.env',
  ])('refuses to read or write %s', async (name) => {
    const read = await request(app).get(`/api/config/${encodeURIComponent(name)}`);
    expect(read.status).toBe(404);

    const write = await request(app)
      .put(`/api/config/${encodeURIComponent(name)}`)
      .send({ content: VALID });
    expect(write.status).toBe(404);
  });

  it('creates filters.toml when it does not exist yet', async () => {
    const res = await request(app)
      .put('/api/config/filters.toml')
      .send({ content: '[grep]\nmax_matches_per_file = 8\n' });
    expect(res.status).toBe(200);
    expect(res.body.backup).toBeNull();
    expect(fs.existsSync(path.join(fixture.configDir, 'filters.toml'))).toBe(true);
  });
});

describe('config editor with RTKDASH_READONLY=1', () => {
  let fixture;

  beforeEach(() => {
    fixture = makeFixture();
    fs.writeFileSync(path.join(fixture.configDir, 'config.toml'), VALID);
  });
  afterEach(() => fixture.cleanup());

  it('serves the files but refuses writes', async () => {
    const app = await loadApp({
      RTKDASH_DB: fixture.dbPath,
      RTKDASH_CONFIG_DIR: fixture.configDir,
      RTKDASH_READONLY: '1',
    });

    expect((await request(app).get('/api/config')).status).toBe(200);

    const res = await request(app).put('/api/config/config.toml').send({ content: '[a]\nb = 1\n' });
    expect(res.status).toBe(403);
    expect(fs.readFileSync(path.join(fixture.configDir, 'config.toml'), 'utf8')).toBe(VALID);
  });
});
