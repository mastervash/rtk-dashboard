import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import statsRoutes from './routes/stats.js';
import runnerRoutes from './routes/runner.js';
import configRoutes from './routes/config.js';
import streamRoutes from './routes/stream.js';
import { ALLOWED_ORIGINS, API_HOST, API_PORT, DB_PATH, CONFIG_DIR, READONLY } from './paths.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

// A browser page on any origin could reach a loopback port, so reject
// cross-origin API calls. Behind a reverse proxy the browser sends the proxy's
// public origin, which must be listed in RTKDASH_ALLOWED_ORIGINS.
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const ALLOW_ANY_ORIGIN = ALLOWED_ORIGINS.includes('*');

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (!origin || ALLOW_ANY_ORIGIN) return next();
  if (LOOPBACK.test(origin) || ALLOWED_ORIGINS.includes(origin)) return next();
  res.status(403).json({
    error: `Origin not allowed: ${origin}. Add it to RTKDASH_ALLOWED_ORIGINS.`,
  });
});

// Behind a proxy, disable response buffering hints and trust X-Forwarded-*.
if (process.env.RTKDASH_TRUST_PROXY) app.set('trust proxy', process.env.RTKDASH_TRUST_PROXY);

app.use('/api', statsRoutes);
app.use('/api', runnerRoutes);
app.use('/api', configRoutes);
app.use('/api', streamRoutes);

// Serve the built SPA when it exists (npm run build && npm start).
const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Internal error' });
});

app.listen(API_PORT, API_HOST, () => {
  console.log(`rtkdash api  http://${API_HOST}:${API_PORT}`);
  console.log(`  db         ${DB_PATH}`);
  console.log(`  config dir ${CONFIG_DIR}`);
  console.log(`  origins    loopback${ALLOWED_ORIGINS.length ? ` + ${ALLOWED_ORIGINS.join(', ')}` : ''}`);
  console.log(`  mode       ${READONLY ? 'read-only' : 'read-write (runner + config editing on)'}`);
  if (API_HOST !== '127.0.0.1') {
    console.warn('  WARNING    bound off loopback and rtkdash has no auth of its own');
  }
});
