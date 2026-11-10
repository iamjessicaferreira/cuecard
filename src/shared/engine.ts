import {
  BETWEEN_MS,
  COOP_STRIKE_PENALTY,
  MAX_PLAYERS,
  RECONNECT_GRACE_MS,
  REVEAL_MS,
  STRIKE_LIMIT,
  TEAM_PRESETS,
  type TurnSeconds,
} from "./config";
import type {
  Card,
  EngineEvent,
  GameState,
  Phase,
  PlayMode,
  Player,
  PlayerView,
  PublicPlayer,
  Role,
  RoomSettings,
  StepResult,
  Team,
  TurnLogEntry,
} from "./types";

export type EngineAction =
  | { type: "update-settings"; playerId: string; settings: Partial<RoomSettings>; now: number }
  | { type: "join"; player: Pick<Player, "id" | "nickname" | "joinedAt">; now: number }
  | { type: "disconnect"; playerId: string; now: number }
  | { type: "reconnect"; playerId: string; now: number }
  | { type: "leave"; playerId: string; now: number }
  | { type: "claim-team"; playerId: string; teamId: string; now: number }
  | { type: "move-player"; playerId: string; targetId: string; teamId: string; now: number }
  | { type: "shuffle-teams"; playerId: string; seed: number; now: number }
  | { type: "set-team-count"; playerId: string; count: number; now: number }
  | { type: "set-seen"; playerId: string; cardIds: string[]; now: number }
  | { type: "set-best"; playerId: string; key: string; score: number; now: number }
  | { type: "start"; playerId: string; now: number; seed: number; pool: Card[] }
  | { type: "begin-turn"; playerId: string; now: number }
  | { type: "got-it"; playerId: string; now: number }
  | { type: "bonk"; playerId: string; now: number }
  | { type: "self-bonk"; playerId: string; now: number }
  | { type: "contest"; playerId: string; now: number }
  | { type: "accept-bonk"; playerId: string; now: number }
  | { type: "advance"; playerId: string; now: number }
  | { type: "play-anyway"; playerId: string; now: number }
  | { type: "skip-ready"; playerId: string; now: number }
  | { type: "back-to-lobby"; playerId: string; now: number }
  | { type: "tick"; now: number };

const ACTIVE_CARD_PHASES: Phase[] = ["turn", "contest"];

export function defaultSettings(partial: Partial<RoomSettings> = {}): RoomSettings {
  return normalizeSettings({
    cardLang: "pt-BR",
    themeIds: [],
    deckId: null,
    mix: false,
    cardCount: 8,
    turnSeconds: 60,
    opponentsSeeFullCard: false,
    contestEnabled: true,
    contestSeconds: 3,
    mode: "competitive",
    teamCount: 2,
    ...partial,
  });
}

export function normalizeSettings(input: Partial<RoomSettings>): RoomSettings {
  const requested = input.turnSeconds;
  const turnSeconds: TurnSeconds = requested === 90 || requested === 120 ? requested : 60;
  const teamCount = clampInt(input.teamCount ?? 2, 2, 4);
  const cardCount = clampInt(input.cardCount ?? 8, 1, 50);
  const contestSeconds = clampInt(input.contestSeconds ?? 3, 2, 5);
  const mode =
    input.mode === "cooperative" || input.mode === "competitive" || input.mode === "auto"
      ? input.mode
      : "auto";
  return {
    cardLang: input.cardLang === "en" ? "en" : "pt-BR",
    themeIds: [...new Set((input.themeIds ?? []).filter((id) => typeof id === "string" && id.length > 0))].slice(0, 8),
    deckId: input.mix ? null : typeof input.deckId === "string" && input.deckId.length > 0 ? input.deckId : null,
    mix: Boolean(input.mix),
    cardCount,
    turnSeconds,
    opponentsSeeFullCard: Boolean(input.opponentsSeeFullCard),
    contestEnabled: true,
    contestSeconds,
    mode,
    teamCount,
  };
}

export function suggestMode(playerCount: number): PlayMode {
  return playerCount <= 3 ? "cooperative" : "competitive";
}

export function resolveMode(preference: RoomSettings["mode"], playerCount: number): PlayMode {
  if (preference === "cooperative") return "cooperative";
  if (preference === "competitive") return "competitive";
  return suggestMode(playerCount);
}

export function bestScoreKey(settings: RoomSettings): string {
  const source = settings.mix
    ? `mix:${[...settings.themeIds].sort().join(",")}`
    : `deck:${settings.deckId ?? ""}`;
  return [settings.cardLang, source, String(settings.cardCount), String(settings.turnSeconds)].join("|");
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = swap;
  }
  return arr;
}

/**
 * Pick `count` cards, preferring ids the group has not seen, then shuffle
 * that selection into the round-1 pile. Unseen cards are chosen before seen
 * ones; the pile order itself is random.
 */
export function buildMatchDeck(
  pool: readonly Card[],
  seen: ReadonlySet<string>,
  count: number,
  rand: () => number,
): { ids: string[]; short: boolean } {
  const unique: Card[] = [];
  const ids = new Set<string>();
  for (const card of pool) {
    if (ids.has(card.id)) continue;
    ids.add(card.id);
    unique.push(card);
  }
  const unseen = shuffle(
    unique.filter((card) => !seen.has(card.id)),
    rand,
  );
  const already = shuffle(
    unique.filter((card) => seen.has(card.id)),
    rand,
  );
  const picked = [...unseen, ...already].slice(0, Math.max(0, count));
  return {
    ids: shuffle(picked, rand).map((card) => card.id),
    short: picked.length < count,
  };
}

/** Move the current card to the end so the next turn starts on a different one. */
export function parkFront(pile: readonly string[]): string[] {
  if (pile.length <= 1) return pile.slice();
  return [...pile.slice(1), pile[0]!];
}

export function createRoom(input: {
  code: string;
  host: { id: string; nickname: string };
  now: number;
  settings?: Partial<RoomSettings>;
}): GameState {
  const settings = defaultSettings(input.settings);
  const host: Player = {
    id: input.host.id,
    nickname: cleanNickname(input.host.nickname) || "Host",
    teamId: null,
    connected: true,
    joinedAt: input.now,
    seenIds: [],
    best: null,
  };
  const state: GameState = {
    code: input.code,
    hostId: host.id,
    settings,
    players: [host],
    teams: [],
    mode: null,
    phase: "lobby",
    round: 1,
    seed: 1,
    pile: [],
    matchCardIds: [],
    shortDeck: false,
    turn: null,
    reveal: null,
    contest: null,
    teamCursor: 0,
    giverIndex: {},
    upcomingGiverId: null,
    coopScore: 0,
    coopStrikes: 0,
    coopTimeMs: 0,
    bestScore: null,
    winnerTeamId: null,
    eliminatedTeamId: null,
    finishedReason: null,
    lastOutcome: null,
    autoAdvanceAt: null,
    allowThin: false,
    seenWordByPlayer: {},
    turnLog: [],
    lastActivityAt: input.now,
  };
  ensureTeams(state);
  return state;
}

export function step(state: GameState, action: EngineAction): StepResult {
  switch (action.type) {
    case "tick":
      return tick(state, action.now);
    case "update-settings":
      return updateSettings(state, action);
    case "join":
      return join(state, action);
    case "disconnect":
      return disconnect(state, action.playerId, action.now);
    case "reconnect":
      return reconnect(state, action.playerId, action.now);
    case "leave":
      return leave(state, action.playerId, action.now);
    case "claim-team":
      return claimTeam(state, action);
    case "move-player":
      return movePlayer(state, action);
    case "shuffle-teams":
      return shuffleTeams(state, action);
    case "set-team-count":
      return setTeamCount(state, action);
    case "set-seen":
      return setSeen(state, action);
    case "set-best":
      return setBest(state, action);
    case "start":
      return startMatch(state, action);
    case "begin-turn":
      return beginTurn(state, action.playerId, action.now);
    case "got-it":
      return gotIt(state, action.playerId, action.now);
    case "bonk":
      return bonk(state, action.playerId, action.now, false);
    case "self-bonk":
      return bonk(state, action.playerId, action.now, true);
    case "contest":
      return contest(state, action.playerId, action.now);
    case "accept-bonk":
      return acceptBonk(state, action.playerId, action.now);
    case "advance":
      return advance(state, action.playerId, action.now);
    case "play-anyway":
      return playAnyway(state, action.playerId, action.now);
    case "skip-ready":
      return skipReady(state, action.playerId, action.now);
    case "back-to-lobby":
      return backToLobby(state, action.playerId, action.now);
    default:
      return fail(state, "errors.unknown");
  }
}

export function roleFor(state: GameState, playerId: string): Role {
  if (state.phase === "lobby") return "lobby";
  const giverId =
    state.phase === "turn" ||
    state.phase === "turn_ready" ||
    state.phase === "reveal" ||
    state.phase === "contest"
      ? state.turn?.clueGiverId
      : null;
  if (!giverId) return "waiting";
  if (playerId === giverId) return "clue-giver";
  if (state.mode === "cooperative") return "guesser";
  const player = playerById(state, playerId);
  const giver = playerById(state, giverId);
  if (!player?.teamId || !giver?.teamId) return "waiting";
  return player.teamId === giver.teamId ? "guesser" : "opponent";
}

export function canBonk(state: GameState, playerId: string): boolean {
  if (state.phase !== "turn" || !state.turn || state.turn.reconnectDeadline) return false;
  if (playerId === state.turn.clueGiverId) return false;
  const actor = playerById(state, playerId);
  if (!actor?.connected) return false;
  if (state.mode === "cooperative") return true;
  const giver = playerById(state, state.turn.clueGiverId);
  if (!actor.teamId || !giver?.teamId) return false;
  return actor.teamId !== giver.teamId;
}

export function canSelfBonk(state: GameState, playerId: string): boolean {
  return (
    state.phase === "turn" &&
    state.turn?.clueGiverId === playerId &&
    !state.turn.reconnectDeadline &&
    state.turn.cardLive
  );
}

export function projectView(
  state: GameState,
  playerId: string,
  cardsById: Record<string, Card>,
  now: number,
): PlayerView {
  const you = playerById(state, playerId);
  const role = roleFor(state, playerId);
  const team = you?.teamId ? teamById(state, you.teamId) : undefined;
  const last = state.turnLog[state.turnLog.length - 1];
  const giverId = state.turn?.clueGiverId;
  const upcomingId = state.upcomingGiverId;
  const connectedCount = state.players.filter((player) => player.connected).length;
  const needsGuesser = teamNeedsGuesser(state);

  return {
    code: state.code,
    phase: state.phase,
    mode: state.mode,
    suggestedMode: suggestMode(connectedCount),
    settings: state.settings,
    you: {
      id: playerId,
      nickname: you?.nickname ?? "",
      teamId: you?.teamId ?? null,
      role,
      isHost: state.hostId === playerId,
      canBonk: canBonk(state, playerId),
      canSelfBonk: canSelfBonk(state, playerId),
      canGotIt: state.phase === "turn" && giverId === playerId && !state.turn?.reconnectDeadline && state.turn?.cardLive === true,
      canStartTurn: state.phase === "turn_ready" && giverId === playerId && !state.turn?.reconnectDeadline,
      canAdvance: canAdvance(state, playerId),
      canContest: state.phase === "contest" && giverId === playerId,
      isUpNext:
        upcomingId === playerId &&
        (state.phase === "round_intro" || state.phase === "between_turns" || state.phase === "turn_ready"),
    },
    players: state.players.map((player) => toPublicPlayer(state, player)),
    teams: state.teams.map((entry) => ({
      id: entry.id,
      color: entry.color,
      nameKey: entry.nameKey,
      score: entry.score,
      strikes: entry.strikes,
      timeSpentMs: entry.timeSpentMs,
      playerIds: entry.playerIds.slice(),
    })),
    coop:
      state.mode === "cooperative"
        ? { score: state.coopScore, strikes: state.coopStrikes, timeSpentMs: state.coopTimeMs }
        : null,
    round: state.round,
    cardsLeft: state.pile.length,
    matchSize: state.matchCardIds.length,
    shortDeck: state.shortDeck,
    card: cardViewFor(state, playerId, cardsById),
    timer: {
      serverNow: now,
      endsAt: state.turn?.endsAt ?? null,
      remainingMs: remainingMs(state, now),
      running: Boolean(state.turn?.runningSince) && !state.turn?.reconnectDeadline,
      durationMs: state.settings.turnSeconds * 1000,
    },
    turn: state.turn
      ? {
          clueGiverId: state.turn.clueGiverId,
          clueGiverName: playerById(state, state.turn.clueGiverId)?.nickname ?? "",
          teamId: state.turn.teamId,
          gotThisTurn: state.turn.gotThisTurn,
          reconnecting: Boolean(state.turn.reconnectDeadline),
        }
      : null,
    contest: state.contest
      ? { until: state.contest.until, byName: playerById(state, state.contest.byId)?.nickname ?? "" }
      : null,
    upcomingGiverName: upcomingId ? playerById(state, upcomingId)?.nickname ?? null : null,
    lastTurn: last
      ? {
          name: playerById(state, last.giverId)?.nickname ?? "",
          got: last.got,
          end: last.end,
        }
      : null,
    lastOutcome: state.lastOutcome,
    winnerTeamId: state.winnerTeamId,
    eliminatedTeamId: state.eliminatedTeamId,
    finishedReason: state.finishedReason,
    bestScore: state.bestScore,
    seenWordIds: (state.seenWordByPlayer[playerId] ?? []).slice(),
    groupSeenIds: [...new Set(state.players.flatMap((player) => player.seenIds))],
    needsGuesser,
    yourTeamColor: team?.color ?? null,
    yourTeamNameKey: team?.nameKey ?? null,
  };
}

export function needsTick(state: GameState, now: number): boolean {
  if (state.phase === "reveal" && state.reveal && now >= state.reveal.until) return true;
  if (state.phase === "contest" && state.contest && now >= state.contest.until) return true;
  if (state.turn?.reconnectDeadline && now >= state.turn.reconnectDeadline) return true;
  if (state.phase === "turn" && state.turn?.endsAt && now >= state.turn.endsAt && !state.turn.reconnectDeadline) {
    return true;
  }
  if (state.phase === "between_turns" && state.autoAdvanceAt && now >= state.autoAdvanceAt) return true;
  return false;
}

function tick(state: GameState, now: number): StepResult {
  if (state.phase === "reveal" && state.reveal && now >= state.reveal.until) {
    return finishReveal(state, now);
  }
  if (state.phase === "contest" && state.contest && now >= state.contest.until) {
    return resolveBonk(clone(state), now, []);
  }
  if (state.turn?.reconnectDeadline && now >= state.turn.reconnectDeadline) {
    return expireReconnect(state, now);
  }
  if (state.phase === "turn" && state.turn?.endsAt && now >= state.turn.endsAt) {
    const next = clone(state);
    next.lastActivityAt = now;
    return endTurn(next, now, "timeout", true, [{ type: "fx", fx: "timer" }]);
  }
  if (state.phase === "between_turns" && state.autoAdvanceAt && now >= state.autoAdvanceAt) {
    return advance(state, state.hostId, now);
  }
  return { state, events: [] };
}

function updateSettings(
  state: GameState,
  action: Extract<EngineAction, { type: "update-settings" }>,
): StepResult {
  if (!isHost(state, action.playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "lobby") return fail(state, "errors.badPhase");
  const next = clone(state);
  next.settings = normalizeSettings({ ...next.settings, ...action.settings });
  if (action.settings.mix) next.settings.deckId = null;
  ensureTeams(next);
  touch(next, action.now);
  return ok(next);
}

function join(state: GameState, action: Extract<EngineAction, { type: "join" }>): StepResult {
  if (state.players.length >= MAX_PLAYERS) return fail(state, "errors.roomFull");
  const nickname = cleanNickname(action.player.nickname);
  if (nickname.length < 1 || nickname.length > 16) return fail(state, "errors.nickname");
  if (state.players.some((player) => player.id === action.player.id)) return fail(state, "errors.nicknameTaken");
  if (state.players.some((player) => foldName(player.nickname) === foldName(nickname))) {
    return fail(state, "errors.nicknameTaken");
  }
  const next = clone(state);
  next.players.push({
    id: action.player.id,
    nickname,
    teamId: null,
    connected: true,
    joinedAt: action.player.joinedAt,
    seenIds: [],
    best: null,
  });
  touch(next, action.now);
  return ok(next);
}

function disconnect(state: GameState, playerId: string, now: number): StepResult {
  const player = playerById(state, playerId);
  if (!player || !player.connected) return { state, events: [] };
  const next = clone(state);
  const target = playerById(next, playerId);
  if (!target) return { state, events: [] };
  target.connected = false;
  touch(next, now);
  if (next.turn?.clueGiverId === playerId && (next.phase === "turn" || next.phase === "turn_ready")) {
    if (next.phase === "turn" && next.turn.cardLive) pauseClock(next, now);
    next.turn.reconnectDeadline = now + RECONNECT_GRACE_MS;
    next.turn.endsAt = null;
  }
  return ok(next);
}

function reconnect(state: GameState, playerId: string, now: number): StepResult {
  const player = playerById(state, playerId);
  if (!player) return fail(state, "errors.missingPlayer");
  const next = clone(state);
  const target = playerById(next, playerId)!;
  target.connected = true;
  touch(next, now);
  if (next.turn?.clueGiverId === playerId && next.turn.reconnectDeadline) {
    next.turn.reconnectDeadline = null;
    if (next.phase === "turn" && next.turn.cardLive) {
      resumeClock(next, now);
      markWordShown(next, next.pile[0]);
    }
  }
  return ok(next);
}

function leave(state: GameState, playerId: string, now: number): StepResult {
  if (!playerById(state, playerId)) return fail(state, "errors.missingPlayer");
  const next = clone(state);
  const wasGiver = next.turn?.clueGiverId === playerId && (next.phase === "turn" || next.phase === "turn_ready");
  next.players = next.players.filter((player) => player.id !== playerId);
  if (next.hostId === playerId) {
    const replacement = [...next.players].sort((a, b) => a.joinedAt - b.joinedAt).find((player) => player.connected);
    next.hostId = replacement?.id ?? next.players[0]?.id ?? "";
  }
  syncTeamRosters(next);
  touch(next, now);
  if (next.players.length === 0) return ok(next);
  if (wasGiver && next.phase === "turn" && next.turn?.cardLive) {
    return endTurn(next, now, "skipped", true, []);
  }
  if (wasGiver && next.phase === "turn_ready") {
    return handOff(next, now, "skipped", false);
  }
  if (next.upcomingGiverId === playerId) ensureUpcoming(next);
  return ok(next);
}

function claimTeam(state: GameState, action: Extract<EngineAction, { type: "claim-team" }>): StepResult {
  if (state.phase !== "lobby" && state.phase !== "between_turns" && state.phase !== "round_intro") {
    return fail(state, "errors.badPhase");
  }
  if (state.mode === "cooperative") return fail(state, "errors.badPhase");
  if (!state.teams.some((team) => team.id === action.teamId)) return fail(state, "errors.teamMissing");
  const player = playerById(state, action.playerId);
  if (!player) return fail(state, "errors.missingPlayer");
  const next = clone(state);
  playerById(next, action.playerId)!.teamId = action.teamId;
  syncTeamRosters(next);
  if (next.phase !== "lobby") ensureUpcoming(next);
  touch(next, action.now);
  return ok(next);
}

function movePlayer(state: GameState, action: Extract<EngineAction, { type: "move-player" }>): StepResult {
  if (!isHost(state, action.playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "lobby" && state.phase !== "between_turns" && state.phase !== "round_intro") {
    return fail(state, "errors.badPhase");
  }
  if (!state.teams.some((team) => team.id === action.teamId)) return fail(state, "errors.teamMissing");
  if (!playerById(state, action.targetId)) return fail(state, "errors.missingPlayer");
  const next = clone(state);
  playerById(next, action.targetId)!.teamId = action.teamId;
  syncTeamRosters(next);
  if (next.phase !== "lobby") ensureUpcoming(next);
  touch(next, action.now);
  return ok(next);
}

function shuffleTeams(state: GameState, action: Extract<EngineAction, { type: "shuffle-teams" }>): StepResult {
  if (!isHost(state, action.playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "lobby" && state.phase !== "between_turns" && state.phase !== "round_intro") {
    return fail(state, "errors.badPhase");
  }
  const next = clone(state);
  const rand = mulberry32(action.seed);
  const connected = shuffle(
    next.players.filter((player) => player.connected),
    rand,
  );
  for (const player of next.players) {
    if (player.connected) player.teamId = null;
  }
  connected.forEach((player, index) => {
    const team = next.teams[index % next.teams.length];
    if (team) player.teamId = team.id;
  });
  syncTeamRosters(next);
  if (next.phase !== "lobby") ensureUpcoming(next);
  touch(next, action.now);
  return ok(next);
}

function setTeamCount(state: GameState, action: Extract<EngineAction, { type: "set-team-count" }>): StepResult {
  if (!isHost(state, action.playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "lobby") return fail(state, "errors.badPhase");
  const next = clone(state);
  next.settings.teamCount = clampInt(action.count, 2, 4);
  ensureTeams(next);
  touch(next, action.now);
  return ok(next);
}

function setSeen(state: GameState, action: Extract<EngineAction, { type: "set-seen" }>): StepResult {
  if (!playerById(state, action.playerId)) return fail(state, "errors.missingPlayer");
  const unique = [...new Set(action.cardIds.filter((id) => typeof id === "string" && id.length > 0 && id.length < 80))]
    .sort()
    .slice(0, 5000);
  const current = playerById(state, action.playerId)!.seenIds;
  if (current.length === unique.length && current.every((id, index) => id === unique[index])) {
    return { state, events: [] };
  }
  const next = clone(state);
  playerById(next, action.playerId)!.seenIds = unique;
  touch(next, action.now);
  return ok(next);
}

function setBest(state: GameState, action: Extract<EngineAction, { type: "set-best" }>): StepResult {
  if (!playerById(state, action.playerId)) return fail(state, "errors.missingPlayer");
  if (!Number.isFinite(action.score) || action.score < 0) return fail(state, "errors.unknown");
  const key = action.key.slice(0, 200);
  const score = Math.floor(action.score);
  const current = playerById(state, action.playerId)!.best;
  if (current && current.key === key && current.score === score) return { state, events: [] };
  const next = clone(state);
  playerById(next, action.playerId)!.best = { key, score };
  touch(next, action.now);
  return ok(next);
}

function startMatch(state: GameState, action: Extract<EngineAction, { type: "start" }>): StepResult {
  if (!isHost(state, action.playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "lobby") return fail(state, "errors.badPhase");
  const connected = state.players.filter((player) => player.connected);
  if (connected.length < 2) return fail(state, "errors.needPlayers");

  const next = clone(state);
  const mode = resolveMode(next.settings.mode, connected.length);
  next.mode = mode;

  if (mode === "competitive") {
    if (connected.length < 4) return fail(state, "errors.needTeams");
    seatUnassigned(next);
    const problem = competitiveRosterProblem(next);
    if (problem) return fail(state, problem);
  }

  if (!next.settings.mix && !next.settings.deckId) return fail(state, "errors.noDeck");
  if (next.settings.mix && next.settings.themeIds.length === 0) return fail(state, "errors.noDeck");
  if (action.pool.length === 0) return fail(state, "errors.notEnoughCards");

  const seen = new Set(next.players.flatMap((player) => player.seenIds));
  const built = buildMatchDeck(action.pool, seen, next.settings.cardCount, mulberry32(action.seed));
  if (built.ids.length < 1) return fail(state, "errors.notEnoughCards");

  next.seed = action.seed;
  next.matchCardIds = built.ids;
  next.pile = built.ids.slice();
  next.shortDeck = built.short;
  next.round = 1;
  next.phase = "round_intro";
  next.turn = null;
  next.reveal = null;
  next.contest = null;
  next.teamCursor = 0;
  next.giverIndex = Object.fromEntries(next.teams.map((team) => [team.id, 0]));
  next.coopScore = 0;
  next.coopStrikes = 0;
  next.coopTimeMs = 0;
  next.winnerTeamId = null;
  next.eliminatedTeamId = null;
  next.finishedReason = null;
  next.lastOutcome = null;
  next.autoAdvanceAt = null;
  next.allowThin = false;
  next.seenWordByPlayer = {};
  next.turnLog = [];
  for (const team of next.teams) {
    team.score = 0;
    team.strikes = 0;
    team.timeSpentMs = 0;
  }
  const key = bestScoreKey(next.settings);
  const bests = next.players
    .map((player) => (player.best?.key === key ? player.best.score : null))
    .filter((score): score is number => score !== null);
  next.bestScore = bests.length > 0 ? Math.max(...bests) : null;
  next.upcomingGiverId = firstGiver(next);
  if (!next.upcomingGiverId) return fail(state, "errors.needPlayers");
  touch(next, action.now);
  return ok(next);
}

function beginTurn(state: GameState, playerId: string, now: number): StepResult {
  if (state.phase !== "turn_ready" || state.turn?.clueGiverId !== playerId) return fail(state, "errors.notYourTurn");
  if (state.turn.reconnectDeadline) return fail(state, "errors.badPhase");
  if (state.pile.length === 0) return fail(state, "errors.noCard");
  const next = clone(state);
  next.phase = "turn";
  next.turn!.cardLive = true;
  next.turn!.reconnectDeadline = null;
  resumeClock(next, now);
  next.lastOutcome = null;
  markWordShown(next, next.pile[0]);
  touch(next, now);
  return ok(next);
}

function gotIt(state: GameState, playerId: string, now: number): StepResult {
  if (state.phase !== "turn" || state.turn?.clueGiverId !== playerId) return fail(state, "errors.notYourTurn");
  if (!state.turn.cardLive || state.turn.reconnectDeadline) return fail(state, "errors.badPhase");
  if (state.pile.length === 0) return fail(state, "errors.noCard");
  const next = clone(state);
  const [cardId, ...rest] = next.pile;
  next.pile = rest;
  next.turn!.gotThisTurn += 1;
  next.turn!.cardLive = false;
  if (next.mode === "cooperative") next.coopScore += 1;
  else if (next.turn!.teamId) {
    const team = teamById(next, next.turn!.teamId);
    if (team) team.score += 1;
  }
  pauseClock(next, now);
  next.reveal = { cardId: cardId!, until: now + REVEAL_MS };
  next.phase = "reveal";
  next.lastOutcome = "got";
  for (const player of next.players) markSeen(next, player.id, cardId!);
  touch(next, now);
  return ok(next, [{ type: "fx", fx: "score" }]);
}

function bonk(state: GameState, playerId: string, now: number, self: boolean): StepResult {
  if (state.phase !== "turn" || !state.turn?.cardLive) return fail(state, "errors.badPhase");
  if (self) {
    if (!canSelfBonk(state, playerId)) return fail(state, "errors.cannotBonk");
  } else if (!canBonk(state, playerId)) {
    return fail(state, "errors.cannotBonk");
  }
  const next = clone(state);
  const events: EngineEvent[] = [{ type: "fx", fx: "bonk" }];
  pauseClock(next, now);
  if (self || !next.settings.contestEnabled) {
    return resolveBonk(next, now, events);
  }
  next.phase = "contest";
  next.contest = { byId: playerId, until: now + next.settings.contestSeconds * 1000 };
  touch(next, now);
  return ok(next, events);
}

function contest(state: GameState, playerId: string, now: number): StepResult {
  if (state.phase !== "contest" || state.turn?.clueGiverId !== playerId) return fail(state, "errors.notYourTurn");
  const next = clone(state);
  next.contest = null;
  next.phase = "turn";
  next.lastOutcome = "contested";
  resumeClock(next, now);
  touch(next, now);
  return ok(next, [{ type: "notice", key: "notices.contested" }]);
}

function acceptBonk(state: GameState, playerId: string, now: number): StepResult {
  if (state.phase !== "contest" || state.turn?.clueGiverId !== playerId) return fail(state, "errors.notYourTurn");
  const next = clone(state);
  return resolveBonk(next, now, []);
}

function advance(state: GameState, playerId: string, now: number): StepResult {
  if (state.phase !== "round_intro" && state.phase !== "between_turns") return fail(state, "errors.badPhase");
  if (!playerById(state, playerId)?.connected && playerId !== state.hostId) return fail(state, "errors.missingPlayer");
  const next = clone(state);
  if (next.mode === "competitive") seatUnassigned(next);
  if (!ensureUpcoming(next)) return fail(state, "errors.needPlayers");
  if (teamNeedsGuesser(next) && !next.allowThin) return fail(state, "errors.teamTooSmall");
  openReady(next, now);
  touch(next, now);
  return ok(next);
}

function playAnyway(state: GameState, playerId: string, now: number): StepResult {
  if (!isHost(state, playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "between_turns" && state.phase !== "round_intro") return fail(state, "errors.badPhase");
  const next = clone(state);
  next.allowThin = true;
  const result = advance(next, playerId, now);
  if (result.error) return fail(state, result.error);
  return result;
}

function skipReady(state: GameState, playerId: string, now: number): StepResult {
  if (!isHost(state, playerId)) return fail(state, "errors.notHost");
  if (state.phase !== "turn_ready") return fail(state, "errors.badPhase");
  const next = clone(state);
  return handOff(next, now, "skipped", false);
}

function backToLobby(state: GameState, playerId: string, now: number): StepResult {
  if (!isHost(state, playerId)) return fail(state, "errors.notHost");
  if (state.phase === "lobby") return fail(state, "errors.badPhase");
  const next = clone(state);
  next.phase = "lobby";
  next.mode = null;
  next.round = 1;
  next.pile = [];
  next.matchCardIds = [];
  next.shortDeck = false;
  next.turn = null;
  next.reveal = null;
  next.contest = null;
  next.upcomingGiverId = null;
  next.coopScore = 0;
  next.coopStrikes = 0;
  next.coopTimeMs = 0;
  next.bestScore = null;
  next.winnerTeamId = null;
  next.eliminatedTeamId = null;
  next.finishedReason = null;
  next.lastOutcome = null;
  next.autoAdvanceAt = null;
  next.allowThin = false;
  next.seenWordByPlayer = {};
  next.turnLog = [];
  next.teamCursor = 0;
  next.giverIndex = {};
  for (const team of next.teams) {
    team.score = 0;
    team.strikes = 0;
    team.timeSpentMs = 0;
  }
  touch(next, now);
  return ok(next);
}

function finishReveal(state: GameState, now: number): StepResult {
  const next = clone(state);
  next.reveal = null;
  touch(next, now);
  if (next.pile.length === 0) {
    pushLog(next, "round");
    rememberGiverAndBump(next);
    next.turn = null;
    if (next.round === 1) {
      next.round = 2;
      next.pile = shuffle(next.matchCardIds, mulberry32(next.seed + 2));
      next.phase = "round_intro";
      next.autoAdvanceAt = null;
      ensureUpcoming(next);
      return ok(next);
    }
    finishByScore(next);
    return ok(next);
  }
  const giver = next.turn ? playerById(next, next.turn.clueGiverId) : undefined;
  if (!giver?.connected) {
    next.phase = "turn";
    next.turn!.cardLive = false;
    next.turn!.reconnectDeadline = now + RECONNECT_GRACE_MS;
    next.turn!.endsAt = null;
    return ok(next);
  }
  next.phase = "turn";
  next.turn!.cardLive = true;
  resumeClock(next, now);
  markWordShown(next, next.pile[0]);
  return ok(next);
}

function resolveBonk(state: GameState, now: number, events: EngineEvent[]): StepResult {
  const next = state;
  next.contest = null;
  const teamId = next.turn?.teamId ?? null;
  if (next.mode === "cooperative") {
    next.coopStrikes += 1;
    next.coopScore = Math.max(0, next.coopScore - COOP_STRIKE_PENALTY);
  } else if (teamId) {
    const team = teamById(next, teamId);
    if (team) team.strikes += 1;
    if (team && team.strikes >= STRIKE_LIMIT) {
      pushLog(next, "bonk");
      next.pile = parkFront(next.pile);
      next.lastOutcome = "bonk";
      next.turn = null;
      finishByStrikes(next, teamId);
      touch(next, now);
      return ok(next, events);
    }
  }
  return endTurn(next, now, "bonk", true, events);
}

function expireReconnect(state: GameState, now: number): StepResult {
  const next = clone(state);
  const live = Boolean(next.turn?.cardLive);
  if (next.phase === "turn" && live) return endTurn(next, now, "timeout", true, [{ type: "fx", fx: "timer" }]);
  return handOff(next, now, "skipped", false);
}

function endTurn(
  state: GameState,
  now: number,
  end: TurnLogEntry["end"],
  park: boolean,
  events: EngineEvent[],
): StepResult {
  if (park) state.pile = parkFront(state.pile);
  if (state.turn?.runningSince) pauseClock(state, now);
  pushLog(state, end);
  state.lastOutcome = end === "skipped" ? "skipped" : end === "bonk" ? "bonk" : "timeout";
  rememberGiverAndBump(state);
  state.turn = null;
  state.reveal = null;
  state.contest = null;
  state.phase = "between_turns";
  state.allowThin = false;
  if (state.mode === "competitive") seatUnassigned(state);
  ensureUpcoming(state);
  queueAdvance(state, now);
  touch(state, now);
  return ok(state, events);
}

function handOff(state: GameState, now: number, end: TurnLogEntry["end"], park: boolean): StepResult {
  return endTurn(state, now, end, park, []);
}

function finishByScore(state: GameState) {
  state.phase = "finished";
  state.finishedReason = "completed";
  state.autoAdvanceAt = null;
  state.turn = null;
  if (state.mode === "cooperative") {
    state.winnerTeamId = null;
    return;
  }
  const top = Math.max(...state.teams.map((team) => team.score));
  const leaders = state.teams.filter((team) => team.score === top);
  state.winnerTeamId = leaders.length === 1 ? leaders[0]!.id : "tie";
}

function finishByStrikes(state: GameState, eliminatedTeamId: string) {
  state.phase = "finished";
  state.finishedReason = "strikes";
  state.eliminatedTeamId = eliminatedTeamId;
  state.autoAdvanceAt = null;
  const others = state.teams.filter((team) => team.id !== eliminatedTeamId);
  const top = Math.max(...others.map((team) => team.score));
  const leaders = others.filter((team) => team.score === top);
  state.winnerTeamId = leaders.length === 1 ? leaders[0]!.id : "tie";
}

function openReady(state: GameState, now: number) {
  const giverId = state.upcomingGiverId;
  const giver = giverId ? playerById(state, giverId) : undefined;
  state.phase = "turn_ready";
  state.autoAdvanceAt = null;
  state.reveal = null;
  state.contest = null;
  state.turn = {
    clueGiverId: giverId ?? "",
    teamId: state.mode === "cooperative" ? null : giver?.teamId ?? null,
    endsAt: null,
    remainingMs: state.settings.turnSeconds * 1000,
    runningSince: null,
    gotThisTurn: 0,
    elapsedMs: 0,
    reconnectDeadline: giver?.connected ? null : now + RECONNECT_GRACE_MS,
    cardLive: false,
  };
}

function pauseClock(state: GameState, now: number) {
  const turn = state.turn;
  if (!turn) return;
  if (turn.runningSince !== null) {
    const until = turn.endsAt !== null && turn.endsAt < now ? turn.endsAt : now;
    const delta = Math.max(0, until - turn.runningSince);
    turn.elapsedMs += delta;
    addTeamTime(state, turn.teamId, delta);
    turn.runningSince = null;
  }
  if (turn.endsAt !== null) {
    turn.remainingMs = Math.max(0, turn.endsAt - now);
    turn.endsAt = null;
  }
}

function resumeClock(state: GameState, now: number) {
  const turn = state.turn;
  if (!turn) return;
  turn.endsAt = now + turn.remainingMs;
  turn.runningSince = now;
}

function addTeamTime(state: GameState, teamId: string | null, delta: number) {
  if (delta <= 0) return;
  if (state.mode === "cooperative") {
    state.coopTimeMs += delta;
    return;
  }
  if (!teamId) return;
  const team = teamById(state, teamId);
  if (team) team.timeSpentMs += delta;
}

function pushLog(state: GameState, end: TurnLogEntry["end"]) {
  if (!state.turn) return;
  state.turnLog.push({
    giverId: state.turn.clueGiverId,
    teamId: state.turn.teamId,
    got: state.turn.gotThisTurn,
    durationMs: state.turn.elapsedMs,
    end,
  });
}

function rememberGiverAndBump(state: GameState) {
  const justPlayed = state.turn?.clueGiverId ?? state.upcomingGiverId;
  if (state.mode === "cooperative") {
    const roster = coopRoster(state);
    if (roster.length === 0) {
      state.upcomingGiverId = null;
      return;
    }
    const index = roster.findIndex((player) => player.id === justPlayed);
    state.upcomingGiverId = roster[(index + 1) % roster.length]!.id;
    return;
  }
  const current = state.teams[state.teamCursor];
  if (current) state.giverIndex[current.id] = (state.giverIndex[current.id] ?? 0) + 1;
  const total = state.teams.length;
  for (let step = 1; step <= total; step += 1) {
    const index = (state.teamCursor + step) % total;
    const team = state.teams[index];
    if (!team) continue;
    if (connectedOnTeam(state, team.id).length > 0) {
      state.teamCursor = index;
      state.upcomingGiverId = giverForCurrentIndex(state, team.id);
      return;
    }
  }
  state.upcomingGiverId = null;
}

function firstGiver(state: GameState): string | null {
  if (state.mode === "cooperative") return coopRoster(state)[0]?.id ?? null;
  for (let index = 0; index < state.teams.length; index += 1) {
    const team = state.teams[index];
    if (!team) continue;
    const giver = giverForCurrentIndex(state, team.id);
    if (giver) {
      state.teamCursor = index;
      return giver;
    }
  }
  return null;
}

function ensureUpcoming(state: GameState): boolean {
  if (state.mode === "cooperative") {
    const roster = coopRoster(state);
    if (roster.length === 0) {
      state.upcomingGiverId = null;
      return false;
    }
    if (!roster.some((player) => player.id === state.upcomingGiverId)) {
      state.upcomingGiverId = roster[0]!.id;
    }
    return true;
  }
  if (state.upcomingGiverId) {
    const player = playerById(state, state.upcomingGiverId);
    if (player?.connected && player.teamId) return true;
  }
  const total = state.teams.length;
  for (let step = 0; step < total; step += 1) {
    const index = (state.teamCursor + step) % total;
    const team = state.teams[index];
    if (!team) continue;
    const giver = giverForCurrentIndex(state, team.id);
    if (giver) {
      state.teamCursor = index;
      state.upcomingGiverId = giver;
      return true;
    }
  }
  state.upcomingGiverId = null;
  return false;
}

function giverForCurrentIndex(state: GameState, teamId: string): string | null {
  const members = connectedOnTeam(state, teamId);
  if (members.length === 0) return null;
  const index = (state.giverIndex[teamId] ?? 0) % members.length;
  return members[index]!.id;
}

function queueAdvance(state: GameState, now: number) {
  if (!state.upcomingGiverId) {
    state.autoAdvanceAt = null;
    return;
  }
  if (teamNeedsGuesser(state) && !state.allowThin) {
    state.autoAdvanceAt = null;
    return;
  }
  state.autoAdvanceAt = now + BETWEEN_MS;
}

function teamNeedsGuesser(state: GameState): boolean {
  if (state.mode !== "competitive") return false;
  if (!state.upcomingGiverId) return false;
  const giver = playerById(state, state.upcomingGiverId);
  if (!giver?.teamId) return true;
  const others = connectedOnTeam(state, giver.teamId).filter((player) => player.id !== giver.id);
  return others.length < 1;
}

function competitiveRosterProblem(state: GameState): string | null {
  const active = state.teams.filter((team) => connectedOnTeam(state, team.id).length > 0);
  if (active.length < 2) return "errors.needTeams";
  if (active.some((team) => connectedOnTeam(state, team.id).length < 2)) return "errors.teamTooSmall";
  return null;
}

function seatUnassigned(state: GameState) {
  const pending = state.players.filter((player) => player.connected && !player.teamId);
  for (const player of pending) {
    const smallest = [...state.teams].sort((a, b) => {
      const diff = connectedOnTeam(state, a.id).length - connectedOnTeam(state, b.id).length;
      return diff || a.id.localeCompare(b.id);
    })[0];
    if (!smallest) break;
    player.teamId = smallest.id;
    syncTeamRosters(state);
  }
}

function markWordShown(state: GameState, cardId: string | undefined) {
  if (!cardId || !state.turn) return;
  markSeen(state, state.turn.clueGiverId, cardId);
  if (!state.settings.opponentsSeeFullCard || state.mode !== "competitive") return;
  const giver = playerById(state, state.turn.clueGiverId);
  for (const player of state.players) {
    if (!player.teamId || player.teamId === giver?.teamId) continue;
    markSeen(state, player.id, cardId);
  }
}

function markSeen(state: GameState, playerId: string, cardId: string) {
  const list = state.seenWordByPlayer[playerId] ?? [];
  if (list.includes(cardId)) return;
  state.seenWordByPlayer[playerId] = [...list, cardId];
}

function cardViewFor(state: GameState, playerId: string, cardsById: Record<string, Card>): PlayerView["card"] {
  if (state.phase === "reveal" && state.reveal) {
    const card = cardsById[state.reveal.cardId];
    if (!card) return { kind: "none" };
    return { kind: "reveal", word: card.word, forbidden: card.forbidden.slice() };
  }
  const show = ACTIVE_CARD_PHASES.includes(state.phase) && Boolean(state.turn?.cardLive);
  if (!show || state.pile.length === 0) return { kind: "none" };
  const card = cardsById[state.pile[0]!];
  if (!card) return { kind: "none" };
  const role = roleFor(state, playerId);
  if (role === "clue-giver") return { kind: "full", word: card.word, forbidden: card.forbidden.slice() };
  if (role === "opponent" && state.settings.opponentsSeeFullCard) {
    return { kind: "full", word: card.word, forbidden: card.forbidden.slice() };
  }
  if (role === "opponent") return { kind: "forbidden", forbidden: card.forbidden.slice() };
  return { kind: "hidden" };
}

function remainingMs(state: GameState, now: number): number {
  if (!state.turn) return state.settings.turnSeconds * 1000;
  if (state.turn.endsAt !== null && !state.turn.reconnectDeadline) {
    return Math.max(0, state.turn.endsAt - now);
  }
  return state.turn.remainingMs;
}

function canAdvance(state: GameState, playerId: string): boolean {
  if (state.phase !== "round_intro" && state.phase !== "between_turns") return false;
  if (!playerById(state, playerId)?.connected) return false;
  if (teamNeedsGuesser(state) && !state.allowThin) return false;
  return true;
}

function coopRoster(state: GameState): Player[] {
  return state.players
    .filter((player) => player.connected)
    .slice()
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
}

function connectedOnTeam(state: GameState, teamId: string): Player[] {
  const team = teamById(state, teamId);
  if (!team) return [];
  return team.playerIds
    .map((id) => playerById(state, id))
    .filter((player): player is Player => Boolean(player?.connected));
}

function ensureTeams(state: GameState) {
  const presets = TEAM_PRESETS.slice(0, state.settings.teamCount);
  const valid = new Set(presets.map((preset) => preset.id));
  for (const player of state.players) {
    if (player.teamId && !valid.has(player.teamId)) player.teamId = null;
  }
  state.teams = presets.map((preset) => {
    const existing = state.teams.find((team) => team.id === preset.id);
    return {
      id: preset.id,
      color: preset.color,
      nameKey: preset.nameKey,
      score: existing?.score ?? 0,
      strikes: existing?.strikes ?? 0,
      timeSpentMs: existing?.timeSpentMs ?? 0,
      playerIds: [],
    } satisfies Team;
  });
  syncTeamRosters(state);
}

function syncTeamRosters(state: GameState) {
  for (const team of state.teams) {
    const previous = team.playerIds.filter((id) => playerById(state, id)?.teamId === team.id);
    const have = new Set(previous);
    for (const player of state.players) {
      if (player.teamId === team.id && !have.has(player.id)) previous.push(player.id);
    }
    team.playerIds = previous;
  }
}

function toPublicPlayer(state: GameState, player: Player): PublicPlayer {
  return {
    id: player.id,
    nickname: player.nickname,
    teamId: player.teamId,
    connected: player.connected,
    isHost: player.id === state.hostId,
  };
}

function playerById(state: GameState, id: string): Player | undefined {
  return state.players.find((player) => player.id === id);
}

function teamById(state: GameState, id: string): Team | undefined {
  return state.teams.find((team) => team.id === id);
}

function isHost(state: GameState, playerId: string): boolean {
  return state.hostId === playerId;
}

function cleanNickname(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function foldName(value: string): string {
  return cleanNickname(value).toLocaleLowerCase();
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function touch(state: GameState, now: number) {
  state.lastActivityAt = now;
}

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function ok(state: GameState, events: EngineEvent[] = []): StepResult {
  return { state, events };
}

function fail(state: GameState, error: string): StepResult {
  return { state, events: [], error };
}
