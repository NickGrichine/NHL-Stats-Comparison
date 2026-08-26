import { formatSeasonId } from '../../shared/seasons.mjs';
import type { SeasonScope } from '../types';

interface Chip {
  /** Already carries its own "(2017-18)" suffix when the picks span more
   *  than one season — see App.tsx, the single place that decides this. */
  label: string;
  color: string;
  season: SeasonScope;
  /** Tracking the browsed season live, rather than pinned to one. */
  following: boolean;
  /** Position in `state.picks` — required for remove/toggle to hit the
   *  right pick, since this array's own position skips absent picks. */
  pickIndex: number;
  missing?: boolean;
}

interface Props {
  chips: Chip[];
  onRemove: (index: number) => void;
  onToggleFollow: (index: number) => void;
}

export function SelectionChips({ chips, onRemove, onToggleFollow }: Props) {
  if (chips.length === 0) return null;

  return (
    <ul className="chips" aria-label="Currently comparing">
      {chips.map((chip, index) => (
        <li
          key={`${chip.label}-${chip.season}-${index}`}
          className={chip.missing ? 'is-missing' : undefined}
        >
          <span className="swatch" style={{ background: chip.color }} aria-hidden="true" />
          <span className="chip-label">{chip.label}</span>

          <button
            type="button"
            className={`chip-follow${chip.following ? ' is-following' : ''}`}
            aria-pressed={chip.following}
            title={
              chip.following
                ? 'Following the browsed season — click to pin here'
                : 'Pinned to its own season — click to follow the browsed season'
            }
            onClick={() => onToggleFollow(chip.pickIndex)}
          >
            {chip.following ? 'Live' : chip.season === 'career' ? 'career' : formatSeasonId(chip.season)}
          </button>

          {chip.missing && <span className="chip-season">no data</span>}

          <button
            type="button"
            aria-label={`Remove ${chip.label}`}
            onClick={() => onRemove(chip.pickIndex)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
