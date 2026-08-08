import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDiscover, parseTokenCount } from '../server/lib/discover.js';

const FAKE_RTK = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'fake-rtk.mjs'
);

/** Verbatim shape of `rtk discover` output, with the values changed. */
const SAMPLE = `RTK Discover -- Savings Opportunities
====================================================
Scanned: 12 sessions (last 30 days), 155 Bash commands
Already using RTK: 5 commands (3.2%)

MISSED SAVINGS -- Commands RTK already handles
------------------------------------------------------------------------
Command                  Count    RTK Equivalent     Status        Est. Savings
curl -s                     17    rtk curl           existing      ~588 tokens
docker build                 4    rtk docker         existing      ~445 tokens
cat /tmp/scratch/..          5    rtk read           existing      ~256 tokens
grep -n                      1    rtk grep           existing      ~8 tokens
------------------------------------------------------------------------
Total: 27 commands -> ~2.4K tokens saveable

TOP UNHANDLED COMMANDS -- open an issue?
----------------------------------------------------
Command                  Count    Example
node                        13    node -v
pkill                       10    pkill -f "node server/index.js"
npm i                        2    npm i -D @types/node --no-audit --no-f..
----------------------------------------------------
-> github.com/rtk-ai/rtk/issues

~estimated from tool_result output sizes
`;

describe('parseTokenCount', () => {
  it.each([
    ['~588 tokens', 588],
    ['~2.4K tokens saveable', 2400],
    ['1.5M', 1_500_000],
    ['~8 tokens', 8],
    ['0 tokens', 0],
  ])('parses %s as %i', (input, expected) => {
    expect(parseTokenCount(input)).toBe(expected);
  });

  it.each([undefined, null, '', 'tokens'])('returns null for %s', (input) => {
    expect(parseTokenCount(input)).toBeNull();
  });
});

describe('parseDiscover', () => {
  const parsed = parseDiscover(SAMPLE);

  it('reads the scan header', () => {
    expect(parsed.scanned).toEqual({
      sessions: 12,
      days: 30,
      bashCommands: 155,
      alreadyUsingRtk: 5,
      alreadyUsingPct: 3.2,
    });
  });

  it('reads the totals line', () => {
    expect(parsed.totals).toEqual({ commands: 27, tokens: 2400 });
  });

  it('parses every missed-savings row', () => {
    expect(parsed.missed).toHaveLength(4);
    expect(parsed.missed[0]).toEqual({
      command: 'curl -s',
      count: 17,
      rtkEquivalent: 'rtk curl',
      status: 'existing',
      savedTokens: 588,
    });
  });

  it('keeps single spaces inside command names', () => {
    const commands = parsed.missed.map((m) => m.command);
    expect(commands).toContain('docker build');
    expect(commands).toContain('cat /tmp/scratch/..');
  });

  it('ranks missed savings by tokens, not by the order rtk printed them', () => {
    const saved = parsed.missed.map((m) => m.savedTokens);
    expect(saved).toEqual([...saved].sort((a, b) => b - a));
  });

  it('parses unhandled commands with their example invocation', () => {
    expect(parsed.unhandled).toHaveLength(3);
    expect(parsed.unhandled[0]).toEqual({ command: 'node', count: 13, example: 'node -v' });
    expect(parsed.unhandled[1].example).toBe('pkill -f "node server/index.js"');
  });

  it('does not leak table headers, rules, or footers into the rows', () => {
    const all = [...parsed.missed, ...parsed.unhandled].map((r) => r.command);
    expect(all).not.toContain('Command');
    expect(all.some((c) => /^[-=]+$/.test(c))).toBe(false);
    expect(all.some((c) => c.includes('github.com'))).toBe(false);
  });

  it('survives empty and malformed input', () => {
    for (const input of ['', null, undefined, 'garbage\nlines\n', 'MISSED SAVINGS\nnonsense\n']) {
      const out = parseDiscover(input);
      expect(out.missed).toEqual([]);
      expect(out.unhandled).toEqual([]);
    }
  });

  /**
   * The demo stub doubles as a fixture. If someone edits its report into a
   * shape the parser cannot read, the demo silently renders an empty table —
   * this catches that.
   */
  it('parses the output of scripts/fake-rtk.mjs', () => {
    const stdout = execFileSync(process.execPath, [FAKE_RTK, 'discover'], { encoding: 'utf8' });
    const out = parseDiscover(stdout);

    expect(out.missed.length).toBeGreaterThan(5);
    expect(out.unhandled.length).toBeGreaterThan(3);
    expect(out.totals.tokens).toBeGreaterThan(0);
    expect(out.scanned.sessions).toBeGreaterThan(0);
    expect(out.scanned.alreadyUsingPct).toBeGreaterThan(0);

    for (const row of out.missed) {
      expect(row.command).toBeTruthy();
      expect(row.rtkEquivalent).toMatch(/^rtk /);
      expect(row.savedTokens).toBeGreaterThan(0);
    }
    for (const row of out.unhandled) {
      expect(row.example).toBeTruthy();
    }
  });

  it('handles a report with no missed savings at all', () => {
    const clean = `RTK Discover -- Savings Opportunities
====================================================
Scanned: 3 sessions (last 30 days), 40 Bash commands
Already using RTK: 40 commands (100.0%)

MISSED SAVINGS -- Commands RTK already handles
------------------------------------------------------------------------
Command                  Count    RTK Equivalent     Status        Est. Savings
------------------------------------------------------------------------
Total: 0 commands -> ~0 tokens saveable
`;
    const out = parseDiscover(clean);
    expect(out.missed).toEqual([]);
    expect(out.scanned.alreadyUsingPct).toBe(100);
    expect(out.totals).toEqual({ commands: 0, tokens: 0 });
  });
});
