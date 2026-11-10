import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, CatalogTheme } from "../shared/catalog";
import type { Card, Lang, RoomSettings } from "../shared/types";
import { validateContentSet, type CardFile, type ContentDocument, type ThemeFile } from "../shared/validateContent";

const THEME_ORDER = ["art", "music", "travel", "pop", "cooking", "history"];

interface StoredCard extends Card {
  lang: Lang;
}

export interface ContentLibrary {
  catalog: Catalog;
  poolFor(settings: RoomSettings): { cards: Card[]; error?: string };
}

export function loadContent(dir: string): ContentLibrary {
  const documents: ContentDocument[] = [];
  const stored: StoredCard[] = [];
  const themes = new Map<string, CatalogTheme>();

  for (const langName of readdirSync(dir).sort()) {
    const langDir = path.join(dir, langName);
    let files: string[] = [];
    try {
      files = readdirSync(langDir).filter((name) => name.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(langDir, file);
      const data = JSON.parse(readFileSync(full, "utf8")) as ThemeFile;
      documents.push({
        path: path.relative(process.cwd(), full),
        data,
        expectedLang: langName as Lang,
        expectedThemeId: file.replace(/\.json$/, ""),
      });
    }
  }

  const issues = validateContentSet(documents);
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.file} ${issue.path}: ${issue.message}`).join("\n");
    throw new Error(`Card content failed validation:\n${detail}`);
  }

  for (const document of documents) {
    const theme = document.data as ThemeFile;
    const entry = themes.get(theme.theme_id) ?? { id: theme.theme_id, names: {}, decks: [] };
    entry.names[theme.lang] = theme.theme_name;
    for (const deck of theme.decks) {
      const cardIds = deck.cards.map((card: CardFile) => card.id);
      entry.decks.push({
        id: deck.deck_id,
        lang: theme.lang,
        name: deck.name,
        cardIds,
        cardCount: cardIds.length,
      });
      for (const card of deck.cards) {
        stored.push({
          id: card.id,
          word: card.word,
          forbidden: card.forbidden.slice(),
          difficulty: card.difficulty,
          themeId: theme.theme_id,
          deckId: deck.deck_id,
          lang: theme.lang,
        });
      }
    }
    themes.set(theme.theme_id, entry);
  }

  const catalog: Catalog = {
    themes: [...themes.values()].sort((a, b) => THEME_ORDER.indexOf(a.id) - THEME_ORDER.indexOf(b.id)),
  };

  return {
    catalog,
    poolFor(settings) {
      const inLang = stored.filter((card) => card.lang === settings.cardLang);
      if (settings.mix) {
        if (settings.themeIds.length === 0) return { cards: [], error: "errors.noDeck" };
        const cards = inLang.filter((card) => settings.themeIds.includes(card.themeId));
        if (cards.length === 0) return { cards: [], error: "errors.notEnoughCards" };
        return { cards };
      }
      if (!settings.deckId) return { cards: [], error: "errors.noDeck" };
      const cards = inLang.filter((card) => card.deckId === settings.deckId);
      if (cards.length === 0) return { cards: [], error: "errors.noDeck" };
      return { cards };
    },
  };
}
