import { Search, X } from 'lucide-react';
import type { Facets, Filter } from '../api';
import { Button, Select } from './ui';
import { shortPath } from '../lib/format';

const RANGES = [
  { value: '1', label: 'Last 24h' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '0', label: 'All time' },
];

export function FilterBar({
  filter,
  onChange,
  facets,
  showSearch = false,
}: {
  filter: Filter;
  onChange: (next: Filter) => void;
  facets: Facets | null;
  showSearch?: boolean;
}) {
  const dirty = filter.project !== '' || filter.tool !== '' || filter.q !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={String(filter.days)}
        onChange={(v) => onChange({ ...filter, days: Number(v) })}
        options={RANGES}
      />

      <Select
        value={filter.project}
        onChange={(v) => onChange({ ...filter, project: v })}
        options={[
          { value: '', label: 'All projects' },
          ...(facets?.projects ?? []).map((p) => ({
            value: p.project,
            label: `${shortPath(p.project)} (${p.commands})`,
          })),
        ]}
        className="max-w-[16rem]"
      />

      <Select
        value={filter.tool}
        onChange={(v) => onChange({ ...filter, tool: v })}
        options={[
          { value: '', label: 'All commands' },
          ...(facets?.tools ?? []).map((t) => ({
            value: t.tool,
            label: `${t.tool} (${t.commands})`,
          })),
        ]}
        className="max-w-[14rem]"
      />

      {showSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={filter.q}
            onChange={(e) => onChange({ ...filter, q: e.target.value })}
            placeholder="Search commands…"
            className="w-56 rounded-md border border-line bg-panel py-1.5 pl-7 pr-2 text-xs text-fg outline-none placeholder:text-faint focus:border-faint"
          />
        </div>
      )}

      {dirty && (
        <Button onClick={() => onChange({ ...filter, project: '', tool: '', q: '' })} title="Clear filters">
          <X className="size-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
