import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApp, makeFixture } from './helpers.js';

/**
 * The origin guard is what stops an unrelated page in the user's browser from
 * driving a loopback-bound API. Behind a reverse proxy the browser sends the
 * proxy's public origin, which is why the allowlist exists at all.
 */
describe('origin guard', () => {
  let fixture;

  beforeEach(() => {
    fixture = makeFixture();
  });
  afterEach(() => fixture.cleanup());

  const base = () => ({
    RTKDASH_DB: fixture.dbPath,
    RTKDASH_CONFIG_DIR: fixture.configDir,
  });

  it('allows requests with no Origin header', async () => {
    const app = await loadApp({ ...base(), RTKDASH_ALLOWED_ORIGINS: undefined });
    expect((await request(app).get('/api/summary')).status).toBe(200);
  });

  it.each([
    'http://127.0.0.1:5178',
    'http://localhost:5177',
    'https://localhost',
    'http://[::1]:5178',
  ])('always allows the loopback origin %s', async (origin) => {
    const app = await loadApp({ ...base(), RTKDASH_ALLOWED_ORIGINS: undefined });
    const res = await request(app).get('/api/summary').set('Origin', origin);
    expect(res.status).toBe(200);
  });

  it('rejects an unlisted origin', async () => {
    const app = await loadApp({ ...base(), RTKDASH_ALLOWED_ORIGINS: undefined });
    const res = await request(app).get('/api/summary').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/RTKDASH_ALLOWED_ORIGINS/);
  });

  it('allows an origin named in RTKDASH_ALLOWED_ORIGINS', async () => {
    const app = await loadApp({
      ...base(),
      RTKDASH_ALLOWED_ORIGINS: 'https://rtk.example.com, https://other.example.com',
    });
    for (const origin of ['https://rtk.example.com', 'https://other.example.com']) {
      const res = await request(app).get('/api/summary').set('Origin', origin);
      expect(res.status).toBe(200);
    }
    const denied = await request(app).get('/api/summary').set('Origin', 'https://evil.example.com');
    expect(denied.status).toBe(403);
  });

  it('does not match an origin by prefix', async () => {
    const app = await loadApp({ ...base(), RTKDASH_ALLOWED_ORIGINS: 'https://rtk.example.com' });
    const res = await request(app)
      .get('/api/summary')
      .set('Origin', 'https://rtk.example.com.evil.test');
    expect(res.status).toBe(403);
  });

  it('disables the check entirely when set to *', async () => {
    const app = await loadApp({ ...base(), RTKDASH_ALLOWED_ORIGINS: '*' });
    const res = await request(app).get('/api/summary').set('Origin', 'https://anything.example');
    expect(res.status).toBe(200);
  });

  it('guards mutating routes too', async () => {
    const app = await loadApp({ ...base(), RTKDASH_ALLOWED_ORIGINS: undefined });
    const res = await request(app)
      .post('/api/run')
      .set('Origin', 'https://evil.example.com')
      .send({ command: 'gain' });
    expect(res.status).toBe(403);
  });
});
