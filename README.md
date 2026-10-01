# StreamSimple (Render deploy)

A minimal movie/show streaming site. Single Express server (`server.js`)
serves the static frontend from `/public` and proxies the
MovieBox/Cinexora API (`moviebox-api-1-u2go.onrender.com`) through a
handful of `/api/*` routes.

## Why the backend exists

The upstream API appears to check the `Referer`/`Origin` header
server-side and rejects direct browser requests. Browsers won't let
client-side JS set those headers, so `server.js` makes the real request
server-side with a spoofed `Referer`/`Origin` matching the real Cinexora
frontend, then hands the JSON back to your page same-origin — no CORS or
header issues on the browser side.

## Deploy on Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Web Service**, connect the repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
   - Leave the `PORT` env var alone — Render sets it automatically and
     `server.js` reads `process.env.PORT`.
4. Deploy. Open the Render URL once it's live.

(No `render.yaml` needed for this — the dashboard settings above are
enough. Add one later if you want infrastructure-as-code.)

## ⚠️ Not yet verified live

This was built without being able to reach the upstream API directly (the
build environment's network is locked to package registries only), so
two things are unverified and may need a quick fix once you deploy and
test:

1. **Whether the Referer/Origin spoof actually works.** If `/api/trending`
   still comes back denied once deployed, the upstream may be checking
   something else (a session cookie, a signed token, a stricter
   User-Agent check, etc.) — open the Network tab on the *real* Cinexora
   site and compare the full request headers against what `server.js`
   sends in `upstreamFetch()`.
2. **Exact JSON field names.** `public/app.js` guesses common field names
   for id/title/poster/stream-url (see `extractItems`, `itemTitle`,
   `itemPoster`, `findStreamUrl`). Every API response is also logged to
   the browser console (`[api] ...`), and if a playable URL can't be
   auto-detected, the detail page shows the raw JSON instead of a blank
   player — copy that back so the field names can be tightened up.
