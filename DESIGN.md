---
name: Outpost
description: A field handbook reissued every morning. Daily, source-linked briefing on cybersecurity, defence technology and geopolitics.
colors:
  paper: "#ECEEE9"
  surface: "#F6F7F3"
  surface-2: "#E1E5DE"
  ink: "#14171A"
  ink-dim: "#42494F"
  ink-faint: "#5A6269"
  rule: "#C2C8C0"
  accent: "#1B5A82"
  cyber: "#2347A8"
  warfare: "#4A5712"
  geo: "#82530A"
  alert: "#AE3A06"
  night-paper: "#0F1411"
  night-surface: "#161C19"
  night-ink: "#E7EAE5"
  night-accent: "#86BAD9"
  night-cyber: "#93ACFF"
  night-warfare: "#B9CA6B"
  night-geo: "#E3B55E"
  night-alert: "#FF8D5E"
typography:
  display:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(2.1rem, 1.5rem + 2.4vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 1.3rem + 1vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.12
  body:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: "Archivo, Arial Narrow, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.07em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  sm: "2px"
  md: "3px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "24px"
  lg: "40px"
  xl: "64px"
components:
  button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 14px"
  button-hover:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
  tool-card:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "16px 18px"
  wire:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "11px 14px"
---

# Design system: Outpost

## Overview

A field handbook that is reissued every morning. Stories are numbered **entries** set between ruled lines, with footnoted sources, not cards. The page is serious and plain-spoken, but never cold: generous type, clear labels and a Read / Scan switch make it easy for a newcomer and fast for a daily reader. Nothing on it is decorative for its own sake. Imagery is photographic: documentary header photos (satellite, radar, server hall) and each story's own picture, always credited.

Refuses: the card-grid news template, neon terminals, broadsheet italics, playful mascots.

## Colors

Two editions of one palette. **Day** is bone-grey stock with ink-black type; **night** is ink-green black with pale type. Both are selected by `prefers-color-scheme` and a manual Auto / Light / Dark toggle (`data-theme` on `<html>`).

- **Paper / surface / surface-2:** the stock, the raised panel (Wire, key terms) and the utility strip.
- **Ink, ink-dim, ink-faint:** text. All pass WCAG AA on paper and surface (checked by script in both editions).
- **Accent steel:** links, focus ring, the full stop in OUTPOST.
- **Domain colours:** cyber cobalt, warfare olive, geopolitics terrain-ochre. Each marks a thumb-index tab, a chip with an icon and text, and the plate accent. Colour is never the only signal.
- **Alert vermilion:** reserved for exploited, critical and ransomware. Nothing else uses it.

## Typography

- **Archivo** (variable weight and width): headlines at 75–86% width, labels and navigation. Condensed width gives headlines the compact, printed feel.
- **Source Serif 4:** all reading text, 18–19px at 1.62 line height, measure about 66ch.
- **JetBrains Mono:** only CVE identifiers, dates in the vulnerability table and keys. Never as a "technical" costume.
- Headings balance, paragraphs use `text-wrap: pretty`, numerals are tabular.

## Layout

A 1480px shell with a fluid gutter. At 1180px and above: main column plus a 380px sticky rail holding the Wire (scrolls inside itself) with the Cylist tool card pinned beneath. Below that the rail follows the main content. Sticky section tabs (48px) with scroll-margin everywhere. Single `h1` per page; entries are `h3` on the home and edition pages and `h2` on single-section pages.

Reading views: **Read** (default) shows summary, why-it-matters, tags and sources; **Scan** shows headlines and datelines only. The choice persists in `localStorage` and switches through a view transition (the one authored motion; reduced motion disables it).

## Elevation & Depth

No shadows. Depth comes from rules (hairline 1px, strong 2–3px, double under the masthead), surface tints and the inverted tool card. Focus is a 2px accent outline with 3px offset.

## Shapes

Square-ish: 2–3px radius on controls and chips; plates and banners are hard rectangles with a hairline border. Chips are outlined, never pills.

## Components

- **Entry:** number, headline link (external-link icon), dateline (domain chip, outlet, date, outlet count), summary, why-it-matters, tags, footnoted sources. The story image sits right of the text on desktop and above it on mobile; the lead entry puts its headline beside the image.
- **Header photo:** a credited photograph behind the logo and header that changes with the page (masthead, server hall, radar site, Suez, night Earth), greyscale with a section-colour tint and a readable scrim.
- **Story image:** the story's own picture, thumbnailed and self-hosted, shown right of the text and credited to the outlet. Stories without a picture simply have no image.
- **Wire:** 20 ranked rows with rank, headline, domain chip, host and a link to the entry.
- **Key terms:** a collapsed `details` panel per page, fed by `config/glossary.json`.
- **Vulnerability table:** CISA KEV rows with a severity badge (filled critical, outlined high), reflowing to stacked rows below 760px.
- **Tool card (Cylist):** inverted block with a disclosure line.
- **Colophon:** newsletter form and a ruled billing block with the compile stamp, links, shortcuts (`/`, `j`, `k`, `s`) and the AI note.

## Do's and Don'ts

- Do keep the news first on every page; help for newcomers lives in context (key terms, glossary), not above the headlines.
- Do pair every colour signal with text or an icon.
- Do credit every photograph and say when it is cropped and tinted.
- Don't add eyebrow labels above headings, section numbers in navigation, coloured side borders, gradient text, glass, shadows or emoji icons.
- Don't use the vermilion alert colour for anything that is not exploited or critical.
- Don't put copy in the design that the pipeline cannot back up: no reader counts, awards or invented facts.
