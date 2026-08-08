import { Router } from 'express';
import * as db from '../db.js';

const router = Router();

/** Pull the shared filter params off a request. */
function filterOf(req) {
  const { days, project, tool, q, tzOffset } = req.query;
  return {
    days,
    // The UI labels rows with no recorded project as "(unknown)".
    project: project === '(unknown)' ? '' : project,
    tool,
    q,
    tzOffset,
  };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

router.get('/meta', (_req, res) => {
  res.json({ db: db.dbInfo(), maxId: db.maxCommandId() });
});

router.get('/summary', (req, res) => {
  res.json(db.summary(filterOf(req)));
});

router.get('/timeseries', (req, res) => {
  res.json(db.timeseries(filterOf(req)));
});

router.get('/projects', (req, res) => {
  res.json(db.projects(filterOf(req), num(req.query.limit, 50)));
});

router.get('/tools', (req, res) => {
  res.json(db.tools(filterOf(req), num(req.query.limit, 50)));
});

router.get('/facets', (_req, res) => {
  res.json(db.facets());
});

router.get('/commands', (req, res) => {
  res.json(
    db.commands(filterOf(req), {
      limit: Math.min(num(req.query.limit, 100), 500),
      offset: num(req.query.offset, 0),
      sort: req.query.sort,
      dir: req.query.dir,
    })
  );
});

router.get('/failures', (req, res) => {
  res.json({
    ...db.failures({
      limit: Math.min(num(req.query.limit, 100), 500),
      offset: num(req.query.offset, 0),
    }),
  });
});

export default router;
