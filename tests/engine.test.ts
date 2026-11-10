import { describe, expect, it } from "vitest";
import { COOP_STRIKE_PENALTY, REVEAL_MS, STRIKE_LIMIT } from "../src/shared/config";
import {
  buildMatchDeck,
  createRoom,
  mulberry32,
  parkFront,
  projectView,
  resolveMode,
  roleFor,
  shuffle,
  step,
  suggestMode,
  type EngineAction,
} from "../src/shared/engine";
import type { Card, GameState } from "../src/shared/types";

function cards(ids: string[], wordFor?: (id: string) => string): Card[] {
  return ids.map((id) => ({
    id,
    word: wordFor ? wordFor(id) : `Word ${id}`,
    forbidden: ["alpha", "bravo", "charlie", "delta", "echo"].map((piece, index) => `${piece}-${id}-${index}`),
    difficulty: "easy" as const,
    themeId: "demo",
    deckId: "demo-1",
  }));
}

function byId(list: Card[]): Record<string, Card> {
  return Object.fromEntries(list.map((card) => [card.id, card]));
}

function act(state: GameState, action: EngineAction): GameState {
  const result = step(state, action);
  expect(result.error, result.error).toBeUndefined();
  return result.state;
}

function nick(index: number): string {
  return ["Ana", "Beto", "Caio", "Duda", "Enzo", "Fabi"][index] ?? `P${index}`;
}

function roomWith(count: number, settings?: Parameters<typeof createRoom>[0]["settings"]): GameState {
  let state = createRoom({
    code: "PLAY",
    host: { id: "p0", nickname: nick(0) },
    now: 0,
    settings,
  });
  for (let index = 1; index < count; index += 1) {
    state = act(state, { type: "join", player: { id: `p${index}`, nickname: nick(index), joinedAt: index }, now: index });
  }
  return state;
}

function seatEven(state: GameState): GameState {
  return act(state, { type: "shuffle-teams", playerId: "p0", seed: 7, now: 10 });
}

function startOf(state: GameState, pool: Card[], seed = 99): GameState {
  return act(state, { type: "start", playerId: "p0", now: 100, seed, pool });
}

describe("mode suggestion", () => {
  it("suggests cooperative for 2–3 and competitive from 4, unless the host overrides", () => {
    expect(suggestMode(2)).toBe("cooperative");
    expect(suggestMode(3)).toBe("cooperative");
    expect(suggestMode(4)).toBe("competitive");
    expect(resolveMode("auto", 2)).toBe("cooperative");
    expect(resolveMode("auto", 8)).toBe("competitive");
    expect(resolveMode("cooperative", 8)).toBe("cooperative");
    expect(resolveMode("competitive", 6)).toBe("competitive");
  });
});

describe("deck building", () => {
  it("prefers unseen cards and never repeats an id inside the match deck", () => {
    const pool = cards(["a", "b", "c", "d"]);
    const built = buildMatchDeck(pool, new Set(["c", "d"]), 2, mulberry32(1));
    expect(new Set(built.ids)).toEqual(new Set(["a", "b"]));
    expect(built.short).toBe(false);

    const onlyUnseen = buildMatchDeck(pool, new Set(["a"]), 3, mulberry32(2));
    expect(new Set(onlyUnseen.ids)).toEqual(new Set(["b", "c", "d"]));
    const mixed = buildMatchDeck(pool, new Set(["a"]), 4, mulberry32(4));
    expect(mixed.ids).toHaveLength(4);
    expect(new Set(mixed.ids).size).toBe(4);
    expect(mixed.ids).toContain("a");

    const all = buildMatchDeck(pool, new Set(), 10, mulberry32(3));
    expect(all.ids).toHaveLength(4);
    expect(all.short).toBe(true);
    expect(new Set(all.ids).size).toBe(4);
  });

  it("parks the current card at the end of the shared queue", () => {
    expect(parkFront(["a", "b", "c", "d"])).toEqual(["b", "c", "d", "a"]);
    expect(parkFront(["only"])).toEqual(["only"]);
  });
});

describe("cooperative play", () => {
  const pool = cards(["a", "b", "c", "d"], (id) => (id === "a" ? "Pineapple" : `Word ${id}`));

  function started(): GameState {
    const seated = roomWith(3, { mode: "cooperative", deckId: "demo-1", cardCount: 4, turnSeconds: 60 });
    return startOf(seated, pool, 11);
  }

  it("rotates clue-givers and treats everyone else as a guesser who may bonk", () => {
    let state = started();
    expect(state.mode).toBe("cooperative");
    expect(state.phase).toBe("round_intro");
    expect(state.upcomingGiverId).toBe("p0");
    state = act(state, { type: "advance", playerId: "p1", now: 110 });
    expect(state.phase).toBe("turn_ready");
    expect(roleFor(state, "p0")).toBe("clue-giver");
    expect(roleFor(state, "p1")).toBe("guesser");
    expect(roleFor(state, "p2")).toBe("guesser");

    state = act(state, { type: "begin-turn", playerId: "p0", now: 120 });
    const viewGiver = projectView(state, "p0", byId(pool), 120);
    const viewGuesser = projectView(state, "p1", byId(pool), 120);
    expect(viewGiver.card.kind).toBe("full");
    expect(viewGuesser.card.kind).toBe("hidden");
    expect(viewGuesser.you.canBonk).toBe(true);
    expect(viewGiver.you.canSelfBonk).toBe(true);
    expect(JSON.stringify(viewGuesser)).not.toContain("Pineapple");

    state = act(state, { type: "got-it", playerId: "p0", now: 200 });
    expect(state.coopScore).toBe(1);
    expect(state.pile).not.toContain(state.reveal?.cardId);
    const revealed = projectView(state, "p1", byId(pool), 200);
    expect(revealed.card.kind).toBe("reveal");
    expect(revealed.cardsLeft).toBe(state.pile.length);

    state = act(state, { type: "tick", now: 200 + REVEAL_MS });
    expect(state.phase).toBe("turn");
    expect(state.turn?.clueGiverId).toBe("p0");
  });

  it("keeps one shared queue: a guess removes the card, a timeout or bonk sends it to the end", () => {
    let state = started();
    state = act(state, { type: "advance", playerId: "p0", now: 110 });
    state = act(state, { type: "begin-turn", playerId: "p0", now: 1_000 });
    const first = state.pile[0]!;
    const rest = state.pile.slice(1);
    state = act(state, { type: "got-it", playerId: "p0", now: 2_000 });
    expect(state.pile).toEqual(rest);
    expect(state.reveal?.cardId).toBe(first);
    state = act(state, { type: "tick", now: 2_000 + REVEAL_MS });
    expect(state.turn?.clueGiverId).toBe("p0");
    expect(state.pile[0]).toBe(rest[0]);

    const beforeTimeout = state.pile.slice();
    const endsAt = state.turn!.endsAt!;
    state = act(state, { type: "tick", now: endsAt });
    expect(state.phase).toBe("between_turns");
    expect(state.pile).toEqual(parkFront(beforeTimeout));
    expect(state.coopScore).toBe(1);
    expect(state.upcomingGiverId).toBe("p1");
    expect(state.coopTimeMs).toBe(60_000);

    state = act(state, { type: "advance", playerId: "p1", now: endsAt + 10 });
    state = act(state, { type: "begin-turn", playerId: "p1", now: endsAt + 20 });
    const bonkPile = state.pile.slice();
    const bonk = step(state, { type: "bonk", playerId: "p2", now: endsAt + 500 });
    expect(bonk.events.some((event) => event.type === "fx" && event.fx === "bonk")).toBe(true);
    state = bonk.state;
    expect(state.phase).toBe("contest");
    const again = step(state, { type: "bonk", playerId: "p0", now: endsAt + 600 });
    expect(again.error).toBe("errors.badPhase");
    expect(again.state.coopStrikes).toBe(0);

    state = act(state, { type: "tick", now: state.contest!.until });
    expect(state.coopStrikes).toBe(1);
    expect(state.coopScore).toBe(Math.max(0, 1 - COOP_STRIKE_PENALTY));
    expect(state.pile).toEqual(parkFront(bonkPile));
    expect(state.phase).toBe("between_turns");
    expect(state.finishedReason).toBeNull();
  });

  it("does not end the match at three strikes and still costs a point each time", () => {
    let state = started();
    for (let strike = 0; strike < 4; strike += 1) {
      const giver = state.upcomingGiverId!;
      state = act(state, { type: "advance", playerId: giver, now: 200 + strike * 1000 });
      state = act(state, { type: "begin-turn", playerId: giver, now: 210 + strike * 1000 });
      state = act(state, { type: "self-bonk", playerId: giver, now: 220 + strike * 1000 });
      expect(state.phase).not.toBe("finished");
    }
    expect(state.coopStrikes).toBe(4);
    expect(state.coopScore).toBe(0);
  });

  it("plays both rounds over the same cards and reshuffles every card into round 2", () => {
    let state = started();
    const match = state.matchCardIds.slice();
    const seen = new Set<string>();
    let guard = 0;
    while (state.phase !== "finished" && guard < 30) {
      guard += 1;
      if (state.phase === "round_intro" || state.phase === "between_turns") {
        state = act(state, { type: "advance", playerId: "p0", now: 1_000 + guard });
      } else if (state.phase === "turn_ready") {
        state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now: 1_000 + guard });
      } else if (state.phase === "turn") {
        seen.add(state.pile[0]!);
        state = act(state, { type: "got-it", playerId: state.turn!.clueGiverId, now: 1_000 + guard });
      } else if (state.phase === "reveal") {
        const roundBefore = state.round;
        state = act(state, { type: "tick", now: state.reveal!.until });
        if (roundBefore === 1 && state.round === 2) {
          expect(state.pile.slice().sort()).toEqual(match.slice().sort());
          expect(state.pile).toEqual(shuffle(match, mulberry32(state.seed + 2)));
          expect(state.phase).toBe("round_intro");
        }
      }
    }
    expect(state.phase).toBe("finished");
    expect(state.finishedReason).toBe("completed");
    expect(state.round).toBe(2);
    expect(state.coopScore).toBe(match.length * 2);
    expect(seen).toEqual(new Set(match));
  });
});

describe("competitive play", () => {
  const pool = cards(["a", "b", "c", "d"], () => "Lantern");

  function started(settings?: Parameters<typeof createRoom>[0]["settings"]): GameState {
    let state = roomWith(4, { mode: "auto", deckId: "demo-1", cardCount: 4, turnSeconds: 60, ...settings });
    state = seatEven(state);
    state = startOf(state, pool, 21);
    return state;
  }

  it("assigns clue-giver, guessing teammate, and opponent, and hides the main word from opponents", () => {
    let state = started();
    state = act(state, { type: "advance", playerId: "p0", now: 200 });
    state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now: 300 });
    const giverId = state.turn!.clueGiverId;
    const giver = state.players.find((player) => player.id === giverId)!;
    const teammate = state.players.find((player) => player.teamId === giver.teamId && player.id !== giverId)!;
    const opponent = state.players.find((player) => player.teamId && player.teamId !== giver.teamId)!;

    expect(roleFor(state, giverId)).toBe("clue-giver");
    expect(roleFor(state, teammate.id)).toBe("guesser");
    expect(roleFor(state, opponent.id)).toBe("opponent");

    const giverView = projectView(state, giverId, byId(pool), 300);
    const guesserView = projectView(state, teammate.id, byId(pool), 300);
    const opponentView = projectView(state, opponent.id, byId(pool), 300);
    expect(giverView.card).toMatchObject({ kind: "full", word: "Lantern" });
    expect(guesserView.card).toEqual({ kind: "hidden" });
    expect(opponentView.card.kind).toBe("forbidden");
    expect(opponentView.you.canBonk).toBe(true);
    expect(guesserView.you.canBonk).toBe(false);
    expect(JSON.stringify(guesserView)).not.toContain("Lantern");
    expect(JSON.stringify(opponentView)).not.toContain("Lantern");
    expect(opponentView.cardsLeft).toBe(state.pile.length);
    expect(guesserView.cardsLeft).toBe(state.pile.length);
    expect("pile" in (opponentView as object)).toBe(false);

    const open = started({ opponentsSeeFullCard: true });
    let shown = act(open, { type: "advance", playerId: "p0", now: 200 });
    shown = act(shown, { type: "begin-turn", playerId: shown.turn!.clueGiverId, now: 300 });
    const rival = shown.players.find((player) => player.teamId && player.teamId !== shown.turn!.teamId)!;
    expect(projectView(shown, rival.id, byId(pool), 300).card).toMatchObject({ kind: "full", word: "Lantern" });
  });

  it("rotates turns across teams and clue-givers inside a team", () => {
    let state = roomWith(5, { mode: "competitive", deckId: "demo-1", cardCount: 4, teamCount: 2 });
    state = act(state, { type: "move-player", playerId: "p0", targetId: "p0", teamId: "t1", now: 1 });
    state = act(state, { type: "move-player", playerId: "p0", targetId: "p1", teamId: "t1", now: 2 });
    state = act(state, { type: "move-player", playerId: "p0", targetId: "p2", teamId: "t1", now: 3 });
    state = act(state, { type: "move-player", playerId: "p0", targetId: "p3", teamId: "t2", now: 4 });
    state = act(state, { type: "move-player", playerId: "p0", targetId: "p4", teamId: "t2", now: 5 });
    state = startOf(state, pool, 3);
    const order: string[] = [];
    let now = 500;
    for (let turn = 0; turn < 5; turn += 1) {
      state = act(state, { type: "advance", playerId: "p0", now });
      now += 10;
      state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now });
      order.push(state.turn!.clueGiverId);
      now += 10;
      state = act(state, { type: "tick", now: state.turn!.endsAt! });
      now = state.lastActivityAt + 20;
    }
    expect(order).toEqual(["p0", "p3", "p1", "p4", "p2"]);
  });

  it("lets the clue-giver contest a bonk, and a second press does not add another strike", () => {
    let state = started();
    state = act(state, { type: "advance", playerId: "p0", now: 200 });
    state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now: 1_000 });
    const pile = state.pile.slice();
    const giver = state.turn!.clueGiverId;
    const opponent = state.players.find((player) => player.teamId && player.teamId !== state.turn!.teamId)!;
    const otherOpponent = state.players.find(
      (player) => player.teamId && player.teamId !== state.turn!.teamId && player.id !== opponent.id,
    )!;
    state = act(state, { type: "bonk", playerId: opponent.id, now: 4_000 });
    const second = step(state, { type: "bonk", playerId: otherOpponent.id, now: 4_100 });
    expect(second.error).toBeTruthy();
    expect(second.state.teams.every((team) => team.strikes === 0)).toBe(true);
    state = act(state, { type: "contest", playerId: giver, now: 5_000 });
    expect(state.phase).toBe("turn");
    expect(state.pile).toEqual(pile);
    expect(state.turn?.clueGiverId).toBe(giver);
    expect(state.teams.every((team) => team.strikes === 0)).toBe(true);
    expect(state.turn?.endsAt).toBe(62_000);
  });

  it("ends the match when a team takes a third strike", () => {
    let state = started();
    state = act(state, { type: "advance", playerId: "p0", now: 300 });
    const eliminated = state.turn!.teamId!;
    const passer = (current: GameState, now: number): GameState => {
      if (current.turn!.teamId === eliminated) {
        return act(current, { type: "self-bonk", playerId: current.turn!.clueGiverId, now });
      }
      return act(current, { type: "tick", now: current.turn!.endsAt! });
    };
    let now = 1_000;
    let strikes = 0;
    while (strikes < STRIKE_LIMIT) {
      if (state.phase === "round_intro" || state.phase === "between_turns") {
        state = act(state, { type: "advance", playerId: "p0", now });
      } else if (state.phase === "turn_ready") {
        state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now });
      } else if (state.phase === "turn") {
        const before = state.teams.find((team) => team.id === eliminated)!.strikes;
        state = passer(state, now);
        const after = state.teams.find((team) => team.id === eliminated)?.strikes ?? before;
        if (after > before) strikes = after;
      }
      now += 70_000;
      if (now > 1_000_000) break;
    }
    expect(state.phase).toBe("finished");
    expect(state.finishedReason).toBe("strikes");
    expect(state.eliminatedTeamId).toBe(eliminated);
    expect(state.winnerTeamId).not.toBe(eliminated);
  });

  it("returns an unfinished card to the end, then clears the round only when every card is guessed", () => {
    let state = started();
    state = act(state, { type: "advance", playerId: "p0", now: 200 });
    state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now: 1_000 });
    const queued = state.pile.slice();
    state = act(state, { type: "tick", now: state.turn!.endsAt! });
    expect(state.pile).toEqual(parkFront(queued));
    expect(state.teams.every((team) => team.score === 0)).toBe(true);
    const time = state.teams.reduce((sum, team) => sum + team.timeSpentMs, 0);
    expect(time).toBe(60_000);

    const match = state.matchCardIds.slice();
    let guard = 0;
    let sawRound2 = false;
    while (state.phase !== "finished" && guard < 40) {
      guard += 1;
      const now = 10_000 + guard * 50;
      if (state.phase === "round_intro" || state.phase === "between_turns") {
        state = act(state, { type: "advance", playerId: "p0", now });
      } else if (state.phase === "turn_ready") {
        state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now });
      } else if (state.phase === "turn") {
        state = act(state, { type: "got-it", playerId: state.turn!.clueGiverId, now });
      } else if (state.phase === "reveal") {
        state = act(state, { type: "tick", now: state.reveal!.until });
        if (state.round === 2 && state.phase === "round_intro") {
          sawRound2 = true;
          expect(state.pile.slice().sort()).toEqual(match.slice().sort());
        }
      }
    }
    expect(sawRound2).toBe(true);
    expect(state.finishedReason).toBe("completed");
    const total = state.teams.reduce((sum, team) => sum + team.score, 0);
    expect(total).toBe(match.length * 2);
  });

  it("seats a player who joins mid-match only between turns", () => {
    let state = started();
    state = act(state, { type: "advance", playerId: "p0", now: 200 });
    state = act(state, { type: "begin-turn", playerId: state.turn!.clueGiverId, now: 300 });
    const giver = state.turn!.clueGiverId;
    state = act(state, { type: "join", player: { id: "p9", nickname: "Gabi", joinedAt: 9 }, now: 350 });
    expect(state.turn?.clueGiverId).toBe(giver);
    expect(roleFor(state, "p9")).toBe("waiting");
    expect(projectView(state, "p9", byId(pool), 350).card.kind).toBe("hidden");
    state = act(state, { type: "tick", now: state.turn!.endsAt! });
    const newbie = state.players.find((player) => player.id === "p9")!;
    expect(newbie.teamId).toBeTruthy();
    const counts = state.teams.map((team) => team.playerIds.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
