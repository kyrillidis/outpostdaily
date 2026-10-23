# Launch checklist (owner)

Run `node src/launch.mjs` any time; it prints pass/fail for the items below that can be checked from outside. Everything here needs your logins.

## 1. Google Search Console
1. Open search.google.com/search-console and add a property.
2. Prefer a **Domain** property (`outpostdaily.com`): covers www, non-www and http/https. Verify with the DNS TXT record Google shows, added at your DNS provider (verify where the domain's nameservers are managed; if it is on Vercel, use the project's Domains/DNS settings).
3. Alternative, **URL-prefix** (`https://www.outpostdaily.com/`): choose the HTML tag method, copy only the `content` value into `config/site.json` > `verification.google`, apply the render change (see below), deploy, then click Verify.
4. Sitemaps > add `https://www.outpostdaily.com/sitemap.xml` > Submit. Check status reads Success.
5. Use URL Inspection on the home page and request indexing.

## 2. Bing Webmaster Tools
1. Open bing.com/webmasters and sign in.
2. Choose the option to import from Google Search Console and authorise it (verify the exact wording on screen). Otherwise add the site manually and use `verification.bing`.
3. Confirm the sitemap was imported; IndexNow is already wired (`src/indexnow.mjs`).

## 3. AdSense (publisher id ca-pub-9368478490924130)
Before requesting review, verify:
- Privacy policy live at /privacy/ and mentions AdSense (it does).
- `https://www.outpostdaily.com/ads.txt` returns the google.com line.
- Site has enough original, regularly updated content and about/contact pages. Google decides what is "enough"; check current AdSense program policies.
- The AdSense script is already in the page head.

Steps:
1. AdSense > Sites: add `www.outpostdaily.com` and request review. Wait for approval.
2. Consent (needed for EEA/UK/Switzerland traffic): Privacy & messaging > European regulations (verify the label) > create and publish a message for the site.
3. Ads > By ad unit: create display ad units for top, inline and sidebar. Copy each numeric slot id.
4. Paste them into `config/site.json` under `adsense.slots` (`top`, `inline`, `sidebar`). Blank slots render nothing. Deploy.
5. Optionally enable Auto ads in the console; they work independently of slots.
6. Re-run `node src/launch.mjs`.

## 4. Newsletter (Buttondown, username kyrillidis)
The site form already posts to `https://buttondown.com/api/emails/embed-subscribe/kyrillidis`.
1. In Buttondown settings, find the RSS-to-email / automation feature (verify its name and plan availability) and point it at `https://www.outpostdaily.com/feed.xml`.
2. Set the daily send time (the briefing compiles each morning UTC; send after it publishes).
3. Enable double opt-in (confirmation email) for new subscribers.
4. Fill in sender details: from name, reply-to, and the postal address/footer requirements shown there.
5. Send a test, subscribe with your own address through the live form, and confirm the confirmation and first email arrive.

## Render change needed for verification tags
`src/render.mjs` `headMeta` must emit tags from `config/site.json` `verification` (see the report that came with this file). Until then use DNS TXT verification.
