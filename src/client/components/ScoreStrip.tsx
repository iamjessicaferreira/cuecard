import type { PlayerView } from "@shared/types";
import { useI18n } from "../i18n";
import type { MessageKey } from "../locales/en";
import { StrikePips } from "./StrikePips";

export function ScoreStrip({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  if (view.mode === "cooperative" && view.coop) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-wide text-white/60">{t("team.together")}</div>
          <div className="font-display text-3xl leading-none">{view.coop.score}</div>
        </div>
        <StrikePips count={view.coop.strikes} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {view.teams.map((team) => (
        <div key={team.id} className="rounded-2xl bg-white/10 px-3 py-2" style={{ boxShadow: `inset 4px 0 0 ${team.color}` }}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-extrabold uppercase tracking-wide">{t(team.nameKey as MessageKey)}</span>
            <span className="font-display text-2xl leading-none">{team.score}</span>
          </div>
          <div className="mt-1">
            <StrikePips count={team.strikes} />
          </div>
        </div>
      ))}
    </div>
  );
}
