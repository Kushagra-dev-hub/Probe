# Probe

**An AI co-interviewer that watches the code, not the clock.**

Technical interviews put all the cognitive load on one person: run the conversation, watch the
candidate type, catch subtle correctness/complexity issues, decide what to probe next, and
remember all of it well enough to write a fair evaluation afterward. Probe is a live-coding
interview room with an AI copilot sitting next to the interviewer — it reads the candidate's code
and run history in real time and tells the interviewer the one question worth asking next.

## The idea

Most "AI interview" tools either replace the human interviewer or bolt a chatbot onto the
candidate's side. Probe does neither. It's a real interviewer running a real interview — Probe
just makes sure nothing worth noticing gets missed:

- **Ask-this-next, grounded in evidence.** The copilot watches editor syncs and run results,
  checks them against a role rubric, and surfaces one specific, citable question (exact lines,
  exact behavior) — never a generic prompt, and never anything the interviewer has to go dig for.
- **Auto-drafted scorecard.** The moment the interview ends, the copilot has already scored every
  rubric item against what it actually observed (strong / mixed / thin / unknown, each with
  evidence) — a starting draft, not a replacement for the interviewer's judgment.
- **Interviewer-only, always.** No copilot output, suggestion, or score ever reaches the
  candidate. It's a private signal boost, not a chatbot in the room.

## See it in 60 seconds

```bash
cp .env.example .env      # fill in DATABASE_URL + Supabase (or just use the dev-token fallback)
npm install
npm run db:generate
npm run db:push           # create tables
npm run db:seed           # seeds an interviewer + interviewee + one interview + a question bank

# 3 terminals:
npm run dev:expert        # :3004 — realtime backend
npm run dev:interviewer   # :3003 — interviewer room
npm run dev:interviewee   # :3000 — candidate room
```

Open two browser windows:
- **Interviewer:** http://localhost:3003/interview/seed-interview/room?token=seed-interviewer
- **Interviewee:** http://localhost:3000/interview/seed-interview/room?token=seed-interviewee

Reload the interviewer tab, then the interviewee tab (lands in a lobby) → interviewer clicks
**Admit** → video, screen share, the shared editor, and code execution all connect live. Type some
intentionally-wrong code (e.g. comment a complexity that doesn't match the algorithm) and watch
the copilot panel on the interviewer side flag it with the exact line numbers.

`npm run db:reset` resets the seed candidate back to the lobby for a re-run.

## What's built

- **Live room**: video/audio, screen share, a shared Monaco code editor (DSA/SQL rounds) and an
  Excalidraw whiteboard (system design round), a synced timer, and real code execution via Judge0
  (run + per-test-case submit, not just raw stdout).
- **Probe copilot**: the differentiator above — rubric generation from a role title + JD, live
  suggestions, and an auto-drafted end-of-interview scorecard. Falls back to a deterministic
  rubric with no LLM key configured, so the room still works without one.
- **Live transcription** (optional): per-speaker audio streamed to Deepgram for a live transcript,
  fed to the copilot as extra context. No-ops cleanly if `DEEPGRAM_API_KEY` is unset.
- **Real auth**: email/password accounts (scrypt-hashed, signed session tokens) served by the
  realtime backend itself — no external auth provider required to run this end to end.
- **Candidate join links**: an interviewer creates an interview and gets a shareable
  `/join/:shareToken` link — the token doubles as the candidate's credential, so the candidate
  never needs an account. That page also takes a resume upload (PDF/DOCX) for extra context.
- **Interviewer dashboard**: upcoming/past interviews, instant or scheduled creation, edit/cancel,
  and a filled-in evaluation report per past interview.

## Architecture

```
apps/
  expert/        Fastify + Socket.IO realtime backend — room state, WebRTC signaling relay,
                  Judge0 code execution, the copilot engine — :3004
  interviewer/   Next.js — marketing site, dashboards, and the interviewer room — :3003
  interviewee/   Next.js — candidate join flow and room — :3000
packages/
  contract/      Shared socket event types — the frozen contract both room UIs code against
  db/            Prisma schema + seed (Postgres via Supabase)
```

One realtime backend is the spine; both room UIs are thin clients that share nothing but the
`contract` package's event types, so the interviewer and candidate views can never drift out of
sync on what a given socket event means.

**Stack:** Next.js 15 + React 19, Fastify + Socket.IO, Prisma + Postgres (Supabase), Judge0 (code
execution), Deepgram (live transcription), an LLM provider chain — Gemini → xAI → Groq — for the
copilot, WebRTC for video/screen-share, Excalidraw for the whiteboard, Monaco for the editor.

## More detail

- [`CLAUDE.md`](./CLAUDE.md) — full build history, the original reference source, and the frozen
  socket contract.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — deploying `expert` to Render and both Next.js apps to
  Vercel.

## Known gaps

Being upfront about what's not finished: WebRTC renegotiation doesn't yet auto-recover if a peer
reloads mid-call (a fresh reconnect does work), and Supabase-JWT auth is wired as an *optional*
alternative to the built-in email/password login rather than the only path.
