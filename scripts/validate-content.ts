import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateContentSet, type ContentDocument } from "../src/shared/validateContent";
import type { Lang } from "../src/shared/types";

const root = path.resolve(process.cwd(), "content");

function loadDocuments(): ContentDocument[] {
  const documents: ContentDocument[] = [];
  for (const lang of readdirSync(root)) {
    const dir = path.join(root, lang);
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
      const full = path.join(dir, file);
      const data = JSON.parse(readFileSync(full, "utf8")) as unknown;
      documents.push({
        path: path.relative(process.cwd(), full),
        data,
        expectedLang: lang as Lang,
        expectedThemeId: file.replace(/\.json$/, ""),
      });
    }
  }
  return documents;
}

const issues = validateContentSet(loadDocuments());
if (issues.length > 0) {
  for (const issue of issues) {
    console.error(`${issue.file} ${issue.path}: ${issue.message}`);
  }
  console.error(`\n${issues.length} content problem(s).`);
  process.exit(1);
}
console.log("Content looks good.");
