/**
 * Builds a synthetic rtk history database and config directory so the
 * dashboard can be demoed, screenshotted, or developed against without
 * exposing a real machine's paths and command history.
 *
 *   node scripts/seed-demo.mjs [target-dir]     # default: ./demo
 *
 * Then point the server at it:
 *
 *   RTKDASH_DB=demo/history.db RTKDASH_CONFIG_DIR=demo/config npm start
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const target = path.resolve(process.argv[2] ?? 'demo');
const configDir = path.join(target, 'config');
fs.mkdirSync(configDir, { recursive: true });

const dbPath = path.join(target, 'history.db');
fs.rmSync(dbPath, { force: true });
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE commands (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    original_cmd TEXT NOT NULL,
    rtk_cmd TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    saved_tokens INTEGER NOT NULL,
    savings_pct REAL NOT NULL,
    exec_time_ms INTEGER DEFAULT 0,
    project_path TEXT DEFAULT ''
  );
  CREATE INDEX idx_timestamp ON commands(timestamp);
  CREATE INDEX idx_project_path_timestamp ON commands(project_path, timestamp);

  CREATE TABLE parse_failures (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    raw_command TEXT NOT NULL,
    error_message TEXT NOT NULL,
    fallback_succeeded INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_pf_timestamp ON parse_failures(timestamp);
`);

/** Deterministic PRNG so regenerating the demo gives the same charts. */
let seed = 1337;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));

const PROJECTS = [
  ['/home/dev/acme-api', 0.42],
  ['/home/dev/acme-api/crates/core', 0.12],
  ['/home/dev/storefront', 0.22],
  ['/home/dev/storefront/services/checkout', 0.1],
  ['/home/dev/infra', 0.09],
  ['/home/dev/scratch', 0.05],
];

// [tool, weight, typical savings %, raw token size range, exec ms range]
const TOOLS = [
  ['grep', 0.24, 16, [80, 900], [4, 40]],
  ['ls', 0.12, 68, [40, 400], [2, 12]],
  ['read', 0.11, 12, [200, 2600], [1, 30]],
  ['git', 0.11, 47, [120, 1400], [15, 260]],
  ['cargo', 0.07, 61, [400, 5200], [900, 22000]],
  ['vitest', 0.06, 58, [600, 6400], [1800, 26000]],
  ['tsc', 0.05, 34, [300, 3800], [1500, 18000]],
  ['docker', 0.05, 76, [500, 4200], [200, 3400]],
  ['find', 0.05, 55, [90, 1100], [10, 320]],
  ['tree', 0.04, 71, [150, 1600], [5, 90]],
  ['npm', 0.04, 41, [200, 2100], [400, 9000]],
  ['kubectl', 0.03, 64, [180, 1900], [120, 1500]],
  ['rg', 0.03, 18, [70, 800], [3, 35]],
];

const SAMPLES = {
  grep: ['grep -rn "TODO" src/', 'grep -r "useEffect" web/', 'grep -n "async fn" crates/core/src/'],
  ls: ['ls -la', 'ls -la src/handlers', 'ls -R migrations/'],
  read: ['cat src/main.rs', 'cat package.json', 'cat docker-compose.yml'],
  git: ['git status', 'git diff --staged', 'git log --oneline -20', 'git branch -a'],
  cargo: ['cargo build --release', 'cargo test', 'cargo clippy -- -D warnings'],
  vitest: ['vitest run', 'vitest run --coverage', 'vitest run src/lib'],
  tsc: ['tsc --noEmit', 'tsc -b'],
  docker: ['docker ps -a', 'docker compose logs api', 'docker images'],
  find: ['find . -name "*.test.ts"', 'find src -type f -name "*.rs"'],
  tree: ['tree -L 3 src', 'tree -L 2'],
  npm: ['npm run build', 'npm run lint', 'npm test'],
  kubectl: ['kubectl get pods -A', 'kubectl describe deploy api', 'kubectl logs -l app=api'],
  rg: ['rg "createClient"', 'rg -t rust "impl Handler"'],
};

function weightedPick(entries) {
  const roll = rand();
  let acc = 0;
  for (const entry of entries) {
    acc += entry[1];
    if (roll <= acc) return entry;
  }
  return entries[entries.length - 1];
}

const insert = db.prepare(
  `INSERT INTO commands
     (timestamp, original_cmd, rtk_cmd, input_tokens, output_tokens, saved_tokens,
      savings_pct, exec_time_ms, project_path)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const DAYS = 30;
const now = Date.now();
let rows = 0;

db.transaction(() => {
  for (let day = DAYS - 1; day >= 0; day--) {
    const date = new Date(now - day * 86_400_000);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    // Activity ramps up over the month, with quiet weekends.
    const ramp = 0.45 + (DAYS - day) / DAYS;
    const count = Math.round((weekend ? between(4, 30) : between(30, 130)) * ramp);

    for (let i = 0; i < count; i++) {
      const [tool, , baseSavings, sizeRange, timeRange] = weightedPick(TOOLS);
      const [project] = weightedPick(PROJECTS);

      const input = between(sizeRange[0], sizeRange[1]);
      const savingsPct = Math.max(0, Math.min(96, baseSavings + between(-14, 14)));
      const saved = Math.round((input * savingsPct) / 100);
      const original = pick(SAMPLES[tool]);

      const ts = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        between(8, 22),
        between(0, 59),
        between(0, 59)
      );

      insert.run(
        `${ts.toISOString().replace('Z', '')}+00:00`,
        original,
        `rtk ${tool} ${original.split(' ').slice(1).join(' ')}`.trim(),
        input,
        input - saved,
        saved,
        savingsPct,
        between(timeRange[0], timeRange[1]),
        project
      );
      rows++;
    }
  }

  const failure = db.prepare(
    `INSERT INTO parse_failures (timestamp, raw_command, error_message, fallback_succeeded)
     VALUES (?, ?, ?, ?)`
  );
  const FAILURES = [
    ['git log --format=%H%n%s --graph', 'unsupported --format placeholder', 1],
    ['docker exec -it api sh -c "env | sort"', 'nested quoting not supported', 1],
    ['find . -newermt "2 days ago" -print0', 'unparsed predicate: -newermt', 0],
    ['kubectl get pods -o jsonpath={.items[*]}', 'jsonpath passthrough required', 1],
    ['npm run build -- --profile --json > out', 'redirection in argv', 0],
  ];
  FAILURES.forEach(([cmd, err, ok], i) => {
    const ts = new Date(now - (i + 1) * 3 * 3_600_000);
    failure.run(`${ts.toISOString().replace('Z', '')}+00:00`, cmd, err, ok);
  });
})();

fs.writeFileSync(
  path.join(configDir, 'config.toml'),
  `[tracking]
enabled = true
history_days = 90

[display]
colors = true
emoji = true
max_width = 120

[filters]
ignore_dirs = [
    ".git",
    "node_modules",
    "target",
    "__pycache__",
    ".venv",
    "vendor",
]
ignore_files = [
    "*.lock",
    "*.min.js",
    "*.min.css",
]

[tee]
enabled = true
mode = "failures"
max_files = 20
max_file_size = 1048576

[telemetry]
enabled = false
consent_given = false

[hooks]
exclude_commands = []
transparent_prefixes = []
`
);

fs.writeFileSync(
  path.join(configDir, 'filters.toml'),
  `# Project-local filter overrides.

[grep]
max_matches_per_file = 8
strip_blank_lines = true

[read]
head_lines = 120
tail_lines = 40

[tree]
max_depth = 3
`
);

const total = db.prepare('SELECT SUM(saved_tokens) AS n FROM commands').get().n;
console.log(`seeded ${rows} commands (${total.toLocaleString()} tokens saved) -> ${dbPath}`);
console.log(`config -> ${configDir}`);
db.close();
