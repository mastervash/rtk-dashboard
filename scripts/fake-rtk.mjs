#!/usr/bin/env node
/**
 * A stand-in for the real `rtk` binary, for demos, screenshots, and working on
 * the Tools and Discover views without rtk installed.
 *
 * It prints canned output in the exact shape the real binary produces — the
 * Discover report here is the same fixed-width layout the parser is tested
 * against. Every command, path, and number is fictional and matches the
 * projects that scripts/seed-demo.mjs generates.
 *
 *   RTKDASH_RTK_BIN=./scripts/fake-rtk.mjs npm start
 */

const [subcommand = '', ...args] = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
};

const REPORTS = {
  discover: `RTK Discover -- Savings Opportunities
====================================================
Scanned: 18 sessions (last 30 days), 1204 Bash commands
Already using RTK: 812 commands (67.4%)

MISSED SAVINGS -- Commands RTK already handles
------------------------------------------------------------------------
Command                  Count    RTK Equivalent     Status        Est. Savings
curl -s                     41    rtk curl           existing      ~3.1K tokens
psql -c                     12    rtk psql           existing      ~2.4K tokens
docker build                18    rtk docker         existing      ~1.9K tokens
cat src/main.rs             27    rtk read           existing      ~1.2K tokens
npm run build               22    rtk npm            existing      ~980 tokens
kubectl describe             9    rtk kubectl        existing      ~742 tokens
git log --stat              14    rtk git            existing      ~610 tokens
tree -L 4                    6    rtk tree           existing      ~448 tokens
ls -R migrations             8    rtk ls             existing      ~215 tokens
grep -rn TODO                4    rtk grep           existing      ~63 tokens
------------------------------------------------------------------------
Total: 161 commands -> ~11.7K tokens saveable

TOP UNHANDLED COMMANDS -- open an issue?
----------------------------------------------------
Command                  Count    Example
terraform                   23    terraform plan -out=tfplan
just                        16    just migrate-up
sqlx                        11    sqlx migrate run
hyperfine                    7    hyperfine 'cargo build --release'
watchexec                    5    watchexec -e rs cargo test
mprocs                       3    mprocs -c dev.yaml
----------------------------------------------------
-> github.com/rtk-ai/rtk/issues

~estimated from tool_result output sizes
`,

  session: `RTK Session Adoption
====================================================
Session                       Commands   Via RTK   Adoption
2026-03-05 acme-api                 218       191      87.6%
2026-03-04 storefront               164       112      68.3%
2026-03-04 acme-api                 141       118      83.7%
2026-03-03 infra                     87        44      50.6%
2026-03-02 storefront                96        71      74.0%
----------------------------------------------------
Average adoption: 72.8% across 18 sessions
`,

  'cc-economics': `Claude Code Economics
====================================================
Spend (ccusage)          $42.18   last 30 days
Tokens saved (rtk)      1030014   last 30 days
Est. cost avoided        $11.64   at blended input pricing
Effective discount        21.6%
----------------------------------------------------
Note: estimates only. Pricing varies by model and cache state.
`,

  'hook-audit': `Hook Rewrite Audit
====================================================
Rewritten            1204
Passed through        318
Excluded by config     22
Parse failures          5
----------------------------------------------------
Rewrite rate: 78.0%
`,

  verify: `Hook integrity: OK (sha256 matches)
Project filters: 3 TOML files trusted
Inline tests:    12 passed, 0 failed
`,

  config: `Config: /config/config.toml

[tracking]
enabled = true
history_days = 90

[display]
colors = true
emoji = true
max_width = 120
`,
};

function gain() {
  if (valueOf('--format') === 'json') {
    return `${JSON.stringify(
      {
        summary: {
          total_commands: 1936,
          total_input: 2216054,
          total_output: 1178652,
          total_saved: 1037402,
          avg_savings_pct: 46.81,
          total_time_ms: 4517800,
          avg_time_ms: 2333,
        },
      },
      null,
      2
    )}\n`;
  }

  if (valueOf('--format') === 'csv') {
    return [
      'metric,value',
      'total_commands,1936',
      'total_input,2216054',
      'total_output,1178652',
      'total_saved,1037402',
      'avg_savings_pct,46.81',
      '',
    ].join('\n');
  }

  let out = `RTK Token Savings
====================================================
Commands tracked          1936
Raw input tokens       2216054
After filtering        1178652
Tokens saved           1037402   (46.8%)
Total exec time          1h 15m
`;

  if (has('--graph')) {
    out += `
Daily savings (last 14 days)
  03-20  ####################         38.2K
  03-21  ##############               26.9K
  03-22  ####                          7.4K
  03-23  ##                            3.1K
  03-24  #########################    47.6K
  03-25  ###############################  59.8K
  03-26  ######################       41.3K
  03-27  #####################        39.7K
  03-28  ###                           5.2K
  03-29  #                             1.8K
  03-30  ############################ 53.1K
  03-31  ##########################   49.4K
  04-01  ###################          36.0K
  04-02  ######################       42.7K
`;
  }

  if (has('--quota')) {
    const tier = valueOf('--tier') ?? '20x';
    out += `
Monthly quota estimate (tier: ${tier})
  Tokens saved this month     1037402
  Equivalent extra sessions      ~34
`;
  }

  if (has('--history')) {
    out += `
Recent commands
  03-31 14:22   cargo test                 3180 -> 1240    61%
  03-31 14:19   ls -la src/handlers         286 ->   83    71%
  03-31 13:58   grep -rn "TODO" src/        640 ->  518    19%
  03-31 13:41   vitest run --coverage      4980 -> 1843    63%
  03-31 11:07   docker compose logs api    2240 ->  493    78%
`;
  }

  return out;
}

const output = subcommand === 'gain' ? gain() : REPORTS[subcommand];

if (output === undefined) {
  process.stderr.write(`fake-rtk: unsupported subcommand: ${subcommand || '(none)'}\n`);
  process.exit(2);
}

process.stdout.write(output);
