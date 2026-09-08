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

/** "2026-09-29" -> "Tue, Sep 29" */
function formatDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

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
 * Today's games, or — outside the season — whatever the NHL's own schedule
 * feed considers the next game day, since "today" would otherwise be empty.
 *
 * Refreshed hourly by the same workflow that maintains the season data, which
 * is what "real-time" honestly means for a static site: no manual step, never
 * more than an hour stale, and nothing to keep running.
 */
export function Scoreboard() {
  const { data, loading, error } = useAsync(() => loadLive<Scoreboard>('scoreboard'), []);

  if (loading) {
    return (
      <section className="panel">
        <h2>Today</h2>
        <p className="muted">Loading today's games…</p>
      </section>
    );
  }
  if (error || !data) return null;

  const currentDate = data.payload?.currentDate;
  const isToday = !currentDate || currentDate === data.fetchedAt.slice(0, 10);
  const heading = isToday ? 'Today' : `Next games — ${formatDateLabel(currentDate)}`;

  const games = data.payload?.games ?? [];

  return (
    <section className="panel">
      <h2>{heading}</h2>
      {!isToday && (
        <p className="muted small">Nothing is on the schedule today — here's the next game day.</p>
      )}
      {games.length === 0 ? (
        <p className="muted">
          No games scheduled right now. The scoreboard fills in once the season starts.
        </p>
      ) : (
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
      )}
    </section>
  );
}
