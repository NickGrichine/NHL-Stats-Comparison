export declare const GAME_TYPE: { readonly REGULAR: 2; readonly PLAYOFFS: 3 };
export declare const FIRST_SEASON_ID: number;

export declare function formatSeasonId(seasonId: number | string): string;
export declare function seasonIdFromStartYear(startYear: number): number;
export declare function startYearOf(seasonId: number | string): number;
export declare function currentSeasonId(now?: Date): number;
export declare function mutableSeasonIds(now?: Date): number[];
export declare function inSeason(now?: Date): boolean;
