---
version: 1
slug: "src-template-html"
primary_target: "src/template.html"
related_targets: ["src/render.mjs"]
---

# Surface brief: Outpost daily pages (all routes)

Scope: every generated page (home, sections, CVEs, Today & Learn, Toolbox, Archive, edition pages, About/Methodology/Privacy, new Glossary). Visitor mode: Read (with Operate-style scanning for returning readers).
Audience/job: practitioners scan in five minutes; learners need meaning in context. News first, no explainer hero (owner choice). Constraints: static HTML, Google Fonts only, CSP unchanged, ads/Cylist/newsletter/SEO preserved. Must not look like a generic news/blog template, must keep the dense Wire, must not be playful.
Unresolved: re-roll available if the owner dislikes the direction.

## Direction contract

THESIS: Outpost is a field handbook reissued every morning. Each story is a numbered entry with footnoted sources, so the page reads as a reference you can trust and learn from, not a feed. Refuses: the card-grid news template, the neon terminal, the broadsheet masthead with italic serif.

OWN-WORLD: Cool bone-grey stock (night edition: ink-green black), ink-black type, hairline column rules, double rule under the running head. One colour per domain, used as a thumb-index tab and a small chip, never as the only signal: cobalt-steel cyber, olive warfare, terrain-ochre geopolitics; vermilion reserved for exploited/critical. Archivo (width axis) for headings and labels, Source Serif 4 for reading, JetBrains Mono only for CVE ids, times, measurements. Square-ish corners (2-4px), no shadows except focus.

STORY: A returning reader sees today's ranked stories and the dense Wire in one glance and can collapse the page to headlines (Scan). A newcomer reads full entries with a why-it-matters line, footnoted sources, and key terms explained beside them. Both can subscribe, search, and leave for the original source.

FIRST VIEWPORT: Utility strip (edition, search, Read/Scan switch, theme, subscribe). Running head: OUTPOST. wordmark with the shield, one-line scope. Index-tab nav, sticky. Left 8 columns: the lead entry large (condensed-width headline, summary, why-it-matters, footnoted sources) and entries 02-06 in a ruled two-column list. Right 4 columns: sticky Wire (20 ranked rows) with the Cylist tool card pinned beneath it.

FORM: Reference annual / field handbook (candidate 4 of my grounded list), seed f48cbe4f. Raise from the noir one-sheet challenger: a tight ruled billing block (colophon) locked to the foot of every page, carrying the compile stamp, method and sources.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
