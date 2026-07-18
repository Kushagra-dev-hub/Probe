# Probe

Standalone live-coding interview room — **interviewer** and **interviewee** roles.
Extracted/rebuilt from a larger monorepo. See [`CLAUDE.md`](./CLAUDE.md) for the full plan,
reference map, and socket contract.

## Structure

```
apps/
  expert/        Fastify + Socket.IO realtime backend (the spine)
  interviewer/   Next.js — interviewer room (:3003)
  interviewee/   Next.js — candidate room (:3000)
packages/
  contract/      Shared socket event types (source of truth)
  db/            Prisma schema + seed
```

## Getting started

```bash
cp .env.example .env      # fill in DATABASE_URL + Supabase (or use dev token fallback)
npm install
npm run db:generate
npm run db:push           # create tables
npm run db:seed           # one interviewer + interviewee + interview + 2 questions

# run each in its own terminal:
npm run dev:expert        # :3004
npm run dev:interviewer   # :3003
npm run dev:interviewee   # :3000
```

**Dev auth:** when Supabase env is unset, the socket accepts the handshake token as a raw
user id — connect with `auth: { token: "seed-interviewer" }` or `"seed-interviewee"` to act as
either seeded participant.

## Status

Scaffold + backend spine + DB are in place. The two room UIs are the next port (see CLAUDE.md §8–§9).
