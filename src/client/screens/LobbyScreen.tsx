import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { resolveMode } from "@shared/engine";
import type { Catalog } from "@shared/catalog";
import type { PlayerView, RoomSettings } from "@shared/types";
import { useI18n } from "../i18n";
import type { MessageKey } from "../locales/en";
import { Button } from "../components/ui/button";
import { SetupFields } from "./SetupFields";

export function LobbyScreen({
  view,
  catalog,
  seen,
  onPatch,
  onAction,
}: {
  view: PlayerView;
  catalog: Catalog | null;
  seen: string[];
  onPatch: (patch: Partial<RoomSettings>) => Promise<void>;
  onAction: (action: Record<string, unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const connected = view.players.filter((player) => player.connected);
  const mode = resolveMode(view.settings.mode, connected.length);
  const link = `${location.origin}/?room=${view.code}`;

  useEffect(() => {
    let cancel = false;
    void QRCode.toDataURL(link, { margin: 1, width: 320, color: { dark: "#1a1333", light: "#fff6e8" } }).then((url) => {
      if (!cancel) setQr(url);
    });
    return () => {
      cancel = true;
    };
  }, [link]);

  return (
    <section className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-white/50">{t("lobby.scan")}</p>
        <p className="font-display text-6xl tracking-[0.18em]">{view.code}</p>
      </div>
      {qr ? (
        <img src={qr} alt={view.code} className="mx-auto w-52 rounded-2xl border-4 border-[var(--ink)] bg-[var(--cream)]" />
      ) : null}
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(link).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? t("lobby.copied") : t("lobby.copy")}
      </Button>

      <p className="text-center text-sm font-bold text-white/70">
        {t("lobby.modeLine", { mode: t(mode === "cooperative" ? "mode.cooperative" : "mode.competitive") })}
      </p>
      {mode === "cooperative" ? <p className="text-center text-sm text-white/70">{t("lobby.together")}</p> : null}

      {mode === "competitive" ? (
        <div className="flex flex-col gap-3">
          {view.teams.map((team) => {
            const members = view.players.filter((player) => player.teamId === team.id);
            const mine = view.you.teamId === team.id;
            return (
              <div key={team.id} className="rounded-3xl bg-white/10 p-3" style={{ boxShadow: `inset 0 0 0 2px ${team.color}` }}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-display text-2xl" style={{ color: team.color }}>
                    {t(team.nameKey as MessageKey)}
                  </span>
                  {!mine ? (
                    <Button size="sm" onClick={() => void onAction({ type: "claim-team", teamId: team.id })}>
                      {t("team.sit")}
                    </Button>
                  ) : (
                    <span className="text-xs font-extrabold uppercase">{t("lobby.you")}</span>
                  )}
                </div>
                <ul className="flex flex-col gap-2">
                  {members.map((player) => (
                    <li key={player.id} className="flex items-center justify-between gap-2 text-sm font-bold">
                      <span className={player.connected ? "" : "opacity-50"}>
                        {player.nickname}
                        {player.isHost ? ` · ${t("lobby.host")}` : ""}
                        {!player.connected ? ` · ${t("lobby.offline")}` : ""}
                      </span>
                      {view.you.isHost ? (
                        <span className="flex gap-1">
                          {view.teams.map((target) => (
                            <button
                              key={target.id}
                              type="button"
                              aria-label={t(target.nameKey as MessageKey)}
                              className="h-7 w-7 rounded-full border-2 border-white/40"
                              style={{ background: target.color, outline: player.teamId === target.id ? "2px solid white" : undefined }}
                              onClick={() => void onAction({ type: "move-player", targetId: player.id, teamId: target.id })}
                            />
                          ))}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {view.players.some((player) => !player.teamId) ? (
            <ul className="flex flex-col gap-2">
              {view.players
                .filter((player) => !player.teamId)
                .map((player) => (
                  <li key={player.id} className="flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold">
                    <span>{player.nickname}</span>
                    {view.you.isHost ? (
                      <span className="flex gap-1">
                        {view.teams.map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            aria-label={t(target.nameKey as MessageKey)}
                            className="h-7 w-7 rounded-full border-2 border-white/40"
                            style={{ background: target.color }}
                            onClick={() => void onAction({ type: "move-player", targetId: player.id, teamId: target.id })}
                          />
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
            </ul>
          ) : null}
          {view.you.isHost ? (
            <Button variant="secondary" onClick={() => void onAction({ type: "shuffle-teams" })}>
              {t("lobby.shuffle")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.players.map((player) => (
            <li key={player.id} className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 font-extrabold">
              <span>
                {player.nickname}
                {player.id === view.you.id ? ` · ${t("lobby.you")}` : ""}
              </span>
              <span className="text-xs uppercase text-white/50">{player.isHost ? t("lobby.host") : player.connected ? "" : t("lobby.offline")}</span>
            </li>
          ))}
        </ul>
      )}

      {view.players.length < 2 ? <p className="text-center text-sm text-white/70">{t("lobby.empty")}</p> : null}

      {view.you.isHost ? (
        <>
          <Button size="xl" onClick={() => void onAction({ type: "start" })}>
            {t("lobby.start")}
          </Button>
          <button type="button" className="text-sm font-extrabold text-white/70" onClick={() => setEditing((value) => !value)}>
            {t("lobby.edit")}
          </button>
          {editing ? (
            <SetupFields
              settings={view.settings}
              catalog={catalog}
              seen={seen}
              groupSeen={view.groupSeenIds}
              playerCount={connected.length}
              onChange={(patch) => void onPatch(patch)}
            />
          ) : null}
        </>
      ) : (
        <p className="text-center text-sm font-bold text-white/70">{t("end.waitHost")}</p>
      )}

      <Button variant="ghost" onClick={() => void onAction({ type: "leave" })}>
        {t("lobby.leave")}
      </Button>
    </section>
  );
}
