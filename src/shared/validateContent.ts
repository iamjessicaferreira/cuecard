import type { Difficulty, Lang } from "./types";

export interface CardFile {
  id: string;
  word: string;
  forbidden: string[];
  difficulty: Difficulty;
}

export interface DeckFile {
  deck_id: string;
  name: string;
  cards: CardFile[];
}

export interface ThemeFile {
  version: number;
  theme_id: string;
  lang: Lang;
  theme_name: string;
  decks: DeckFile[];
}

export interface ValidationIssue {
  file: string;
  path: string;
  message: string;
}

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

/** Lowercase, trim, and strip accents so "Ópera" and "opera" compare equal. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function issue(file: string, path: string, message: string): ValidationIssue {
  return { file, path, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateThemeDocument(
  data: unknown,
  filePath: string,
  expected?: { lang?: Lang; themeId?: string },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isObject(data)) {
    return [issue(filePath, "$", "Theme file must be a JSON object")];
  }

  if (typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1) {
    issues.push(issue(filePath, "version", "version must be a positive integer"));
  }
  if (typeof data.theme_id !== "string" || !/^[a-z0-9-]+$/.test(data.theme_id)) {
    issues.push(issue(filePath, "theme_id", "theme_id must be a lowercase slug"));
  } else if (expected?.themeId && data.theme_id !== expected.themeId) {
    issues.push(issue(filePath, "theme_id", `theme_id must be "${expected.themeId}"`));
  }
  if (data.lang !== "pt-BR" && data.lang !== "en") {
    issues.push(issue(filePath, "lang", 'lang must be "pt-BR" or "en"'));
  } else if (expected?.lang && data.lang !== expected.lang) {
    issues.push(issue(filePath, "lang", `lang must be "${expected.lang}" to match the folder`));
  }
  if (typeof data.theme_name !== "string" || data.theme_name.trim().length === 0) {
    issues.push(issue(filePath, "theme_name", "theme_name is required"));
  }
  if (!Array.isArray(data.decks) || data.decks.length === 0) {
    issues.push(issue(filePath, "decks", "decks must be a non-empty array"));
    return issues;
  }

  const words = new Map<string, string>();
  const deckIds = new Set<string>();
  const cardIds = new Set<string>();

  data.decks.forEach((deck, deckIndex) => {
    const deckPath = `decks[${deckIndex}]`;
    if (!isObject(deck)) {
      issues.push(issue(filePath, deckPath, "deck must be an object"));
      return;
    }
    if (typeof deck.deck_id !== "string" || deck.deck_id.trim().length === 0) {
      issues.push(issue(filePath, `${deckPath}.deck_id`, "deck_id is required"));
    } else if (deckIds.has(deck.deck_id)) {
      issues.push(issue(filePath, `${deckPath}.deck_id`, `duplicate deck_id "${deck.deck_id}"`));
    } else {
      deckIds.add(deck.deck_id);
    }
    if (typeof deck.name !== "string" || deck.name.trim().length === 0) {
      issues.push(issue(filePath, `${deckPath}.name`, "deck name is required"));
    }
    if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
      issues.push(issue(filePath, `${deckPath}.cards`, "cards must be a non-empty array"));
      return;
    }

    deck.cards.forEach((card, cardIndex) => {
      const cardPath = `${deckPath}.cards[${cardIndex}]`;
      if (!isObject(card)) {
        issues.push(issue(filePath, cardPath, "card must be an object"));
        return;
      }
      if (typeof card.id !== "string" || card.id.trim().length === 0) {
        issues.push(issue(filePath, `${cardPath}.id`, "card id is required"));
      } else if (cardIds.has(card.id)) {
        issues.push(issue(filePath, `${cardPath}.id`, `duplicate card id "${card.id}"`));
      } else {
        cardIds.add(card.id);
      }
      if (typeof card.word !== "string" || card.word.trim().length === 0) {
        issues.push(issue(filePath, `${cardPath}.word`, "word is required"));
      } else {
        const folded = fold(card.word);
        const prior = words.get(folded);
        if (prior) {
          issues.push(
            issue(
              filePath,
              `${cardPath}.word`,
              `duplicate word "${card.word}" across decks of this theme (also ${prior})`,
            ),
          );
        } else {
          words.set(folded, cardPath);
        }
      }
      if (!Array.isArray(card.forbidden) || card.forbidden.length !== 5) {
        issues.push(issue(filePath, `${cardPath}.forbidden`, "forbidden must be an array of exactly 5 strings"));
      } else if (typeof card.word === "string") {
        const main = fold(card.word);
        const seenForbidden = new Set<string>();
        card.forbidden.forEach((entry, forbiddenIndex) => {
          const forbiddenPath = `${cardPath}.forbidden[${forbiddenIndex}]`;
          if (typeof entry !== "string" || entry.trim().length === 0) {
            issues.push(issue(filePath, forbiddenPath, "forbidden word must be a non-empty string"));
            return;
          }
          const foldedForbidden = fold(entry);
          if (seenForbidden.has(foldedForbidden)) {
            issues.push(issue(filePath, forbiddenPath, `duplicate forbidden word "${entry}"`));
          }
          seenForbidden.add(foldedForbidden);
          if (foldedForbidden.includes(main)) {
            issues.push(
              issue(
                filePath,
                forbiddenPath,
                `forbidden word "${entry}" contains the main word "${card.word}"`,
              ),
            );
          }
        });
      }
      if (typeof card.difficulty !== "string" || !DIFFICULTIES.has(card.difficulty)) {
        issues.push(issue(filePath, `${cardPath}.difficulty`, 'difficulty must be "easy", "medium", or "hard"'));
      }
    });
  });

  return issues;
}

export interface ContentDocument {
  path: string;
  data: unknown;
  expectedLang?: Lang;
  expectedThemeId?: string;
}

/** Validate a set of theme files, including ids that must be unique across files. */
export function validateContentSet(documents: ContentDocument[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cardIds = new Map<string, string>();
  const deckIds = new Map<string, string>();

  for (const document of documents) {
    issues.push(
      ...validateThemeDocument(document.data, document.path, {
        lang: document.expectedLang,
        themeId: document.expectedThemeId,
      }),
    );
    if (!isObject(document.data) || !Array.isArray(document.data.decks)) continue;
    for (const deck of document.data.decks) {
      if (!isObject(deck)) continue;
      if (typeof deck.deck_id === "string") {
        const prior = deckIds.get(deck.deck_id);
        if (prior && prior !== document.path) {
          issues.push(issue(document.path, `deck:${deck.deck_id}`, `deck_id also used in ${prior}`));
        } else {
          deckIds.set(deck.deck_id, document.path);
        }
      }
      if (!Array.isArray(deck.cards)) continue;
      for (const card of deck.cards) {
        if (!isObject(card) || typeof card.id !== "string") continue;
        const prior = cardIds.get(card.id);
        if (prior) {
          issues.push(issue(document.path, `card:${card.id}`, `card id also used in ${prior}`));
        } else {
          cardIds.set(card.id, document.path);
        }
      }
    }
  }

  return issues;
}
