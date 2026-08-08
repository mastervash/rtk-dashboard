import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import statsRoutes from './routes/stats.js';
import runnerRoutes from './routes/runner.js';
import configRoutes from './routes/config.js';
import streamRoutes from './routes/stream.js';
import { ALLOWED_ORIGINS } from './paths.js';

// A browser page on any origin could reach a loopback port, so reject
// cross-origin API calls. Behind a reverse proxy the browser sends the proxy's
// public origin, which must be listed in RTKDASH_ALLOWED_ORIGINS.
const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

/**
 * Builds the Express app. Kept separate from the listener so tests can drive
 * it without binding a port.
 *
 * @param {{serveStatic?: boolean}} [options]
 */
export function createApp({ serveStatic = true } = {}) {
  const app = express();
  const allowAnyOrigin = ALLOWED_ORIGINS.includes('*');

  app.use(express.json({ limit: '1mb' }));

  app.use('/api', (req, res, next) => {
    const origin = req.get('origin');
    if (!origin || allowAnyOrigin) return next();
    if (LOOPBACK.test(origin) || ALLOWED_ORIGINS.includes(origin)) return next();
    res.status(403).json({
      error: `Origin not allowed: ${origin}. Add it to RTKDASH_ALLOWED_ORIGINS.`,
    });
  });

  if (process.env.RTKDASH_TRUST_PROXY) app.set('trust proxy', process.env.RTKDASH_TRUST_PROXY);

  app.use('/api', statsRoutes);
  app.use('/api', runnerRoutes);
  app.use('/api', configRoutes);
  app.use('/api', streamRoutes);

  // Serve the built SPA when it exists (npm run build && npm start).
  if (serveStatic) {
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    const dist = path.join(root, 'dist');
    if (fs.existsSync(dist)) {
      app.use(express.static(dist));
      app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
  }

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Internal error' });
  });

  return app;
}
