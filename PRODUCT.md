# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: dependency-light Node build. `src/fetch.mjs` collects feeds, `src/render.mjs` renders `src/template.html` plus `data/editions/*.json` into static pages in `dist/`, deployed on Vercel. No framework and no client bundle; keep it that way.

## Users

Two audiences with equal weight, confirmed by the owner:
- **Practitioners**: SOC and security analysts, defence and OSINT analysts who want a five-minute scan before work.
- **Learners**: students and career-switchers who want the field explained as they read.

They read in the morning or between tasks, on laptop and phone, and return daily.

## Product Purpose

Outpost is a free daily briefing on cybersecurity, modern warfare technology, and geopolitics and geodata (GNSS, satellites, the geo wars). It is compiled automatically from open sources every morning, ranks the day's stories, links every line to its outlet, and teaches one cyber, one warfare and one geopolitics/geodata concept a day from that day's reporting. Success: a returning reader finds today's important stories in seconds; a newcomer is never lost.

## Positioning

A single autonomous, open-source page that combines the day's ranked, source-linked news with a daily concept to learn and an OSINT toolbox. Methodology and code are public. AI only writes short summaries from the supplied headline and snippet, and numbers it cannot find in the source are discarded.

## Operating Context

- Compiled once a day by GitHub Actions (04:17 UTC), deployed to Vercel at https://www.outpostdaily.com.
- Sections and URLs: `/` (Top Stories), `/cyber/`, `/cves/` (CISA KEV with CVSS), `/warfare/`, `/geopolitics/`, `/today/` (Top 5, defender checklist, Learn), `/toolbox/`, `/archive/`, plus `/about/`, `/methodology/`, `/privacy/`.
- A "Wire" of the 20 top-ranked items sits beside the content on every page.
- Revenue is Google AdSense; the owner also promotes Cylist (cylist.io, threat-intel triage for SOC analysts) in the sidebar, Toolbox and footer.
- Email newsletter via Buttondown; RSS at `/feed.xml`.

## Capabilities and Constraints

- Static HTML only; inline CSS/JS is allowed, fonts only from Google Fonts, scripts only from the CSP-allowed hosts (AdSense, Vercel Insights). CSP lives in `vercel.json` and must not be loosened.
- Must preserve: routes and per-page title, description, canonical, Open Graph and JSON-LD (generated in `src/render.mjs`); RSS, sitemap, IndexNow; ad slot placeholders that render nothing until a slot id is set and reserve space to avoid layout shift; the Cylist card; the newsletter form; keyword search and keyword index over `.kw-unit` elements; legacy hash redirects.
- Performance budget: no new dependencies, no framework, no web fonts beyond a small number of families, LCP on text, no layout shift, works without JS (JS only adds search, clock, staleness, theme).
- Content changes daily; items have title, 1-2 line AI summary, "why it matters" line, tags, source and corroborating outlets, published date.
- Copy rule: every claim stays sourced; never invent statistics, customers or testimonials.

## Brand Commitments

- Name: OUTPOST. (wordmark with accent full stop), shield icon already shipped in `public/`.
- Voice: plain, neutral, source-attributed; "every line sourced".
- Owner-stated redesign constraints: it must not look like a generic news or blog template, must not lose the dense scannable Wire, and must not be playful or gimmicky. The first screen is the news itself; there is no explainer hero. Newcomer guidance lives in context (labels, glossary, the Learn material), not in front of the headlines.

## Evidence on Hand

- Live daily editions in `data/editions/` (real stories, real links, real CVEs); archive of earlier editions in `public/archive/`.
- No testimonials, reader counts, awards or traffic claims exist; none may be invented.

## Product Principles

1. News first: today's stories are the first thing on every page.
2. Scan first, learn on demand: dense for the returning reader, with explanation one tap away for the newcomer.
3. Everything sourced and honest about its limits (AI summaries are pointers, failures are shown).
4. Static, fast and crawlable: SEO and ads are product requirements, not afterthoughts.
5. Serious subject, friendly surface: approachable to all, never trivialising war or security.

## Accessibility & Inclusion

- Target WCAG 2.2 AA: contrast, visible focus, keyboard navigation, skip link, semantic landmarks, one h1 per page.
- Respect `prefers-color-scheme` and `prefers-reduced-motion`; no meaning by color alone (severity chips carry text).
- Plain-language labels and short jargon explanations for newcomers; readable body text at default zoom; works at 320px width.
- Content covers conflict and security: avoid sensational imagery and gratuitous visuals of harm.
