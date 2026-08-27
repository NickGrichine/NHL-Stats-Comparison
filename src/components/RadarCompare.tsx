import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  Filler,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

import type { Metric } from '../lib/metrics';
import type { SeasonScope, StatRow } from '../types';
import { scaleMetric, scoreMetric, type Distributions } from '../lib/percentile';
import type { Normalisation } from '../state/useCompareState';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

export interface Series {
  label: string;
  color: string;
  row: StatRow;
  /** The season this entry is actually showing — its pin, or the page's. */
  season: SeasonScope;
  /** Whether this pick tracks the browsed season rather than a fixed pin. */
  following: boolean;
  /** Position in `state.picks` — not this array's own index, which skips
   *  absent picks. Needed to address remove/toggle actions at the right pick. */
  pickIndex: number;
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

/**
 * Chart.js draws to a canvas, so it needs resolved colors, not `var(--text)`
 * references — read the theme tokens off the root element and re-read them
 * whenever ThemeToggle flips `data-theme`.
 */
function readThemeTextColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    text: style.getPropertyValue('--text').trim() || '#101827',
    muted: style.getPropertyValue('--text-muted').trim() || '#5a6880',
  };
}

function useThemeTextColors() {
  const [colors, setColors] = useState(readThemeTextColors);

  useEffect(() => {
    const update = () => setColors(readThemeTextColors());
    // ThemeToggle applies the initial theme in its own mount effect, which
    // may run before or after this one — re-sync immediately rather than
    // relying solely on the observer, or a same-tick mutation can be missed
    // and the chart stays on the dark palette until the user toggles theme.
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return colors;
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
  const textColors = useThemeTextColors();

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
            color: textColors.text,
            font: { size: 12, weight: 600 },
          },
        },
      },
      plugins: {
        // Rendered as HTML below instead — full control over spacing and
        // marker style, and it stays legible without fighting Chart.js's
        // own legend layout for a plain dot-and-label list.
        legend: { display: false },
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
    [metrics, series, norm, textColors],
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
      <ul className="radar-legend" aria-label="Chart series">
        {series.map((entry) => (
          <li key={entry.label}>
            <span className="radar-legend-dot" style={{ background: entry.color }} aria-hidden="true" />
            {entry.label}
          </li>
        ))}
      </ul>

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
            {metric.invert && (
              // A CSS-driven tooltip, not the native `title` attribute — that
              // one left only a bare help-cursor visible unless the visitor
              // held perfectly still through the browser's own hover delay.
              // Focusable too, so the explanation reaches keyboard users.
              <span className="tip" tabIndex={0} aria-label="Lower is better, so the axis is inverted">
                ↓
                <span className="tip-bubble" role="tooltip">
                  Lower is better
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
