/**
 * Parses `rtk discover` output into structured rows.
 *
 * discover scans Claude Code history for commands that ran raw when rtk had a
 * filter for them. It is the only rtk output that suggests a behavior change
 * rather than reporting on one, which is why it is worth rendering properly
 * instead of dumping as text.
 *
 * The output is a fixed-width table, so columns are split on runs of two or
 * more spaces — single spaces are part of command names like `docker build`.
 */

const SPLIT = /\s{2,}/;

/** "~2.4K tokens" -> 2400. Returns null when there is no number to read. */
export function parseTokenCount(text) {
  const match = /~?([\d.]+)\s*([KMB])?/i.exec(text ?? '');
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] ?? '').toLowerCase()] ?? 1;
  return Math.round(value * scale);
}

function isRule(line) {
  return /^[-=]{3,}$/.test(line.trim());
}

export function parseDiscover(stdout) {
  const lines = String(stdout ?? '').split('\n');

  const result = {
    scanned: {
      sessions: null,
      days: null,
      bashCommands: null,
      alreadyUsingRtk: null,
      alreadyUsingPct: null,
    },
    missed: [],
    unhandled: [],
    totals: { commands: null, tokens: null },
  };

  // "Scanned: 12 sessions (last 30 days), 155 Bash commands"
  const scanned = /Scanned:\s*(\d+)\s*sessions?\s*\(last\s*(\d+)\s*days?\),\s*(\d+)\s*Bash/i.exec(
    stdout
  );
  if (scanned) {
    result.scanned.sessions = Number(scanned[1]);
    result.scanned.days = Number(scanned[2]);
    result.scanned.bashCommands = Number(scanned[3]);
  }

  // "Already using RTK: 5 commands (3.2%)"
  const already = /Already using RTK:\s*(\d+)\s*commands?\s*\(([\d.]+)%\)/i.exec(stdout);
  if (already) {
    result.scanned.alreadyUsingRtk = Number(already[1]);
    result.scanned.alreadyUsingPct = Number(already[2]);
  }

  // "Total: 49 commands -> ~2.4K tokens saveable"
  const total = /Total:\s*(\d+)\s*commands?\s*(?:->|→)\s*(~?[\d.]+\s*[KMB]?)/i.exec(stdout);
  if (total) {
    result.totals.commands = Number(total[1]);
    result.totals.tokens = parseTokenCount(total[2]);
  }

  let section = null;

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^MISSED SAVINGS/i.test(line)) {
      section = 'missed';
      continue;
    }
    if (/^TOP UNHANDLED/i.test(line)) {
      section = 'unhandled';
      continue;
    }
    if (/^Total:/i.test(line) || /^->|^→/.test(line.trim())) {
      section = null;
      continue;
    }
    if (!section || !line.trim() || isRule(line)) continue;

    const cells = line.trim().split(SPLIT);

    // Skip the column headers of either table.
    if (/^Command$/i.test(cells[0])) continue;

    if (section === 'missed') {
      // Command | Count | RTK Equivalent | Status | Est. Savings
      if (cells.length < 4) continue;
      const count = Number(cells[1]);
      if (!Number.isFinite(count)) continue;
      result.missed.push({
        command: cells[0],
        count,
        rtkEquivalent: cells[2],
        status: cells[3] ?? null,
        savedTokens: parseTokenCount(cells[4]),
      });
    } else {
      // Command | Count | Example
      if (cells.length < 2) continue;
      const count = Number(cells[1]);
      if (!Number.isFinite(count)) continue;
      result.unhandled.push({
        command: cells[0],
        count,
        example: cells.slice(2).join('  ') || null,
      });
    }
  }

  result.missed.sort((a, b) => (b.savedTokens ?? 0) - (a.savedTokens ?? 0));
  result.unhandled.sort((a, b) => b.count - a.count);

  return result;
}
