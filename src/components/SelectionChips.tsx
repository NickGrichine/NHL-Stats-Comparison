import { formatSeasonId } from '../../shared/seasons.mjs';
import type { SeasonScope } from '../types';

interface Chip {
  label: string;
  color: string;
  season: SeasonScope;
  missing?: boolean;
}

interface Props {
  chips: Chip[];
  pageSeason: SeasonScope;
  onRemove: (index: number) => void;
}

export function SelectionChips({ chips, pageSeason, onRemove }: Props) {
  if (chips.length === 0) return null;

  return (
    <ul className="chips" aria-label="Currently comparing">
      {chips.map((chip, index) => (
        <li key={`${chip.label}-${chip.season}-${index}`} className={chip.missing ? 'is-missing' : undefined}>
          <span className="swatch" style={{ background: chip.color }} aria-hidden="true" />
          <span className="chip-label">{chip.label}</span>

          {/* Only annotate the season when it differs from the page, so a
              same-season comparison stays uncluttered. */}
          {chip.season !== pageSeason && (
            <span className="chip-season">
              {chip.season === 'career' ? 'career' : formatSeasonId(chip.season)}
            </span>
          )}

          {chip.missing && <span className="chip-season">no data</span>}

          <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => onRemove(index)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
