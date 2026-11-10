/**
 * Placeholder product name. The working title is intentionally boring and
 * isolated here so it can be replaced in one edit. Do not spread the name
 * through the UI as a literal.
 */
export const GAME_NAME = "Cuecard";

/**
 * The playful catch word. Same spelling in every language on purpose.
 * Change this constant if the action (or the game) gets a new name.
 */
export const BONK_LABEL = "BONK!";

/** Competitive teams are out of the match when they reach this many strikes. */
export const STRIKE_LIMIT = 3;

/**
 * Cooperative strike rule (documented choice):
 * A valid BONK subtracts this many points from the shared score, never below
 * zero, and ends the turn. It does NOT end the match at three strikes, so a
 * pair or trio can still finish both rounds. The three pips still fill up;
 * past three they stay full and each extra BONK keeps costing a point.
 * Competitive teams lose immediately at STRIKE_LIMIT instead of losing points.
 */
export const COOP_STRIKE_PENALTY = 1;

/** How long the guessed word stays up. The turn clock is paused for this. */
export const REVEAL_MS = 1700;

/** Scoreboard fallback if nobody taps Next. */
export const BETWEEN_MS = 7000;

/** How long we hold a turn open while the clue-giver's phone reconnects. */
export const RECONNECT_GRACE_MS = 20_000;

export const MAX_PLAYERS = 16;

/** Rooms with nobody connected are dropped after this long. */
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;

export interface TeamPreset {
  id: string;
  color: string;
  /** i18n key, e.g. "team.red". */
  nameKey: string;
}

export const TEAM_PRESETS: TeamPreset[] = [
  { id: "t1", color: "#E23B2F", nameKey: "team.red" },
  { id: "t2", color: "#0E8A7D", nameKey: "team.teal" },
  { id: "t3", color: "#E09F1F", nameKey: "team.gold" },
  { id: "t4", color: "#5C4D8A", nameKey: "team.purple" },
];

export const TURN_CHOICES = [60, 90, 120] as const;
export type TurnSeconds = (typeof TURN_CHOICES)[number];
