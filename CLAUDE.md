# Probe — Live Coding Interview Room (standalone rebuild)

> **What this project is:** a faithful, standalone recreation of the "direct interview"
> live-coding interview room extracted from a larger monorepo. Same stack, rebuilt clean,
> simplified to two roles: **interviewer** and **interviewee**. No jobs/ATS/candidate-pipeline.

---

## STATUS: built & runnable ✅

This is no longer a plan — it's a working app, verified end-to-end against live services
(Supabase + RapidAPI Judge0). Backend spine, both room UIs, lobby→admit, live video/screen/editor,
timer, and real code execution all work. Full detail in §9; the short version is below.

### Run it (3 terminals, from `C:\probe`)
```
npm run dev:expert        # :3004  realtime backend (Fastify + Socket.IO)
npm run dev:interviewer   # :3003  interviewer room
npm run dev:interviewee   # :3000  candidate room
```
Then open two browser windows:
- **Interviewer:** http://localhost:3003/interview/seed-interview/room?token=seed-interviewer
- **Interviewee:** http://localhost:3000/interview/seed-interview/room?token=seed-interviewee

`?token=` logs each window in as the seeded user (dev-token auth — no real login yet).
Flow: reload interviewer → reload interviewee (lands in lobby) → interviewer clicks **Admit** →
video/screen-share/shared-editor/Run all connect.

**Reset the demo** (put the candidate back in the lobby): `npm run db:reset`

### First-time setup (fresh clone / new machine only)
```
cp .env.example .env      # creds already present in .env on this machine
npm install
npm run db:generate && npm run db:push && npm run db:seed
```

### What's left (all optional)
- Real Supabase **login** to replace the dev-token (helpers sketched in the user's Supabase prompt).
- WebRTC **renegotiation** so A/V auto-recovers if a peer reloads (client reconnect-rejoin IS done).
- ~~The pages around the room~~ **DONE** — interviewer dashboard + create/edit form + interviewee
  dashboard are built and verified (see **§11**). Interviews can now be created from the UI, not just seed.

---

## 0. Reference source (READ THIS FIRST when you need context)

The original feature lives in another project on this same machine. **Always take reference from it:**

```
REFERENCE_ROOT = c:\Users\Kushagra\OneDrive\Desktop\practers
```

Key reference files (open them by absolute path — they are the ground truth for behavior):

| Concern | Reference path (under REFERENCE_ROOT) |
|---|---|
| Realtime backend (spine) | `apps/expert/src/index.ts` (~1888 lines) |
| Backend libs | `apps/expert/src/lib/{env,judge0,prisma,supabase,socket-auth}.ts`, `apps/expert/src/plugins/auth.ts` |
| Interviewer room UI | `apps/company/src/app/(auth)/direct-interviews/[jobId]/room/page.tsx` (~1873 lines) |
| Interviewer socket hook | `apps/company/src/hooks/use-direct-interview-room.ts` (~498 lines) |
| Interviewee room UI | `apps/web/src/app/(authenticated)/(sidebar)/scheduled/final-interview/[id]/page.tsx` (~1317 lines) |
| Interviewee socket hook | `apps/web/src/hooks/use-direct-interview-room.ts` (~466 lines) |
| API endpoints | `apps/api/src/routes/ide.ts`, `apps/api/src/companies/direct-interviews.ts` |
| DB models | `packages/db/prisma/schema.prisma` (models DirectInterview, DirectInterviewQuestion @ ~705-768) |
| DB room tables (SQL) | `packages/db/manual-sql/direct-interview-room-stage-1.sql`, `...-stage-4-evaluation.sql` |

> NOTE: The reference workspace component `direct-interviews-workspace.tsx` (3802 lines, candidate
> management) is **intentionally dropped** — Probe has no candidate pipeline.

---

## 1. Scope decisions (locked)

- **Standalone project** — own repo/folder, own DB, own auth. Not part of the reference monorepo.
- **Full both-sided feature** — backend + interviewer UI + interviewee UI + DB.
- **Identical stack** — Next.js frontends + Fastify + Socket.IO backend + Supabase auth + Prisma/Postgres + Judge0.
- **Two roles only:** `interviewer` and `interviewee`. No jobs, no ATS, no candidate pipeline.
- **Session creation:** default = seed script (one interviewer + one interviewee + one interview + 2 questions). A "create interview" form can come later.

---

## 2. Target layout

```
C:\probe\
  apps\
    expert\        # Fastify + Socket.IO — the spine (port from reference apps/expert)
    interviewer\   # Next.js — interviewer room (port room/page.tsx + hook)
    interviewee\   # Next.js — interviewee room (port final-interview page + hook)
  packages\
    db\            # Prisma: interviews + questions + room tables + evaluations
    contract\      # shared TS: socket event names + payload types (NEW, source of truth)
  .env
  package.json     # npm/pnpm workspaces
```

---

## 3. Domain model (simplified — two roles)

```
User             id, name, email, role: 'interviewer' | 'interviewee'
Interview        id, interviewer_id, interviewee_id, scheduled_at, duration_minutes,
                 status, started_at, ended_at, active_question_id, active_question_index
InterviewQuestion id, interview_id, question_id/text, difficulty, order
Question(bank)   id, title, statement, examples, constraints, starter_code, solution, sample_tests

# runtime/room tables (ported ~as-is; FKs repointed from direct_interviews -> interviews):
room_sessions        (was direct_interview_room_sessions)
room_participants    (role 'interviewer' | 'interviewee')   # ref used 'candidate'
room_events
code_snapshots       (was direct_interview_room_code_snapshots)
evaluations          (score 0-100, recommendation pending|hire|hold|reject, strengths[], concerns[], notes)
```

The room SQL in the reference (`manual-sql/*.sql`) ports over almost unchanged — repoint FKs to `interviews(id)` and rename the `candidate` role to `interviewee`.

---

## 4. Socket contract (the spine — freeze this in packages/contract)

Reference uses id field `directInterviewId`; **in Probe rename to `interviewId`.** All events namespaced `direct:` in the reference — keep or rename to `room:` (TBD, keep `direct:` for now to ease porting).

### Client → Server
| Event | Payload |
|---|---|
| `join-session` | `{ interviewId }` |
| `admit-candidate` | `{ interviewId }` (interviewer admits interviewee from lobby) |
| `select-question` | `{ interviewId, questionId }` |
| `editor-sync` | `{ interviewId, questionId?, language, code, revision? }` |
| `timer-sync` | `{ interviewId, elapsedSeconds, totalSeconds? }` |
| `end-session` | `{ interviewId, reason }` |
| `code-execute` | `{ interviewId, mode: 'run'|'submit', questionId?, language, code, stdin? }` |
| `evaluation-save` | `{ interviewId, score?, recommendation, strengths?, concerns?, notes? }` |
| `signal-offer` / `signal-answer` | `{ interviewId, sdp }` |
| `signal-ice` | `{ interviewId, candidate }` |
| `request-screen-share` | `{ interviewId }` |
| `screen-share-state` | `{ interviewId, state: 'active'|'stopped', hasSystemAudio }` |
| `screen-offer` / `screen-answer` | `{ interviewId, sdp }` |
| `screen-ice` | `{ interviewId, candidate }` |

### Server → Client
`bootstrap`, `session-state`, `lobby-request`, `editor-state`, `timer-sync`,
`session-ended`, `execution-sync`, `evaluation-saved`,
`signal-offer` / `signal-answer` / `signal-ice`,
`screen-share-requested` / `screen-share-state` / `screen-offer` / `screen-answer` / `screen-ice`.

**Server room semantics:** on connect, socket joins `user:<id>` only. Interview room
(`roomName(interviewId)`) is joined inside the `join-session` handler. All broadcasts target
`roomName(interviewId)`. WebRTC: interviewer is the offerer for A/V; interviewee is the offerer
for screen-share. Interviewer ignores inbound A/V offers by design.

---

## 5. Port inventory — copy vs rewrite

| Piece | Action |
|---|---|
| expert socket handlers | **Rewrite** against `packages/contract` |
| expert judge0 / supabase / env / socket-auth / auth plugin | **Copy ~verbatim** |
| room `page.tsx` top ~400 lines: `normalize*`, `formatValue`, `stripUnsafeHtmlToMarkdown`, starter-code/solution helpers | **Copy verbatim** (pure functions) |
| room + interviewee JSX/styling | **Copy**, re-wire to new hook |
| both `use-direct-interview-room.ts` hooks | **Rewrite** against contract; **fix the reconnect bug** (see §7) |
| room SQL + Prisma models | **Port** + add seed script |

---

## 6. Env / infra (identical stack)

Expert requires (see reference `apps/expert/src/lib/env.ts`):
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (required)
- `EXPERT_PORT` (default 3004), `EXPERT_HOST`, `FRONTEND_URL`, `COMPANY_FRONTEND_URL`
- Clients: `NEXT_PUBLIC_EXPERT_URL`, `NEXT_PUBLIC_ICE_SERVERS` (JSON array of RTCIceServer; defaults to Google STUN)
- Judge0 config (see `apps/expert/src/lib/judge0.ts`) — can be stubbed initially
- Socket.IO path in reference: `/expert/socket.io`

Infra: a Supabase project (auth + Postgres), Judge0 instance (stub first), optional TURN server for real cross-network video.

---

## 7. Known bug in the reference to fix during rebuild

**Room dies after any socket reconnect.** The clients' auto-join uses a one-shot `joinedRef`
that is never reset on disconnect, and `socket.on("connect")` does not re-emit `join-session`.
Since the server only puts a socket in the interview room via the `join-session` handler, a
transparent Socket.IO reconnect leaves the socket out of the room and all broadcasts stop.
**Fix:** reset the join guard on `disconnect`, or drive (re)join from the `connect` handler; also
add WebRTC renegotiation so A/V recovers if a peer reloads.

---

## 8. Execution order (de-risk hard parts first)

1. Scaffold repo + workspaces + `packages/contract` (freeze the event list above).
2. `packages/db`: Prisma models (§3) + seed script; port the room SQL.
3. expert backend: auth + room join/broadcast + bootstrap-from-DB. Prove two sockets share a room.
4. WebRTC A/V + screen-share signaling against stub pages (riskiest — do early).
5. Interviewer room: copy helpers + JSX, wire new hook.
6. Interviewee room: same.
7. Editor sync, timer, code-run (Judge0), evaluation.
8. Polish + apply the reconnect fix (§7).

---

## 9. Current status

- [x] Folder `C:\probe` created, this CLAUDE.md written.
- [x] Scaffold workspaces + `packages/contract` (frozen event map in `packages/contract/src/index.ts`).
- [x] `packages/db` Prisma schema (§3) + seed script (`prisma/seed.ts`, interview id `seed-interview`).
- [x] expert backend spine — auth (Supabase or dev-token fallback), `join-session` bootstrap-from-DB,
      admit/select-question/timer/editor/end/evaluation, and all A/V + screen signaling relays.
- [x] Install/typecheck clean; **DB pushed to Supabase via `prisma db push`** (no SQL files) and
      **seeded**. Live `join-session` verified: expert reads interview `seed-interview` from Supabase
      and returns the full bootstrap (role, both participants, both questions). Supabase project ref
      `knmjntwezicsextovsfz`; creds in repo-root `.env` + `packages/db/.env` (both gitignored).
- [x] expert `/ide/question/:id` endpoint added — problem panel loads real question data.
- [x] Signaling relay verified across two live clients (lobby-request → waiting → admit → room
      move → A/V offer relayed post-admit). Actual media (camera/screen pixels) still needs two real
      browsers to eyeball, but the WebRTC signaling path is proven.
- [x] interviewer UI ported + wired to `@probe/contract`; typechecks and `next build` passes.
      Route: `apps/interviewer/src/app/interview/[interviewId]/room/page.tsx`.
      Hook `use-interview-room.ts` is an ADAPTER — speaks contract (`interviewId`/`interviewee`)
      but exposes the original page-facing names (`directInterviewId`/`candidate`) so the ported
      JSX is unchanged. Reconnect fix (§7) IS included: rejoins on every socket `connect`.
      Local auth: `?token=seed-interviewer` (dev-token fallback). Question details fetched from
      expert `/ide/question/:id` (now built).
- [x] interviewee UI ported (`apps/interviewee`, :3000) — same recipe + support files as interviewer,
      dev token `seed-interviewee`. Typechecks and `next build` passes.
      NEW contract event `direct:lobby-state` (candidate waiting/admitted) added; expert now does the
      lobby→room transition on admit (moves waiting sockets into the room + re-bootstraps them).
      The adapter hook is shared verbatim by both apps (exposes both roles' functions).
- [x] Judge0 wired AND working — `direct:code-execute` runs `executePlainCode` (lib copied from
      reference) and broadcasts `execution-sync` running→completed to the whole room. Configured with
      the shared RapidAPI Judge0 CE key from practers (`.env`, gitignored). Verified live: `print(2+2)`
      → status "Accepted", stdout "4\n". Uses plain run (code+stdin), not the reference's per-test-case
      runner (sample_tests panel shows inputs but Run executes the raw buffer).
- [x] Client reconnect-rejoin fix (§7) shipped in the shared adapter hook (rejoins on every socket
      `connect`). REMAINING (all optional): WebRTC renegotiation so A/V recovers on peer reload;
      real Supabase login to replace the dev-token; a "create interview" UI (seed-only today).

_Core build is complete and verified. When resuming: to run/demo, see "STATUS: built & runnable" at
the top. To change behavior, read §0 to reopen the matching reference file first._

### Scaffold notes
- Package manager: **npm workspaces**. Names: `@probe/contract`, `@probe/db`, `@probe/expert`,
  `@probe/interviewer` (:3003), `@probe/interviewee` (:3000).
- `packages/contract` renamed the reference's `directInterviewId` → `interviewId`; events keep the
  `direct:` prefix to ease porting. Room name helper: `interview:<id>`.
- The reference room tables (manual SQL) are now Prisma models (`RoomSession`, `RoomParticipant`,
  `RoomEvent`, `RoomCodeSnapshot`, `RoomEvaluation`); FKs repoint to `interviews`.
- Ports: expert :3004 (socket path `/expert/socket.io`), interviewer :3003, interviewee :3000.
- Admission is persisted (`room_sessions.candidate_admitted_at`), so a candidate who already got
  admitted skips the lobby on re-join. Run `npm run db:reset` to return `seed-interview` to the
  lobby state for a fresh demo (only the DB changes; no expert restart needed, just reload tabs).

---

## 10. Interview setup flow — how interviews get created (reference) + pages to build NEXT

The **room** is done. The surrounding **"set up an interview" UI is the next build** (dashboards +
create/schedule form). Today interviews exist only via the seed script. Here's how the reference does
it and how to adapt it to Probe's two-role model.

### How the reference sets it up (interviewer/company side)
Reference: `apps/api/src/companies/direct-interviews.ts` (endpoints) and
`apps/company/src/components/direct-interviews/direct-interviews-workspace.tsx` (UI, 3802 lines, the
one we intentionally dropped). An interview does NOT start blank there — it **originates from the ATS**:
a job applicant advanced to the final-interview round becomes a `DirectInterview` row (jobId,
applicationId, jobRoundCandidateId, candidateUserId). The interviewer then configures it in two steps:

1. **Assign interviewer + questions** — `PATCH /companies/direct-interviews/:candidateId/interviewer`
   body `{ interviewerMemberId | SELF, questionSetIds[], questionIds[], notes }`. Server resolves the
   picks into a `questionPlan` JSON `{ setIds, questions[], notes }` stored on the interview.
2. **Schedule** — `PATCH /companies/direct-interviews/:candidateId/schedule`
   body `{ scheduledAt, timezone, durationMinutes (15–480, def 45), mode video|phone|onsite,
   meetingLink?, location?, notes? }` → status `scheduled` + notifies the candidate.
3. **Pickers** come from `GET /companies/direct-interviews/resources` (interviewers + question sets; admin-only).
4. **Readiness**: joinable when `scheduledAt` + an interviewer + ≥1 question all exist
   (workspace `isReady` / `canJoinDirectInterview`, ~lines 492–508). "Join" enables only in a window
   around `scheduledAt`, else shows "Schedule interview first". Join routes into the room.

### Probe adaptation (no ATS — creation IS the entry point)
Probe already stores questions as `InterviewQuestion` **rows** (cleaner than the reference's
`questionPlan` JSON) and the interviewee is just a `User(role=interviewee)`. So the ATS origin
collapses into a plain **create form**. Pages to build, all wrapping the existing
`/interview/[interviewId]/room`:

- **Interviewer dashboard** (`apps/interviewer` `/`, replaces the placeholder): list my interviews
  (upcoming / past) with status, a **Join** button (enable near `scheduledAt`), and evaluation status.
- **Create / edit interview**: pick an interviewee (`User` role=interviewee), pick questions from the
  **Question bank**, set `scheduledAt` + `durationMinutes` + interviewer notes. Writes an `Interview`
  row + `InterviewQuestion` rows.
- **Interviewee dashboard** (`apps/interviewee` `/`): "Scheduled" list of upcoming interviews + Join link.

**New REST endpoints to add to the expert service** (it already serves `/ide/question/:id`; reuse the
same Supabase/dev-token auth as the socket):
- `GET  /interviews` — list for the authed user, filtered by their role.
- `POST /interviews` — create `{ intervieweeId, questionIds[], scheduledAt, durationMinutes, notes }`.
- `PATCH /interviews/:id` — reschedule / change questions.
- `GET  /interviews/resources` — pickers: interviewee `User`s + Question-bank list.

**Explicitly NOT ported (ATS baggage — Probe has no applicant pipeline):**
- Candidate **history / applicant journey** (the reference's `GET …/:candidateId/context` +
  `journeyByApplicationId` timeline). Not needed — there is no application to trace.
- Application / candidate **score** from the ATS. The ONLY score in Probe is the post-interview
  **evaluation** score, which is already built and wired (`RoomEvaluation` table, `direct:evaluation-save`
  socket event, evaluation UI in both the room side-panel and the end screen). Don't reintroduce an
  applicant score.
- Job/application context, messaging threads, interviewer-assignment-by-team-member (in Probe the
  creator is simply the interviewer).

**Gotchas for the build:**
- Questions picked MUST exist in the `Question` table — the room's problem panel resolves full detail
  via `/ide/question/:id`. The seed only has 2 questions (`q-two-sum`, `q-reverse-ll`); a real picker
  needs the bank populated (extend the seed or add a question-import path).
- Port the reference readiness rule: joinable when `scheduledAt` set + ≥1 `InterviewQuestion`; consider
  a join window (e.g. enable from ~10 min before `scheduledAt`) like `canJoinDirectInterview`.
- The interviewer's dashboard replaces `apps/interviewer/src/app/page.tsx` (currently a placeholder).

---

## 11. Interview setup pages — BUILT (this is the §10 plan, now shipped)

The dashboards + create/edit form from §10 are built and verified end-to-end against the live DB.
Interviews are no longer seed-only — an interviewer creates them from the UI.

### REST endpoints (added to the expert service, same dev-token/Supabase auth as the socket)
All read the `Authorization: Bearer <token>` header via `requireUser()` in `apps/expert/src/index.ts`
(dev-token = raw user id; Supabase JWT when `SUPABASE_SERVICE_ROLE_KEY` is set).
- `GET  /me` — authed user's profile (id, name, email, role) — dashboards resolve role from this.
- `GET  /interviews` — `{ role, interviews[] }` filtered by the user's role (interviewer→owned, interviewee→theirs).
- `GET  /interviews/resources` — pickers `{ interviewees[], questions[] }` (interviewer-only).
- `POST /interviews` — create `{ intervieweeId, questionIds[], scheduledAt, durationMinutes, timezone?, notes?, candidateInstructions? }`
  → writes `Interview` + `InterviewQuestion` rows + a `RoomSession`. Clamps duration 15–480. Interviewer-only.
- `PATCH /interviews/:id` — reschedule / replace questions / change notes / set status (e.g. `cancelled`). Owner-only.

### Pages
- **Interviewer dashboard** — `apps/interviewer/src/app/page.tsx` (replaced the placeholder): upcoming/past
  lists, status + recommendation badges, **Join room** (gated by readiness), Edit, Cancel, **+ New interview**.
- **Create** — `apps/interviewer/src/app/new/page.tsx` + **Edit** — `apps/interviewer/src/app/interview/[interviewId]/edit/page.tsx`,
  both render the shared `components/interview-form.tsx` (interviewee picker, question-bank checklist, schedule, duration, notes).
- **Interviewee dashboard** — `apps/interviewee/src/app/page.tsx`: scheduled/past list + candidate instructions + **Join interview**.
- Shared client helpers: `lib/api.ts` (now has `post`/`patch` + response types + `interviewReadiness()` join-window rule)
  and `lib/format.ts` (schedule/relative-time/badge styling). `api.ts`/`format.ts` are copied verbatim into both apps.

### Readiness / join window (ports the reference `canJoinDirectInterview`)
`interviewReadiness()` in `lib/api.ts`: joinable when `scheduledAt` set + ≥1 question + within the window
(from 10 min before start, until start + duration + 30 min) + status not terminal. Join button is disabled otherwise
with the reason shown.

### Seed
`prisma/seed.ts` bank extended to 5 questions (added Valid Parentheses, Merge Intervals, LRU Cache) so the picker isn't trivial.

### Verified
All three services typecheck clean; `/me`, `/interviews`, `/interviews/resources`, `POST`, `PATCH` all exercised live
against Supabase; both dashboards + `/new` + `/edit` compile and return 200. Servers restarted (expert :3004,
interviewer :3003, interviewee :3000).

---

## 12. Probe copilot — BUILT (the pitch-deck differentiator, shipped 2026-07-19)

The AI layer from the pitch deck: reads the candidate's actual work live, checks it against a role rubric,
and tells the interviewer the one question to ask next. **Interviewer-only by design** — no copilot event or
score ever reaches the candidate. Verified end-to-end in two live rooms (naive O(n²) Two Sum with a wrong
"O(n log n)" comment → copilot card *"How does the O(n log n) comment match the two loops?"* citing lines 6-7).

### Pieces
- **LLM client** `apps/expert/src/lib/llm.ts` — JSON-mode via plain fetch, provider chain Gemini → xAI → Groq
  (env keys `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`; model overrides `GEMINI_MODEL`,
  `XAI_MODEL`, `GROQ_MODEL`). **Only the xAI key is currently valid** — the Gemini/Groq keys copied from
  practers were dead and are commented out in `.env`. Reasoning models need big `maxOutputTokens` (hidden
  thinking counts against the cap — this bit us; caps are now 4096/8192).
- **Engine** `apps/expert/src/lib/copilot.ts` — per-interview in-memory runtime (rubric, question context,
  latest code, run history, suggestion history). Triggers: editor-sync (candidate only, 7s idle debounce,
  20s min interval, ≥25-char delta), execution completion, question change, manual. Grounding rules live in
  `SUGGESTION_SYSTEM` / `SCORECARD_SYSTEM` prompts: cite exact lines, judge the work never the person,
  one question ≤25 words, `{"skip":true}` when nothing is worth asking, unknown when never exercised.
  Every analysis is logged to `room_events` (`copilot_analysis` / `copilot_suggestion` / `copilot_scorecard`).
- **Rubric ("role pack")** — `InterviewRubric` Prisma model; generated from `roleTitle`+`jdText` on interview
  create/edit (fire-and-forget) or `POST /interviews/:id/rubric`; deterministic 6-item fallback when no LLM.
  Seed gives `seed-interview` a manual Backend-SWE rubric so the demo works instantly.
- **Scorecard** — `CopilotScorecard` model; auto-drafted on `direct:end-session` (background) and on demand via
  `direct:copilot-scorecard`; strong/mixed/thin/unknown per rubric row, each verdict evidence-cited; rendered by
  `ScorecardView` on the interviewer end screen with "Use as evaluation draft" (prefills strengths/concerns/notes).
- **Per-test run/submit** — `executeAgainstTests` in `judge0.ts` runs each bank `sampleTests` case (sequential,
  early-exit on compile error) and compares trimmed outputs. `ExecutionResult` gained `tests[]`/`passedCount`/
  `totalCount`; `stdout` carries the practers-shaped `{sample:{tests,summary}}` JSON so the ported room output
  formatter renders per-case output unchanged. Both room UIs show a passed badge + red/green case dots.
- **Contract** — C→S `direct:copilot-analyze`, `direct:copilot-scorecard`; S→C `direct:copilot-suggestion`,
  `direct:copilot-status`, `direct:copilot-scorecard` (delivered to `userRoom(interviewerId)` only).
  REST: `GET /interviews/:id/copilot` (hydration: rubric+suggestions+scorecard), `POST /interviews/:id/rubric`.
- **UI** — `apps/interviewer/src/components/copilot.tsx` (`CopilotPanel` in the room's right panel: ASK-THIS-NEXT
  card with evidence excerpt/lines/rubric chip/confidence, history, role-pack viewer, "Suggest a question now";
  `ScorecardView` on the end screen). Role/JD fields in `interview-form.tsx`. The shared room hook gained
  copilot state/actions and stays byte-identical between both apps.

### Gotchas
- Copilot runtime (run history) is in-memory; a server restart keeps code snapshots + suggestions (DB) but
  loses run summaries — the scorecard then honestly reports items as unknown rather than inventing.
- Port 3000 clash: if another project holds :3000, run the candidate app with
  `npm run dev:alt --workspace @probe/interviewee` (:3005) — `NEXT_PUBLIC_APP_URL` in `.env` whitelists that
  origin in the expert's CORS. Restart the expert after `.env` changes.
- Voice signal, SQL editor, and design canvas from the deck are NOT built — IDE + runs are the MVP surfaces.
