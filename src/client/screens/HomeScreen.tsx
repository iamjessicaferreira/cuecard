import { useState } from "react";
import { GAME_NAME } from "@shared/config";
import { defaultSettings } from "@shared/engine";
import type { Catalog } from "@shared/catalog";
import type { RoomSettings } from "@shared/types";
import { useI18n } from "../i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { SetupFields } from "./SetupFields";

export function HomeScreen({
  catalog,
  seen,
  roomCode,
  savedName,
  onCreate,
  onJoin,
  onRejoin,
}: {
  catalog: Catalog | null;
  seen: string[];
  roomCode: string;
  savedName: string | null;
  onCreate: (nickname: string, settings: RoomSettings) => Promise<void>;
  onJoin: (nickname: string, code: string) => Promise<void>;
  onRejoin: (() => void) | null;
}) {
  const { t, locale } = useI18n();
  const [pane, setPane] = useState<"home" | "create" | "join">(roomCode ? "join" : "home");
  const [name, setName] = useState(savedName ?? "");
  const [code, setCode] = useState(roomCode);
  const [settings, setSettings] = useState<RoomSettings>(() => defaultSettings({ cardLang: locale }));
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }

  if (pane === "create") {
    return (
      <section className="flex flex-col gap-4">
        <button type="button" className="w-fit text-sm font-extrabold text-white/70" onClick={() => setPane("home")}>
          ← {t("nav.back")}
        </button>
        <h1 className="font-display text-4xl">{t("setup.title")}</h1>
        <label className="flex flex-col gap-2 text-sm font-extrabold uppercase tracking-wide text-white/60">
          {t("setup.name")}
          <Input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} autoComplete="nickname" />
        </label>
        <SetupFields
          settings={settings}
          catalog={catalog}
          seen={seen}
          groupSeen={[]}
          playerCount={1}
          onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
        />
        <Button size="xl" disabled={busy || name.trim().length === 0} onClick={() => void run(() => onCreate(name.trim(), settings))}>
          {t("setup.open")}
        </Button>
      </section>
    );
  }

  if (pane === "join") {
    return (
      <section className="flex flex-col gap-4">
        <button type="button" className="w-fit text-sm font-extrabold text-white/70" onClick={() => setPane("home")}>
          ← {t("nav.back")}
        </button>
        <h1 className="font-display text-4xl">{t("join.title")}</h1>
        {onRejoin ? (
          <Button size="xl" onClick={onRejoin}>
            {t("home.rejoin", { name: savedName ?? "" })}
          </Button>
        ) : null}
        <label className="flex flex-col gap-2 text-sm font-extrabold uppercase tracking-wide text-white/60">
          {t("join.code")}
          <Input value={code} maxLength={6} autoCapitalize="characters" onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-extrabold uppercase tracking-wide text-white/60">
          {t("join.name")}
          <Input value={name} maxLength={16} onChange={(event) => setName(event.target.value)} autoComplete="nickname" />
        </label>
        <Button size="xl" disabled={busy || name.trim().length === 0 || code.trim().length < 4} onClick={() => void run(() => onJoin(name.trim(), code.trim()))}>
          {t("join.go")}
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-5">
      <div className="pt-6">
        <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[var(--mango)]">{GAME_NAME}</p>
        <h1 className="mt-2 font-display text-5xl leading-none">{t("app.tagline")}</h1>
      </div>
      <div className="mt-2 flex flex-col gap-3">
        {onRejoin ? (
          <Button size="xl" onClick={onRejoin}>
            {t("home.rejoin", { name: savedName ?? "" })}
          </Button>
        ) : null}
        <Button size="xl" onClick={() => setPane("create")}>
          {t("home.create")}
        </Button>
        <Button size="xl" variant="secondary" onClick={() => setPane("join")}>
          {t("home.join")}
        </Button>
      </div>
      <div className="paper mt-auto p-5 text-[var(--ink)]">
        <h2 className="font-display text-2xl">{t("home.howTitle")}</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-base font-bold">
          <li>{t("home.how1")}</li>
          <li>{t("home.how2")}</li>
          <li>{t("home.how3")}</li>
        </ol>
        <p className="mt-4 text-sm font-semibold text-[#5c4d3a]">{t("home.install")}</p>
      </div>
    </section>
  );
}
