import type { PlayerView } from "@shared/types";
import { useI18n } from "../i18n";
import type { MessageKey } from "../locales/en";
import { formatClock } from "../lib/utils";
import { BonkButton } from "../components/BonkButton";
import { ScoreStrip } from "../components/ScoreStrip";
import { TimerReadout, useRemaining } from "../components/TimerReadout";
import { Button } from "../components/ui/button";
import { WordCard } from "../components/WordCard";

export function MatchScreen({ view, onAction }: { view: PlayerView; onAction: (action: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  const roleKey =
    view.you.role === "clue-giver"
      ? "turn.clue"
      : view.you.role === "guesser"
        ? "turn.guess"
        : view.you.role === "opponent"
          ? "turn.watch"
          : "turn.wait";

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-white/50">{t("hud.round", { round: view.round })}</p>
          <p className="font-display text-xl">
          {view.phase === "round_intro"
            ? t(view.round === 1 ? "round.freeTitle" : "round.oneTitle")
            : view.phase === "between_turns" || view.phase === "finished"
              ? t(view.phase === "finished" ? "end.kicker" : "score.title")
              : t(roleKey)}
        </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-extrabold uppercase tracking-wide text-white/50">{t("turn.left")}</p>
          <p className="font-display text-3xl leading-none">{view.cardsLeft}</p>
        </div>
      </header>
      <ScoreStrip view={view} />
      {view.phase === "round_intro" ? <RoundIntro view={view} onAction={onAction} /> : null}
      {view.phase === "between_turns" ? <Between view={view} onAction={onAction} /> : null}
      {view.phase === "finished" ? <Finished view={view} onAction={onAction} /> : null}
      {view.phase === "turn_ready" || view.phase === "turn" || view.phase === "reveal" || view.phase === "contest" ? (
        <LiveTurn view={view} onAction={onAction} />
      ) : null}
    </section>
  );
}

function RoundIntro({ view, onAction }: { view: PlayerView; onAction: (action: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  const free = view.round === 1;
  return (
    <div className="paper flex flex-1 flex-col gap-4 p-5 text-[var(--ink)]">
      <p className="text-sm font-extrabold uppercase tracking-wide text-[#8a4b16]">{t("round.kicker", { round: view.round })}</p>
      <h2 className="font-display text-5xl leading-none">{t(free ? "round.freeTitle" : "round.oneTitle")}</h2>
      <p className="text-lg font-bold leading-snug">{t(free ? "round.freeBody" : "round.oneBody")}</p>
      {view.shortDeck ? <p className="text-sm font-semibold">{t("round.short", { count: view.matchSize })}</p> : null}
      {view.upcomingGiverName ? <p className="font-extrabold">{t("round.starts", { name: view.upcomingGiverName })}</p> : null}
      {view.you.canAdvance ? (
        <Button size="xl" className="mt-auto" onClick={() => void onAction({ type: "advance" })}>
          {t("round.go")}
        </Button>
      ) : null}
    </div>
  );
}

function LiveTurn({ view, onAction }: { view: PlayerView; onAction: (action: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  const contestLeft = useContestSeconds(view);
  const paused = view.phase === "reveal" || view.phase === "contest" || Boolean(view.turn?.reconnecting);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-3xl bg-black/20 px-3 py-2">
        <p className="text-center text-xs font-extrabold uppercase tracking-widest text-[var(--mango)]">
          {view.round === 1 ? t("turn.free") : t("turn.oneWord")}
        </p>
        <TimerReadout timer={view.timer} paused={paused} />
      </div>
      {view.turn?.reconnecting ? (
        <p className="rounded-2xl bg-[#ffb000] px-3 py-2 text-center text-sm font-extrabold text-[var(--ink)]">
          {t("turn.reconnecting", { name: view.turn.clueGiverName })}
        </p>
      ) : null}
      {view.phase === "reveal" && view.card.kind === "reveal" ? (
        <div className="paper p-5 text-center text-[var(--ink)]">
          <p className="text-sm font-extrabold uppercase tracking-wide">{t("turn.reveal")}</p>
          <p className="font-display text-5xl leading-none">{view.card.word}</p>
        </div>
      ) : null}
      {view.phase !== "reveal" && view.you.role === "clue-giver" ? (
        <>
          {view.phase === "turn_ready" ? (
            <div className="paper flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-[var(--ink)]">
              <h2 className="font-display text-4xl">{t("ready.you")}</h2>
              <p className="font-bold">{t("turn.hold")}</p>
              <Button size="xl" disabled={!view.you.canStartTurn} onClick={() => void onAction({ type: "begin-turn" })}>
                {t("ready.start")}
              </Button>
            </div>
          ) : (
            <>
              <WordCard card={view.card} kicker={view.round === 2 ? t("turn.oneWord") : undefined} />
              {view.phase === "contest" && view.you.canContest ? (
                <div className="contest-layer paper flex flex-col gap-3 p-4 text-[var(--ink)]">
                  <p className="text-center text-lg font-extrabold">
                    {t("turn.contest")} {contestLeft}s
                  </p>
                  <Button size="lg" variant="destructive" onClick={() => void onAction({ type: "accept-bonk" })}>
                    {t("turn.fair")}
                  </Button>
                  <Button size="lg" onClick={() => void onAction({ type: "contest" })}>
                    {t("turn.fight")}
                  </Button>
                </div>
              ) : (
                <>
                  <Button size="xl" disabled={!view.you.canGotIt} onClick={() => void onAction({ type: "got-it" })}>
                    {t("turn.gotIt")}
                  </Button>
                  <Button variant="outline" disabled={!view.you.canSelfBonk} onClick={() => void onAction({ type: "self-bonk" })}>
                    {t("turn.self")}
                  </Button>
                </>
              )}
            </>
          )}
        </>
      ) : null}
      {view.phase !== "reveal" && view.you.role === "guesser" ? (
        <div className="flex flex-1 flex-col justify-center gap-4 text-center">
          {view.phase === "turn_ready" ? (
            <h2 className="font-display text-4xl">{t("ready.wait", { name: view.turn?.clueGiverName ?? "" })}</h2>
          ) : (
            <h2 className="font-display text-4xl leading-none">{t("turn.shout")}</h2>
          )}
          {view.you.canBonk ? <BonkButton onClick={() => void onAction({ type: "bonk" })} /> : null}
        </div>
      ) : null}
      {view.phase !== "reveal" && view.you.role === "opponent" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {view.phase === "turn_ready" ? (
            <h2 className="text-center font-display text-4xl">{t("ready.wait", { name: view.turn?.clueGiverName ?? "" })}</h2>
          ) : (
            <>
              <p className="text-center text-sm font-bold text-white/70">{t("turn.listen")}</p>
              <WordCard card={view.card} />
              <BonkButton disabled={!view.you.canBonk} onClick={() => void onAction({ type: "bonk" })} />
            </>
          )}
        </div>
      ) : null}
      {view.phase !== "reveal" && view.you.role === "waiting" ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <h2 className="font-display text-4xl">{view.phase === "turn_ready" ? t("ready.wait", { name: view.turn?.clueGiverName ?? "" }) : t("turn.wait")}</h2>
        </div>
      ) : null}
      {view.phase === "contest" && !view.you.canContest ? <p className="text-center font-extrabold">{t("turn.holding")}</p> : null}
      {view.you.isHost && view.phase === "turn_ready" ? (
        <Button variant="ghost" onClick={() => void onAction({ type: "skip-ready" })}>
          {t("ready.skip")}
        </Button>
      ) : null}
    </div>
  );
}

function Between({ view, onAction }: { view: PlayerView; onAction: (action: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <div className="paper flex flex-1 flex-col gap-4 p-5 text-[var(--ink)]">
      <h2 className="font-display text-4xl">{t("score.title")}</h2>
      {view.lastTurn ? (
        <p className="text-lg font-extrabold">
          {view.lastTurn.got > 0
            ? t("score.got", { name: view.lastTurn.name, count: view.lastTurn.got })
            : t("score.pass")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {view.mode === "cooperative" && view.coop ? (
          <li className="font-bold">{t("score.time", { time: formatClock(view.coop.timeSpentMs) })}</li>
        ) : (
          view.teams.map((team) => (
            <li key={team.id} className="flex items-center justify-between font-bold">
              <span>{t(team.nameKey as MessageKey)}</span>
              <span>{t("score.time", { time: formatClock(team.timeSpentMs) })}</span>
            </li>
          ))
        )}
      </ul>
      {view.upcomingGiverName ? <p className="font-extrabold">{t("score.up", { name: view.upcomingGiverName })}</p> : null}
      {view.needsGuesser ? <p className="font-bold">{t("score.need", { name: view.upcomingGiverName ?? "" })}</p> : null}
      {view.needsGuesser && view.you.isHost ? (
        <Button size="lg" variant="secondary" onClick={() => void onAction({ type: "play-anyway" })}>
          {t("score.anyway")}
        </Button>
      ) : null}
      {view.you.canAdvance ? (
        <Button size="xl" className="mt-auto" onClick={() => void onAction({ type: "advance" })}>
          {t("score.next")}
        </Button>
      ) : null}
    </div>
  );
}

function Finished({ view, onAction }: { view: PlayerView; onAction: (action: Record<string, unknown>) => Promise<void> }) {
  const { t } = useI18n();
  const winner = view.teams.find((team) => team.id === view.winnerTeamId);
  const eliminated = view.teams.find((team) => team.id === view.eliminatedTeamId);
  const winnerName = winner ? t(winner.nameKey as MessageKey) : "";
  const eliminatedName = eliminated ? t(eliminated.nameKey as MessageKey) : "";
  const record =
    view.mode === "cooperative" &&
    view.coop &&
    (view.bestScore == null || view.coop.score > view.bestScore);
  return (
    <div className="paper flex flex-1 flex-col gap-4 p-5 text-[var(--ink)]">
      <p className="text-sm font-extrabold uppercase tracking-wide text-[#8a4b16]">{t("end.kicker")}</p>
      {view.mode === "cooperative" && view.coop ? (
        <>
          <h2 className="font-display text-5xl leading-none">{t("end.coop", { score: view.coop.score })}</h2>
          {record ? <p className="font-display text-2xl text-[#a86b00]">{t("end.record")}</p> : null}
          {view.bestScore != null ? <p className="font-bold">{t("end.best", { score: view.bestScore })}</p> : <p className="font-bold">{t("end.none")}</p>}
        </>
      ) : (
        <>
          <h2 className="font-display text-5xl leading-none">
            {view.winnerTeamId === "tie" ? t("end.tie") : t("end.win", { name: winnerName })}
          </h2>
          {view.finishedReason === "strikes" ? <p className="text-lg font-extrabold">{t("end.strikes", { name: eliminatedName })}</p> : null}
        </>
      )}
      {view.you.isHost ? (
        <Button size="xl" className="mt-auto" onClick={() => void onAction({ type: "back-to-lobby" })}>
          {t("end.lobby")}
        </Button>
      ) : (
        <p className="mt-auto text-center font-bold">{t("end.waitHost")}</p>
      )}
    </div>
  );
}

function useContestSeconds(view: PlayerView): number {
  const remaining = useRemaining({
    serverNow: view.timer.serverNow,
    endsAt: view.contest?.until ?? null,
    remainingMs: view.contest ? Math.max(0, view.contest.until - view.timer.serverNow) : 0,
    running: Boolean(view.contest),
    durationMs: (view.settings.contestSeconds || 3) * 1000,
  });
  return Math.ceil(remaining / 1000);
}
