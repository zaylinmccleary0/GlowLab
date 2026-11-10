# Deploying GlowLab (Vercel + Turso)

The web app is served by Vercel as static files. The API runs as one Vercel function
(`api/index.js` → the Express app in `glowlab-server`). Data lives in a Turso database.

## One-time setup

1. **Turso:** create a database (e.g. `glowlab`), then copy its URL
   (`libsql://glowlab-<org>.turso.io`) and create a database token.
2. **Vercel:** **Add New → Project**, import `zaylinmccleary0/GlowLab` from GitHub.
   Leave every build setting alone (it's all in `vercel.json`); just add the
   environment variables below, then **Deploy**.
3. Open the site, **Create account**, and set your real prices in **Settings**.

The tables are created automatically on the first request.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable             | Value                                                    |
| -------------------- | -------------------------------------------------------- |
| `TURSO_DATABASE_URL` | `libsql://<db-name>-<org>.turso.io` (from Turso)         |
| `TURSO_AUTH_TOKEN`   | database token from Turso                                |
| `JWT_SECRET`         | long random string (keep it secret; changing it logs everyone out) |
| `NODE_ENV`           | `production`                                             |

Generate a `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Build settings

All in `vercel.json`; nothing to set in the dashboard. Root directory is the repo root,
`npm run build` builds shared → web → server, and the output is `glowlab-web/dist`.
The mobile app is not part of the Vercel build.

## Photo size

Vercel rejects requests and responses over 4.5 MB, and photos are stored in the database
as data URLs. So:

- the web app shrinks uploads to 1600px on the long edge (JPEG) before saving;
- the phone app picks photos at lower quality and refuses ones that are still too big;
- the project list leaves photos out; opening a project loads its photo.

## Local development

```bash
npm install
npm run build
npm start            # http://localhost:4200, uses glowlab-server/data/glowlab.db
```

`npm run dev:web` runs Vite on :5173 and forwards `/api` to the server on :4200.
Point the local server at Turso instead by setting `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

## Phone app

Set `EXPO_PUBLIC_API_URL` to the Vercel URL (e.g. `https://glowlab.vercel.app`), then
`npx expo start` in `glowlab-mobile`.

## Commit author (Vercel Hobby plan)

Vercel's Hobby plan only builds commits whose author is the GitHub account that owns the
repo, and it blocks commits that list co-authors. This repo commits as:

```bash
git config user.name "zaylinmccleary0"
git config user.email "354676323+zaylinmccleary0@users.noreply.github.com"
```

Empty commits are skipped; a deploy needs a real file change, or use **Redeploy** in the
Vercel dashboard.
