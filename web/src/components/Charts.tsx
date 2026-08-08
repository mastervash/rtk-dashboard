import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DayPoint, ToolRow } from '../api';
import { compactNumber, dayLabel, fullNumber, pct } from '../lib/format';

const AXIS = { stroke: '#5a616e', fontSize: 11 } as const;
const GRID = '#22262e';

function TooltipShell({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="panel px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium text-fg">{title}</div>
      {rows.map(([label, value, color]) => (
        <div key={label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            {color && <span className="size-2 rounded-full" style={{ background: color }} />}
            {label}
          </span>
          <span className="tnum text-fg">{value}</span>
        </div>
      ))}
    </div>
  );
}

export function SavingsOverTime({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="savedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayLabel} tickLine={false} axisLine={false} {...AXIS} />
        <YAxis
          yAxisId="tokens"
          tickFormatter={compactNumber}
          tickLine={false}
          axisLine={false}
          width={44}
          {...AXIS}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
          width={40}
          {...AXIS}
        />
        <Tooltip
          cursor={{ stroke: GRID }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as DayPoint;
            return (
              <TooltipShell
                title={String(label)}
                rows={[
                  ['Saved', fullNumber(point.savedTokens), '#34d399'],
                  ['Raw input', fullNumber(point.inputTokens)],
                  ['After rtk', fullNumber(point.outputTokens)],
                  ['Avg savings', pct(point.avgSavingsPct), '#60a5fa'],
                  ['Commands', fullNumber(point.commands)],
                ]}
              />
            );
          }}
        />
        <Area
          yAxisId="tokens"
          type="monotone"
          dataKey="savedTokens"
          stroke="#34d399"
          strokeWidth={1.5}
          fill="url(#savedFill)"
        />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="avgSavingsPct"
          stroke="#60a5fa"
          strokeWidth={1.5}
          dot={false}
          strokeDasharray="3 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CommandVolume({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayLabel} tickLine={false} axisLine={false} {...AXIS} />
        <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} width={44} {...AXIS} />
        <Tooltip
          cursor={{ fill: '#16191f' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <TooltipShell
                title={String(label)}
                rows={[['Commands', fullNumber((payload[0].payload as DayPoint).commands)]]}
              />
            ) : null
          }
        />
        <Bar dataKey="commands" fill="#2f6f5a" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ToolBreakdown({ data }: { data: ToolRow[] }) {
  const top = data.slice(0, 12);
  return (
    <ResponsiveContainer width="100%" height={Math.max(top.length * 26, 120)}>
      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tickFormatter={compactNumber} tickLine={false} axisLine={false} {...AXIS} />
        <YAxis
          type="category"
          dataKey="tool"
          width={78}
          tickLine={false}
          axisLine={false}
          {...AXIS}
        />
        <Tooltip
          cursor={{ fill: '#16191f' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as ToolRow;
            return (
              <TooltipShell
                title={`rtk ${row.tool}`}
                rows={[
                  ['Saved', fullNumber(row.savedTokens), '#34d399'],
                  ['Commands', fullNumber(row.commands)],
                  ['Avg savings', pct(row.avgSavingsPct)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="savedTokens" fill="#34d399" fillOpacity={0.75} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
