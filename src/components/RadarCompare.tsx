import { useMemo } from 'react';
import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

import type { Metric } from '../lib/metrics';
import type { StatRow } from '../types';
import { scaleMetric, scoreMetric, type Distributions } from '../lib/percentile';
import type { Normalisation } from '../state/useCompareState';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export interface Series {
  label: string;
  color: string;
  row: StatRow;
  /**
   * The population this entity is ranked against — its own season and position
   * group, not a shared one. This is what makes a cross-era chart meaningful:
   * Gretzky is measured against 1985-86, McDavid against 2024-25.
   */
  distributions: Distributions;
}

interface Props {
  series: Series[];
  metrics: Metric[];
  norm: Normalisation;
}

/** Turn "#4F9CF9" into a translucent fill of the same hue. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function ordinal(value: number): string {
  const rounded = Math.round(value);
  const mod100 = rounded % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${rounded}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][rounded % 10] ?? 'th';
  return `${rounded}${suffix}`;
}

export function RadarCompare({ series, metrics, norm }: Props) {
  const score = norm === 'pct' ? scoreMetric : scaleMetric;

  const data = useMemo(
    () => ({
      labels: metrics.map((metric) => metric.short),
      datasets: series.map((entry) => ({
        label: entry.label,
        data: metrics.map(
          (metric) =>
            score(entry.distributions, metric.key, entry.row[metric.key], metric.invert) ?? 0,
        ),
        backgroundColor: withAlpha(entry.color, 0.18),
        borderColor: entry.color,
        pointBackgroundColor: entry.color,
        pointBorderColor: 'rgba(0,0,0,0.35)',
        pointHoverRadius: 6,
        borderWidth: 2,
      })),
    }),
    [series, metrics, score],
  );

  const options = useMemo<ChartOptions<'radar'>>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: 'rgba(148, 163, 184, 0.22)' },
          angleLines: { color: 'rgba(148, 163, 184, 0.22)' },
          pointLabels: {
            color: 'rgba(203, 213, 225, 0.95)',
            font: { size: 12, weight: 600 },
          },
        },
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: { color: 'rgba(226, 232, 240, 0.95)', usePointStyle: true, boxWidth: 10 },
        },
        tooltip: {
          callbacks: {
            // The axis carries an abbreviation to keep the chart readable;
            // the tooltip is where the full stat name and the real number live.
            title: (items: TooltipItem<'radar'>[]) => {
              const index = items[0]?.dataIndex ?? 0;
              return metrics[index]?.label ?? '';
            },
            label: (item: TooltipItem<'radar'>) => {
              const metric = metrics[item.dataIndex];
              const entry = series[item.datasetIndex];
              if (!metric || !entry) return '';

              const raw = entry.row[metric.key];
              const shown = metric.format(raw);
              if (raw === null || raw === undefined) {
                return `${entry.label}: not tracked this season`;
              }

              const suffix =
                norm === 'pct'
                  ? ` · ${ordinal(item.parsed.r)} percentile`
                  : ` · ${Math.round(item.parsed.r)}/100 of league range`;
              return `${entry.label}: ${shown}${suffix}`;
            },
          },
        },
      },
    }),
    [metrics, series, norm],
  );

  if (series.length === 0) {
    return (
      <div className="radar-empty">
        <p>Pick at least one player, goalie or team to see the chart.</p>
      </div>
    );
  }

  return (
    <div className="radar-wrap">
      <div className="radar-canvas">
        <Radar data={data} options={options} />
      </div>

      {/* An accessible replacement for v1's hover-to-expand axis labels: the
          key is always visible and readable by a screen reader, rather than
          hidden behind a 400ms mouse hover. */}
      <ul className="axis-key" aria-label="Chart axes">
        {metrics.map((metric) => (
          <li key={metric.key}>
            <abbr title={metric.label}>{metric.short}</abbr>
            <span>{metric.label}</span>
            {metric.invert && <em title="Lower is better, so the axis is inverted">↓</em>}
          </li>
        ))}
      </ul>
    </div>
  );
}
