# @glowlab/server

GlowLab API: single-business auth (JWT + bcrypt), projects CRUD, presets,
pricing settings, and server-side estimates (same `@glowlab/shared` math as the
clients, so numbers always agree). Express + @libsql/client (Turso in production, a local SQLite file otherwise). Port **4200**.

```bash
cp .env.example .env   # set JWT_SECRET
npm install && npm run build && npm start
```

Serves `../glowlab-web/dist` statically when built. No auto-seeded projects —
presets come from shared; a fresh account starts empty.
