import { Router } from 'express';
import * as db from '../db.js';

const router = Router();

const POLL_MS = Number(process.env.RTKDASH_POLL_MS || 1500);

/**
 * Server-sent events for live tail. rtk appends rows from short-lived
 * processes, so polling MAX(id) is both cheaper and more reliable than an
 * fs.watch on a SQLite file.
 */
router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let lastId = db.maxCommandId();
  send('hello', { lastId, db: db.dbInfo() });

  const tick = setInterval(() => {
    let currentId;
    try {
      currentId = db.maxCommandId();
    } catch (err) {
      send('error', { message: err.message });
      return;
    }
    if (currentId <= lastId) {
      // Comment frame keeps proxies from closing an idle connection.
      res.write(': ping\n\n');
      return;
    }
    const { rows } = db.commands({}, { limit: 50 });
    const fresh = rows.filter((r) => r.id > lastId).reverse();
    lastId = currentId;
    send('commands', { lastId, rows: fresh });
  }, POLL_MS);

  req.on('close', () => {
    clearInterval(tick);
    res.end();
  });

  function send(event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
});

export default router;
