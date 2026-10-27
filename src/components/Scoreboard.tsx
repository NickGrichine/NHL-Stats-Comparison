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

interface GameDay {
  date: string;
  games: ApiGame[];
}

/** Built by the data pipeline; see `buildScoreboard` in scripts/fetch-data.mjs. */
interface Scoreboard {
  /** The NHL's Eastern-time calendar date when the file was built. */
  today?: string;
  scores?: GameDay | null;
  upcoming?: GameDay | null;
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

function GameCard({ game }: { game: ApiGame }) {
  const live = LIVE_STATES.has(game.gameState ?? '');
  return (
    <article className={`game${live ? ' is-live' : ''}`} role="listitem">
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
}

function GameGroup({ title, day, today }: { title: string; day: GameDay; today: string | undefined }) {
  const when = day.date === today ? 'Today' : formatDateLabel(day.date);
  return (
    <div className="game-group">
      <h3 className="conference-heading">
        {title} — {when}
      </h3>
      <div className="scoreboard" role="list">
        {day.games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </div>
  );
}

/**
 * Two groups, always the same two things: the latest scores (games that have
 * started or finished) and the upcoming games (ones that have not). Today's
 * games move from one group to the other as they play; with nothing started
 * today the scores are the last game day's, and with nothing left to play the
 * upcoming games are the next game day's. The split is built by the data
 * pipeline from the NHL's per-date schedule — not from `score/now`, which
 * keeps reporting yesterday's results well into today's schedule.
 *
 * Refreshed every 15 minutes by the same workflow that maintains the season
 * data, which is what "real-time" honestly means for a static site: no manual
 * step, never more than about 15 minutes stale (scheduled runs can start a
 * little late), and nothing to keep running.
 */
export function Scoreboard() {
  const { data, loading, error } = useAsync(() => loadLive<Scoreboard>('scoreboard'), []);

  if (loading) {
    return (
      <section className="panel">
        <h2>Games</h2>
        <p className="muted">Loading games…</p>
      </section>
    );
  }
  if (error || !data) return null;

  const { today, scores, upcoming } = data.payload ?? {};
  const hasScores = !!scores && scores.games.length > 0;
  const hasUpcoming = !!upcoming && upcoming.games.length > 0;

  return (
    <section className="panel">
      <h2>Games</h2>
      {!hasScores && !hasUpcoming ? (
        <p className="muted">
          No games scheduled right now. The scoreboard fills in once the season starts.
        </p>
      ) : (
        <>
          {hasUpcoming && <GameGroup title="Upcoming games" day={upcoming} today={today} />}
          {hasScores && <GameGroup title="Latest scores" day={scores} today={today} />}
          <p className="muted small">Updated {fmtRelative(data.fetchedAt)}.</p>
        </>
      )}
    </section>
  );
}
