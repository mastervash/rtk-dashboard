import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { Router } from 'express';
import { RTK_BIN, READONLY } from '../paths.js';

const router = Router();

/**
 * Only these rtk subcommands can be launched from the browser, and only with
 * the flags listed here. Everything is passed as argv (never through a shell),
 * so there is no quoting or injection surface — an argument that is not in the
 * allowlist is rejected outright rather than escaped.
 *
 * Mutating subcommands (reset, trust, init, learn, telemetry) are deliberately
 * absent.
 */
const CATALOG = {
  gain: {
    label: 'Token savings summary',
    flags: [
      '--project',
      '--graph',
      '--history',
      '--quota',
      '--daily',
      '--weekly',
      '--monthly',
      '--all',
      '--failures',
      '--ultra-compact',
    ],
    options: {
      '--format': ['text', 'json', 'csv'],
      '--tier': ['pro', '5x', '20x'],
    },
  },
  discover: {
    label: 'Missed savings in Claude Code history',
    flags: ['--verbose'],
    options: {},
  },
  session: {
    label: 'RTK adoption across sessions',
    flags: ['--verbose'],
    options: {},
  },
  'cc-economics': {
    label: 'Spend vs savings',
    flags: [],
    options: {},
  },
  'hook-audit': {
    label: 'Hook rewrite audit metrics',
    flags: [],
    options: {},
  },
  verify: {
    label: 'Verify hooks and TOML filter tests',
    flags: [],
    options: {},
  },
  config: {
    label: 'Show active configuration',
    flags: [],
    options: {},
  },
};

const ANSI = /\[[0-9;]*[A-Za-z]/g;

router.get('/catalog', (_req, res) => {
  res.json({
    readonly: READONLY,
    bin: RTK_BIN,
    commands: Object.entries(CATALOG).map(([name, spec]) => ({
      name,
      label: spec.label,
      flags: spec.flags,
      options: spec.options,
    })),
  });
});

router.post('/run', (req, res) => {
  if (READONLY) {
    return res.status(403).json({ error: 'Command runner disabled (RTKDASH_READONLY=1)' });
  }

  const name = String(req.body?.command ?? '');
  const spec = CATALOG[name];
  if (!spec) return res.status(400).json({ error: `Command not allowed: ${name || '(empty)'}` });

  const requested = Array.isArray(req.body?.args) ? req.body.args.map(String) : [];
  const argv = [name];

  for (let i = 0; i < requested.length; i++) {
    const arg = requested[i];
    if (spec.flags.includes(arg)) {
      argv.push(arg);
      continue;
    }
    if (Object.hasOwn(spec.options, arg)) {
      const value = requested[++i];
      if (!spec.options[arg].includes(value)) {
        return res.status(400).json({ error: `Invalid value for ${arg}: ${value}` });
      }
      argv.push(arg, value);
      continue;
    }
    return res.status(400).json({ error: `Argument not allowed: ${arg}` });
  }

  // `rtk gain --project` scopes to the working directory, so the cwd matters.
  let cwd = process.env.HOME;
  const requestedCwd = req.body?.cwd ? String(req.body.cwd) : '';
  if (requestedCwd) {
    if (!fs.existsSync(requestedCwd) || !fs.statSync(requestedCwd).isDirectory()) {
      return res.status(400).json({ error: `Not a directory: ${requestedCwd}` });
    }
    cwd = requestedCwd;
  }

  const started = Date.now();
  execFile(
    RTK_BIN,
    argv,
    { cwd, timeout: 60_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } },
    (err, stdout, stderr) => {
      res.json({
        command: `${RTK_BIN} ${argv.join(' ')}`,
        cwd,
        exitCode: err?.code ?? 0,
        timedOut: !!err?.killed,
        durationMs: Date.now() - started,
        stdout: String(stdout).replace(ANSI, ''),
        stderr: String(stderr).replace(ANSI, ''),
        error: err && !('code' in err) ? err.message : null,
      });
    }
  );
});

export default router;
