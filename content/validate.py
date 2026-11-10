#!/usr/bin/env python3
"""Validate the card bank JSON files.
ERRORS (must be zero): schema, counts (3 decks x 50), exactly 5 distinct forbidden words,
1-3 word main term, unique ids, duplicate main words within a theme, root containment
between main word and forbidden words, difficulty mix per deck (20 easy/20 medium/10 hard).
WARNINGS (reviewed by hand): weaker root similarity, near-duplicate main words within a theme
(string similarity / shared significant token), same main word across themes of a language.
"""
import json, re, sys, unicodedata, difflib, itertools
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
THEMES = ["art", "music", "geography", "pop_culture", "cooking", "history"]
LANGS = ["pt-BR", "en"]
DIFF_TARGET = {"easy": 20, "medium": 20, "hard": 10}
STOP = {"de","da","do","das","dos","e","o","a","os","as","em","no","na","com","um","uma","the","of","and","in","on","a","an","to","for","la","le","el","du","von","van","y"}

def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()

def tokens(s):
    return [t for t in norm(s).split() if t not in STOP]

def common_prefix(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y: break
        n += 1
    return n

def root_issue(main, forb):
    """Return ('error'|'warn', detail) or None."""
    nm, nf = norm(main).replace(" ", ""), norm(forb).replace(" ", "")
    if nm and nm in nf or (len(nf) >= 4 and nf in nm):
        return "error", "whole-word containment"
    worst = None
    for a in tokens(main):
        for b in tokens(forb):
            if len(a) < 3 or len(b) < 3:
                continue
            if a == b:
                return "error", f"same token '{a}'"
            if len(a) >= 4 and len(b) >= 4 and (a in b or b in a):
                return "error", f"token containment '{a}'/'{b}'"
            p, m = common_prefix(a, b), min(len(a), len(b))
            if p >= 5 or (m >= 4 and p >= 4):
                return "error", f"shared root '{a[:p]}' ({a}/{b})"
            short, long_ = sorted((a, b), key=len)
            if len(short) <= 5 and len(short) >= 4 and long_.startswith(short[:-1]):
                worst = ("warn", f"similar root '{short[:-1]}' ({a}/{b})")
    return worst

def main():
    errors, warns = [], []
    ids = set()
    summary = []
    by_lang_words = defaultdict(lambda: defaultdict(list))
    for lang in LANGS:
        for theme in THEMES:
            p = ROOT / lang / f"{theme}.json"
            if not p.exists():
                errors.append(f"missing file {p}"); continue
            data = json.loads(p.read_text(encoding="utf-8"))
            for k in ("theme_id", "lang", "theme_name", "decks"):
                if k not in data: errors.append(f"{p.name}: missing key {k}")
            if data.get("theme_id") != theme or data.get("lang") != lang:
                errors.append(f"{p}: theme_id/lang mismatch")
            decks = data.get("decks", [])
            if len(decks) != 3: errors.append(f"{lang}/{theme}: {len(decks)} decks (expected 3)")
            seen = {}
            allcards = []
            for d in decks:
                cards = d.get("cards", [])
                summary.append((lang, theme, d.get("deck_id"), len(cards), Counter(c.get("difficulty") for c in cards)))
                if len(cards) != 50: errors.append(f"{d['deck_id']}: {len(cards)} cards (expected 50)")
                dc = Counter(c.get("difficulty") for c in cards)
                if dict(dc) != DIFF_TARGET: errors.append(f"{d['deck_id']}: difficulty mix {dict(dc)}")
                for c in cards:
                    cid, w, f = c.get("id"), c.get("word", ""), c.get("forbidden", [])
                    tag = f"{cid} '{w}'"
                    if cid in ids: errors.append(f"duplicate id {cid}")
                    ids.add(cid)
                    if not re.fullmatch(rf"{'pt' if lang=='pt-BR' else 'en'}-{theme}-[123]-\d{{3}}", cid or ""):
                        errors.append(f"{tag}: bad id format")
                    if c.get("difficulty") not in DIFF_TARGET: errors.append(f"{tag}: bad difficulty")
                    # 1-3 content words; articles/prepositions ("of", "the", "do", "de"...) don't count (e.g. "Back to the Future")
                    allw = re.split(r"\s+", w.strip())
                    content = [x for x in allw if norm(x) not in STOP and norm(x) != "to"]
                    if not (1 <= len(content) <= 3) or len(allw) > 5:
                        errors.append(f"{tag}: main word has {len(content)} content words / {len(allw)} words")
                    if len(f) != 5: errors.append(f"{tag}: {len(f)} forbidden words")
                    if len({norm(x) for x in f}) != len(f): errors.append(f"{tag}: repeated forbidden word")
                    for x in f:
                        r = root_issue(w, x)
                        if r: (errors if r[0] == "error" else warns).append(f"{tag} vs '{x}': {r[1]}")
                    # forbidden words sharing a root with each other (weak clue diversity)
                    for x, y in itertools.combinations(f, 2):
                        if norm(x) and norm(y) and (norm(x) in norm(y) or norm(y) in norm(x)):
                            warns.append(f"{tag}: forbidden '{x}' and '{y}' overlap")
                    n = norm(w)
                    if n in seen: errors.append(f"{tag}: duplicate main word in theme (also {seen[n]})")
                    seen[n] = cid
                    allcards.append(c)
                    by_lang_words[lang][n].append(f"{theme}:{cid}")
            # near-duplicates within theme
            for a, b in itertools.combinations(allcards, 2):
                na, nb = norm(a["word"]), norm(b["word"])
                ratio = difflib.SequenceMatcher(None, na, nb).ratio()
                ta = {t for t in tokens(a["word"]) if len(t) >= 4}
                tb = {t for t in tokens(b["word"]) if len(t) >= 4}
                shared = ta & tb
                if (ratio >= 0.8 and min(len(na), len(nb)) >= 5) or shared:
                    warns.append(f"near-dup {lang}/{theme}: '{a['word']}' ({a['id']}) ~ '{b['word']}' ({b['id']})"
                                 + (f" shared={sorted(shared)}" if shared else f" ratio={ratio:.2f}"))
    for lang, words in by_lang_words.items():
        for n, where in words.items():
            themes = {x.split(':')[0] for x in where}
            if len(themes) > 1:
                warns.append(f"cross-theme repeat {lang}: '{n}' in {where}")
    print("== Summary ==")
    tot = Counter()
    for lang, theme, did, n, dc in summary:
        tot[lang] += n
        print(f"{lang:6} {theme:12} {did:22} {n:3} cards  easy={dc['easy']} medium={dc['medium']} hard={dc['hard']}")
    for lang in LANGS: print(f"TOTAL {lang}: {tot[lang]}")
    print(f"\n== {len(errors)} ERRORS ==")
    for e in errors: print("ERROR", e)
    print(f"\n== {len(warns)} WARNINGS ==")
    for w in warns: print("WARN ", w)
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
