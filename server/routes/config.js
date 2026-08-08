import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { parse as parseToml } from 'smol-toml';
import { CONFIG_DIR, EDITABLE_FILES, READONLY } from '../paths.js';

const router = Router();

function resolveFile(name) {
  if (!EDITABLE_FILES.includes(name)) return null;
  return path.join(CONFIG_DIR, name);
}

function readFile(name) {
  const file = resolveFile(name);
  if (!file || !fs.existsSync(file)) {
    return { name, path: file, exists: false, content: '', mtimeMs: 0 };
  }
  const stat = fs.statSync(file);
  return {
    name,
    path: file,
    exists: true,
    content: fs.readFileSync(file, 'utf8'),
    mtimeMs: stat.mtimeMs,
  };
}

router.get('/config', (_req, res) => {
  res.json({
    dir: CONFIG_DIR,
    readonly: READONLY,
    files: EDITABLE_FILES.map(readFile),
  });
});

router.get('/config/:name', (req, res) => {
  const file = resolveFile(req.params.name);
  if (!file) return res.status(404).json({ error: `Not an editable file: ${req.params.name}` });
  res.json(readFile(req.params.name));
});

/** Validate TOML without writing — powers the editor's live syntax check. */
router.post('/config/validate', (req, res) => {
  try {
    parseToml(String(req.body?.content ?? ''));
    res.json({ valid: true });
  } catch (err) {
    res.json({ valid: false, error: err.message });
  }
});

router.put('/config/:name', (req, res) => {
  if (READONLY) {
    return res.status(403).json({ error: 'Config editing disabled (RTKDASH_READONLY=1)' });
  }
  const name = req.params.name;
  const file = resolveFile(name);
  if (!file) return res.status(404).json({ error: `Not an editable file: ${name}` });

  const content = String(req.body?.content ?? '');
  try {
    parseToml(content);
  } catch (err) {
    return res.status(400).json({ error: `Invalid TOML: ${err.message}` });
  }

  // Keep one timestamped backup per save so a bad edit is always recoverable.
  let backup = null;
  if (fs.existsSync(file)) {
    backup = `${file}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    fs.copyFileSync(file, backup);
  }
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(file, content, 'utf8');

  res.json({ ...readFile(name), backup });
});

export default router;
