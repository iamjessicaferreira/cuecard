import type { Lang } from "./types";

export interface CatalogDeck {
  id: string;
  lang: Lang;
  name: string;
  cardIds: string[];
  cardCount: number;
}

export interface CatalogTheme {
  id: string;
  names: Partial<Record<Lang, string>>;
  decks: CatalogDeck[];
}

export interface Catalog {
  themes: CatalogTheme[];
}
