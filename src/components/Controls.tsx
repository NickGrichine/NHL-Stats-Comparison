import { useState } from 'react';

import type { EntityKind, GameType, Manifest, SeasonScope } from '../types';
import type { CohortMode, CompareState, Normalisation } from '../state/useCompareState';
import { supportsCareer } from '../api/datasets';

interface Props {
  state: CompareState;
  manifest: Manifest | null;
  shareUrl: string;
  onChange: (patch: Partial<CompareState>) => void;
}

const KIND_LABELS: Record<EntityKind, string> = {
  skaters: 'Skaters',
  goalies: 'Goalies',
  teams: 'Teams',
};

export function Controls({ state, manifest, shareUrl, onChange }: Props) {
  const [copied, setCopied] = useState(false);

  const seasons = manifest?.seasons ?? [];
  const career = supportsCareer(state.kind);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the URL bar already holds the link.
      setCopied(false);
    }
  };

  return (
    <div className="controls">
      <div className="tabs" role="tablist" aria-label="What to compare">
        {(Object.keys(KIND_LABELS) as EntityKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={state.kind === kind}
            className={`tab${state.kind === kind ? ' is-active' : ''}`}
            onClick={() =>
              onChange({
                kind,
                // Selections do not survive a mode change: a goalie id means
                // nothing in the team dataset.
                picks: [],
                // Teams have no career aggregate to fall back on.
                season:
                  state.season === 'career' && kind === 'teams'
                    ? (manifest?.currentSeason ?? state.season)
                    : state.season,
              })
            }
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Season</span>
        <select
          value={String(state.season)}
          onChange={(event) => {
            const raw = event.target.value;
            const season: SeasonScope = raw === 'career' ? 'career' : Number(raw);
            onChange({ season });
          }}
        >
          {career && <option value="career">All-time career</option>}
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Games</span>
        <select
          value={String(state.gameType)}
          onChange={(event) => onChange({ gameType: Number(event.target.value) as GameType })}
        >
          <option value="2">Regular season</option>
          <option value="3">Playoffs</option>
        </select>
      </label>

      <label className="field">
        <span>
          Scale
          <abbr
            className="hint"
            title="Percentile ranks each stat against everyone else in the same season and position, so eras compare fairly. Raw range scales against that season's best and worst instead."
          >
            ?
          </abbr>
        </span>
        <select
          value={state.norm}
          onChange={(event) => onChange({ norm: event.target.value as Normalisation })}
        >
          <option value="pct">Percentile (era-adjusted)</option>
          <option value="raw">Raw range</option>
        </select>
      </label>

      {state.kind !== 'teams' && (
        <label className="field">
          <span>Compare against</span>
          <select
            value={state.cohort}
            onChange={(event) => onChange({ cohort: event.target.value as CohortMode })}
          >
            <option value="pos">Same position</option>
            <option value="all">Whole league</option>
          </select>
        </label>
      )}

      <button type="button" className="share" onClick={copy}>
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}
