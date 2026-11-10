import type { CardView } from "@shared/types";
import { useI18n } from "../i18n";

export function WordCard({ card, kicker }: { card: CardView; kicker?: string }) {
  const { t } = useI18n();
  if (card.kind === "none" || card.kind === "hidden") return null;
  const showWord = card.kind === "full" || card.kind === "reveal";
  return (
    <article className="paper flex min-h-48 flex-1 flex-col gap-4 p-5">
      {kicker ? <p className="text-sm font-extrabold uppercase tracking-wide text-[#8a4b16]">{kicker}</p> : null}
      {showWord ? <h2 className="font-display text-5xl leading-[0.95]">{card.word}</h2> : null}
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-[#9a3b3b]">{t("turn.forbidden")}</p>
        <ul className="flex flex-wrap gap-2">
          {card.forbidden.map((word) => (
            <li key={word} className="rounded-full bg-[#ffe1dc] px-3 py-1.5 text-base font-extrabold text-[#8d2430]">
              {word}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
