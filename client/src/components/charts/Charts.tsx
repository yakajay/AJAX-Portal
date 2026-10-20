import React from 'react';

// Dependency-free SVG charts. Colours come from the brand ramp (blue-* is remapped to green in
// index.css) so they follow the theme; every chart has a text alternative for screen readers.

const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
};

export interface Point { label: string; value: number }

export const BarChart = ({ data, label, height = 180, unit = '' }: { data: Point[]; label: string; height?: number; unit?: string }) => {
  const top = niceMax(Math.max(...data.map((d) => d.value), 0));
  const summary = `${label}: ${data.map((d) => `${d.label} ${d.value}${unit}`).join(', ')}`;
  return (
    <figure className="w-full" aria-label={label}>
      <div role="img" aria-label={summary} className="flex items-end gap-3 border-b border-slate-200" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
            <span className="text-xs font-bold text-slate-600">{d.value}{unit}</span>
            <div
              className="w-full max-w-12 rounded-t-lg bg-blue-600 transition-[height] duration-500"
              style={{ height: `${(d.value / top) * (height - 28)}px`, minHeight: d.value > 0 ? 3 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-2" aria-hidden="true">
        {data.map((d) => (
          <span key={d.label} className="flex-1 min-w-0 text-center text-xs font-semibold text-slate-500 truncate" title={d.label}>{d.label}</span>
        ))}
      </div>
    </figure>
  );
};

export const LineChart = ({ data, label, height = 180, unit = '' }: { data: Point[]; label: string; height?: number; unit?: string }) => {
  const width = 400;
  const pad = { l: 8, r: 8, t: 22, b: 8 };
  const top = niceMax(Math.max(...data.map((d) => d.value), 0));
  const x = (i: number) => pad.l + (data.length === 1 ? (width - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (width - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / top) * (height - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${height - pad.b} L${x(0).toFixed(1)},${height - pad.b} Z`;
  const summary = `${label}: ${data.map((d) => `${d.label} ${d.value}${unit}`).join(', ')}`;

  return (
    <figure className="w-full" aria-label={label}>
      <svg role="img" aria-label={summary} viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
        <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} className="stroke-slate-200" strokeWidth="1" />
        <path d={area} className="fill-blue-600/10" />
        <path d={line} className="stroke-blue-600 fill-none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => (
          <g key={d.label}>
            <circle cx={x(i)} cy={y(d.value)} r="3.5" className="fill-white stroke-blue-600" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <text x={x(i)} y={y(d.value) - 9} textAnchor="middle" className="fill-slate-600" style={{ fontSize: 11, fontWeight: 700 }}>{d.value}{unit}</text>
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-2" aria-hidden="true">
        {data.map((d) => <span key={d.label} className="text-xs font-semibold text-slate-500">{d.label}</span>)}
      </div>
    </figure>
  );
};

export const HBar = ({ data, label }: { data: Point[]; label: string }) => {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul aria-label={label} className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs font-bold text-slate-600 truncate" title={d.label}>{d.label}</span>
          <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-xs font-extrabold text-slate-900">{d.value}</span>
        </li>
      ))}
    </ul>
  );
};

export const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200">
    <h2 className="text-sm font-extrabold text-slate-900 mb-4">{title}</h2>
    {children}
  </div>
);
