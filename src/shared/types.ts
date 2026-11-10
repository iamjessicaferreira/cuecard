import type { TurnSeconds } from "./config";

export type Lang = "pt-BR" | "en";
export type Difficulty = "easy" | "medium" | "hard";
export type ModePreference = "auto" | "cooperative" | "competitive";
export type PlayMode = "cooperative" | "competitive";

export type Phase =
  | "lobby"
  | "round_intro"
  | "turn_ready"
  | "turn"
  | "reveal"
  | "contest"
  | "between_turns"
  | "finished";

export type Role = "clue-giver" | "guesser" | "opponent" | "waiting" | "lobby";

export interface Card {
  id: string;
  word: string;
  forbidden: string[];
  difficulty: Difficulty;
  themeId: string;
  deckId: string;
}

export interface RoomSettings {
  cardLang: Lang;
  themeIds: string[];
  deckId: string | null;
  mix: boolean;
  cardCount: number;
  turnSeconds: TurnSeconds;
  opponentsSeeFullCard: boolean;
  contestEnabled: boolean;
  contestSeconds: number;
  mode: ModePreference;
  teamCount: number;
}

export interface Player {
  id: string;
  nickname: string;
  teamId: string | null;
  connected: boolean;
  joinedAt: number;
  /** Opaque card ids this device reported from earlier matches. */
  seenIds: string[];
  best: { key: string; score: number } | null;
}

export interface Team {
  id: string;
  color: string;
  nameKey: string;
  score: number;
  strikes: number;
  timeSpentMs: number;
  playerIds: string[];
}

export interface TurnState {
  clueGiverId: string;
  teamId: string | null;
  endsAt: number | null;
  remainingMs: number;
  runningSince: number | null;
  gotThisTurn: number;
  elapsedMs: number;
  reconnectDeadline: number | null;
  /** True once the current head of the pile has been shown. */
  cardLive: boolean;
}

export interface TurnLogEntry {
  giverId: string;
  teamId: string | null;
  got: number;
  durationMs: number;
  end: "timeout" | "bonk" | "round" | "skipped";
}

export interface GameState {
  code: string;
  hostId: string;
  settings: RoomSettings;
  players: Player[];
  teams: Team[];
  /** Resolved when the match starts. Null in the lobby. */
  mode: PlayMode | null;
  phase: Phase;
  round: 1 | 2;
  seed: number;
  /** Shared queue for the round. Index 0 is the card in play. */
  pile: string[];
  /** The match deck, played in full in both rounds. */
  matchCardIds: string[];
  shortDeck: boolean;
  turn: TurnState | null;
  reveal: { cardId: string; until: number } | null;
  contest: { byId: string; until: number } | null;
  teamCursor: number;
  giverIndex: Record<string, number>;
  upcomingGiverId: string | null;
  coopScore: number;
  coopStrikes: number;
  coopTimeMs: number;
  bestScore: number | null;
  winnerTeamId: string | "tie" | null;
  eliminatedTeamId: string | null;
  finishedReason: "completed" | "strikes" | null;
  lastOutcome: "got" | "timeout" | "bonk" | "contested" | "skipped" | null;
  autoAdvanceAt: number | null;
  allowThin: boolean;
  seenWordByPlayer: Record<string, string[]>;
  turnLog: TurnLogEntry[];
  lastActivityAt: number;
}

export type CardView =
  | { kind: "none" }
  | { kind: "hidden" }
  | { kind: "forbidden"; forbidden: string[] }
  | { kind: "full"; word: string; forbidden: string[] }
  | { kind: "reveal"; word: string; forbidden: string[] };

export interface PublicPlayer {
  id: string;
  nickname: string;
  teamId: string | null;
  connected: boolean;
  isHost: boolean;
}

export interface PublicTeam {
  id: string;
  color: string;
  nameKey: string;
  score: number;
  strikes: number;
  timeSpentMs: number;
  playerIds: string[];
}

export interface PlayerView {
  code: string;
  phase: Phase;
  mode: PlayMode | null;
  suggestedMode: PlayMode;
  settings: RoomSettings;
  you: {
    id: string;
    nickname: string;
    teamId: string | null;
    role: Role;
    isHost: boolean;
    canBonk: boolean;
    canSelfBonk: boolean;
    canGotIt: boolean;
    canStartTurn: boolean;
    canAdvance: boolean;
    canContest: boolean;
    isUpNext: boolean;
  };
  players: PublicPlayer[];
  teams: PublicTeam[];
  coop: { score: number; strikes: number; timeSpentMs: number } | null;
  round: 1 | 2;
  cardsLeft: number;
  matchSize: number;
  shortDeck: boolean;
  card: CardView;
  timer: {
    serverNow: number;
    endsAt: number | null;
    remainingMs: number;
    running: boolean;
    durationMs: number;
  };
  turn: {
    clueGiverId: string;
    clueGiverName: string;
    teamId: string | null;
    gotThisTurn: number;
    reconnecting: boolean;
  } | null;
  contest: { until: number; byName: string } | null;
  upcomingGiverName: string | null;
  lastTurn: { name: string; got: number; end: TurnLogEntry["end"] } | null;
  lastOutcome: GameState["lastOutcome"];
  winnerTeamId: string | "tie" | null;
  eliminatedTeamId: string | null;
  finishedReason: GameState["finishedReason"];
  bestScore: number | null;
  seenWordIds: string[];
  groupSeenIds: string[];
  needsGuesser: boolean;
  yourTeamColor: string | null;
  yourTeamNameKey: string | null;
}

export type EngineEvent =
  | { type: "fx"; fx: "bonk" | "timer" | "score" }
  | { type: "notice"; key: string };

export interface StepResult {
  state: GameState;
  events: EngineEvent[];
  error?: string;
}
