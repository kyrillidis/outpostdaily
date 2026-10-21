# Outpost

An autonomous daily briefing on **cybersecurity, modern warfare technology, geodata and geopolitics**, built only from open sources. Every headline links to its source; AI is used only to write short summaries and one "learn today" concept per domain.

Live: https://www.outpostdaily.com

## How it works

```
GitHub Actions (daily cron)
  └─ npm run fetch   RSS/Atom feeds + CISA KEV + NVD  ->  data/editions/<date>.json   (+ ONE small AI call)
  └─ git push        commits data/
Vercel (on push)
  └─ npm run build   data/editions/*.json + src/template.html  ->  dist/   (no network, no AI)
```

The site build is pure, so an outage at a feed or at the AI provider can never break a deploy. If the AI call fails or no key is set, the edition still publishes using each feed's own snippet.

## Keeping AI usage minimal

- Feeds, ranking, de-duplication across outlets, and the CVE table are plain code — no AI.
- One batched call per day, only for items not already summarised (`data/cache.json`, 14-day memory). No new items → no call.
- Input is the headline plus 260 characters per item (~26 items); output is capped at 2,600 tokens. Typically well under a cent per day.
- Default model is `gpt-6-luna`. Change it with the repository variable `OPENAI_MODEL` (Settings → Secrets and variables → Actions → Variables) — no code change.

## Accuracy guards

- Links, dates and sources come from the feeds; the model never writes a URL.
- The model is told to use only the supplied headline and snippet. Any number in its output that is not in the source text causes that AI text to be discarded in favour of the snippet.
- Stories covered by several outlets are merged and show every outlet.
- Feeds that fail are listed on the **Today & Learn** page instead of being hidden.


## Adding sources

Edit `config/sources.json` (feeds, grouped by `cyber` / `warfare` / `geo`; general outlets get `"filter": true` so only items matching the `relevance` pattern are kept) or `config/toolbox.json` (OSINT tool links shown on the Toolbox page). The toolbox is seeded with well-known OSINT resources; to mirror the [OSINT4All](https://start.me/p/L1rEYQ/osint4all) start.me page, export it from start.me and add its links to `toolbox.json`.

## License

MIT
