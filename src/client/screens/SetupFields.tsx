import { resolveMode } from "@shared/engine";
import type { Catalog } from "@shared/catalog";
import type { RoomSettings } from "@shared/types";
import { useI18n } from "../i18n";
import type { MessageKey } from "../locales/en";
import { Badge } from "../components/ui/badge";

const COUNTS = [8, 15, 20, 30, 50];
const TIMES = [60, 90, 120] as const;

function deckMark(cardIds: string[], seen: Set<string>): "fresh" | "partial" | "played" {
  const hits = cardIds.filter((id) => seen.has(id)).length;
  if (hits === 0) return "fresh";
  if (hits >= cardIds.length) return "played";
  return "partial";
}

function Switch({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 rounded-2xl bg-white/10 px-4 py-3 text-left"
    >
      <span className="font-extrabold">{label}</span>
      <span className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--mango)]" : "bg-white/25"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}

export function SetupFields({
  settings,
  onChange,
  catalog,
  seen,
  groupSeen,
  playerCount,
  locked,
}: {
  settings: RoomSettings;
  onChange: (patch: Partial<RoomSettings>) => void;
  catalog: Catalog | null;
  seen: string[];
  groupSeen: string[];
  playerCount: number;
  locked?: boolean;
}) {
  const { t, locale } = useI18n();
  if (!catalog) return <p className="font-bold">{t("common.loading")}</p>;
  const seenSet = new Set(seen);
  const groupSet = new Set(groupSeen);
  const mode = resolveMode(settings.mode, Math.max(playerCount, 2));
  const themes = catalog?.themes ?? [];
  const decks = themes
    .filter((theme) => settings.themeIds.length === 0 || settings.themeIds.includes(theme.id))
    .flatMap((theme) => theme.decks.filter((deck) => deck.lang === settings.cardLang).map((deck) => ({ ...deck, themeId: theme.id })));
  const selectedDeck = decks.find((deck) => deck.id === settings.deckId);

  return (
    <div className={`flex flex-col gap-5 ${locked ? "pointer-events-none opacity-70" : ""}`}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.cardLang")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["pt-BR", "en"] as const).map((lang) => (
            <button key={lang} type="button" className="chip" aria-pressed={settings.cardLang === lang} onClick={() => onChange({ cardLang: lang, deckId: null })}>
              {lang === "pt-BR" ? "Português" : "English"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.themes")}</legend>
        <div className="flex flex-wrap gap-2">
          {themes.map((theme) => {
            const on = settings.themeIds.includes(theme.id);
            return (
              <button
                key={theme.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => {
                  const themeIds = on ? settings.themeIds.filter((id) => id !== theme.id) : [...settings.themeIds, theme.id];
                  const stillThere = decks.some((deck) => deck.id === settings.deckId && themeIds.includes(deck.themeId));
                  onChange({ themeIds, deckId: stillThere ? settings.deckId : null });
                }}
              >
                {theme.names[locale] ?? theme.names[settings.cardLang] ?? theme.id}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Switch label={t("setup.mix")} checked={settings.mix} onToggle={() => onChange({ mix: !settings.mix, deckId: null })} />
        <p className="text-sm text-white/70">{t("setup.mixHelp")}</p>
      </div>

      {settings.mix ? null : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.decks")}</legend>
          <div className="flex flex-col gap-2">
            {decks.map((deck) => {
              const mark = deckMark(deck.cardIds, seenSet);
              const groupPlayed = deck.cardIds.every((id) => groupSet.has(id)) && deck.cardIds.length > 0;
              return (
                <button
                  key={deck.id}
                  type="button"
                  aria-pressed={settings.deckId === deck.id}
                  className="chip h-auto flex-col items-start py-3 text-left"
                  onClick={() => onChange({ deckId: deck.id, themeIds: settings.themeIds.includes(deck.themeId) ? settings.themeIds : [...settings.themeIds, deck.themeId] })}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{deck.name}</span>
                    <Badge>{t(`deck.${mark}` as MessageKey)}</Badge>
                  </span>
                  <span className="text-xs font-semibold opacity-70">{deck.cardCount}</span>
                  {groupPlayed ? <span className="text-xs font-semibold">{t("deck.group")}</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.count")}</legend>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((count) => (
            <button key={count} type="button" className="chip" aria-pressed={settings.cardCount === count} onClick={() => onChange({ cardCount: count })}>
              {count}
            </button>
          ))}
        </div>
        {selectedDeck ? <p className="text-sm text-white/70">{t("setup.countHint", { count: selectedDeck.cardCount })}</p> : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.turn")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {TIMES.map((seconds) => (
            <button key={seconds} type="button" className="chip" aria-pressed={settings.turnSeconds === seconds} onClick={() => onChange({ turnSeconds: seconds })}>
              {seconds}s
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Switch label={t("setup.fullCard")} checked={settings.opponentsSeeFullCard} onToggle={() => onChange({ opponentsSeeFullCard: !settings.opponentsSeeFullCard })} />
        <p className="text-sm text-white/70">{t("setup.fullCardHelp")}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.mode")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["auto", "setup.modeAuto"],
              ["cooperative", "setup.modeCoop"],
              ["competitive", "setup.modeTeams"],
            ] as const
          ).map(([value, key]) => (
            <button key={value} type="button" className="chip" aria-pressed={settings.mode === value} onClick={() => onChange({ mode: value })}>
              {t(key)}
            </button>
          ))}
        </div>
        <p className="text-sm text-white/70">
          {t(settings.mode === "cooperative" ? "setup.modeCoopHelp" : settings.mode === "competitive" ? "setup.modeTeamsHelp" : "setup.modeAutoHelp")}
        </p>
        <p className="text-sm font-bold text-white/80">{t("setup.preview", { count: playerCount, mode: t(mode === "cooperative" ? "mode.cooperative" : "mode.competitive") })}</p>
        {mode === "competitive" ? (
          <p className="pt-1 text-sm font-extrabold uppercase tracking-wide text-white/60">{t("setup.teamCount")}</p>
        ) : null}
        {mode === "competitive" ? (
          <div className="flex gap-2">
            {[2, 3, 4].map((count) => (
              <button key={count} type="button" className="chip" aria-pressed={settings.teamCount === count} onClick={() => onChange({ teamCount: count })}>
                {count}
              </button>
            ))}
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}
