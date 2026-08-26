import { useAsync } from '../api/useDataset';
import { loadLive } from '../api/datasets';
import { fmtRelative } from '../lib/format';

interface ApiTeam {
  abbrev?: string;
  score?: number;
  logo?: string;
}

interface ApiGame {
  id: number;
  gameState?: string;
  startTimeUTC?: string;
  awayTeam?: ApiTeam;
  homeTeam?: ApiTeam;
  periodDescriptor?: { number?: number; periodType?: string };
  clock?: { timeRemaining?: string; inIntermission?: boolean };
}

interface Scoreboard {
  currentDate?: string;
  games?: ApiGame[];
}

const LIVE_STATES = new Set(['LIVE', 'CRIT']);
const DONE_STATES = new Set(['FINAL', 'OFF']);

function periodLabel(game: ApiGame): string {
  const number = game.periodDescriptor?.number;
  const type = game.periodDescriptor?.periodType;
  if (type === 'SO') return 'SO';
  if (type === 'OT') return number && number > 4 ? `${number - 3}OT` : 'OT';
  if (!number) return '';
  return `P${number}`;
}

function statusText(game: ApiGame): string {
  const state = game.gameState ?? '';

  if (LIVE_STATES.has(state)) {
    if (game.clock?.inIntermission) return `${periodLabel(game)} INT`;
    return [periodLabel(game), game.clock?.timeRemaining].filter(Boolean).join(' ');
  }

  if (DONE_STATES.has(state)) {
    const suffix = game.periodDescriptor?.periodType;
    return suffix && suffix !== 'REG' ? `Final/${suffix}` : 'Final';
  }

  if (!game.startTimeUTC) return 'Scheduled';
  return new Date(game.startTimeUTC).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Today's games.
 *
 * Refreshed hourly by the same workflow that maintains the season data, which
 * is what "real-time" honestly means for a static site: no manual step, never
 * more than an hour stale, and nothing to keep running.
 */
export function Scoreboard() {
  const { data, loading, error } = useAsync(() => loadLive<Scoreboard>('scoreboard'), []);

  if (loading) return <p className="muted">Loading today's games…</p>;
  if (error || !data) return null;

  const games = data.payload?.games ?? [];

  if (games.length === 0) {
    return (
      <p className="muted">
        No games scheduled today. The scoreboard fills in once the season starts.
      </p>
    );
  }

  return (
    <>
      <div className="scoreboard" role="list">
        {games.map((game) => {
          const live = LIVE_STATES.has(game.gameState ?? '');
          return (
            <article key={game.id} className={`game${live ? ' is-live' : ''}`} role="listitem">
              <div className="game-row">
                <span className="game-team">{game.awayTeam?.abbrev ?? '—'}</span>
                <span className="game-score">{game.awayTeam?.score ?? ''}</span>
              </div>
              <div className="game-row">
                <span className="game-team">{game.homeTeam?.abbrev ?? '—'}</span>
                <span className="game-score">{game.homeTeam?.score ?? ''}</span>
              </div>
              <div className="game-status">
                {live && <span className="live-dot" aria-label="In progress" />}
                {statusText(game)}
              </div>
            </article>
          );
        })}
      </div>
      <p className="muted small">Scores updated {fmtRelative(data.fetchedAt)}.</p>
    </>
  );
}
