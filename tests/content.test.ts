import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateContentSet, validateThemeDocument, type ContentDocument } from "../src/shared/validateContent";
import type { Lang } from "../src/shared/types";

const root = path.resolve(process.cwd(), "content");

function loadDocuments(): ContentDocument[] {
  const documents: ContentDocument[] = [];
  for (const lang of readdirSync(root)) {
    const dir = path.join(root, lang);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      documents.push({
        path: path.join("content", lang, file),
        data: JSON.parse(readFileSync(path.join(dir, file), "utf8")) as unknown,
        expectedLang: lang as Lang,
        expectedThemeId: file.replace(/\.json$/, ""),
      });
    }
  }
  return documents;
}

describe("content validator", () => {
  it("accepts the sample banks", () => {
    const documents = loadDocuments();
    expect(documents.length).toBe(12);
    expect(validateContentSet(documents)).toEqual([]);
  });

  it("rejects a forbidden word that contains the main word", () => {
    const issues = validateThemeDocument(
      {
        version: 1,
        theme_id: "art",
        lang: "en",
        theme_name: "Art",
        decks: [
          {
            deck_id: "bad",
            name: "Bad",
            cards: [
              {
                id: "bad-1",
                word: "King",
                forbidden: ["crown", "kingdom", "throne", "royal", "castle"],
                difficulty: "easy",
              },
            ],
          },
        ],
      },
      "bad.json",
    );
    expect(issues.some((issue) => issue.message.includes("contains the main word"))).toBe(true);
  });

  it("rejects duplicate words across decks and the wrong number of forbidden words", () => {
    const issues = validateThemeDocument(
      {
        version: 1,
        theme_id: "art",
        lang: "en",
        theme_name: "Art",
        decks: [
          {
            deck_id: "a",
            name: "A",
            cards: [
              { id: "a1", word: "Apple", forbidden: ["red", "fruit"], difficulty: "easy" },
            ],
          },
          {
            deck_id: "b",
            name: "B",
            cards: [
              {
                id: "b1",
                word: "apple",
                forbidden: ["pie", "core", "tree", "juice", "seed"],
                difficulty: "easy",
              },
            ],
          },
        ],
      },
      "dup.json",
    );
    expect(issues.some((issue) => issue.message.includes("exactly 5"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("duplicate word"))).toBe(true);
  });
});
