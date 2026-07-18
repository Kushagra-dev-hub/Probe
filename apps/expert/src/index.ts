import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "socket.io";
import { prisma } from "@probe/db";
import {
  SOCKET_PATH,
  roomName,
  userRoom,
  lobbyName,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type RoomBootstrap,
  type Role,
  type ExecutionState,
} from "@probe/contract";
import { getExpertConfig } from "./lib/env.js";
import { authenticateToken, type AuthedUser } from "./lib/socket-auth.js";
import { executePlainCode } from "./lib/judge0.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const config = getExpertConfig();

const app = Fastify({ logger: true });
await app.register(cors, { origin: config.allowedOrigins, credentials: true });

app.get("/health", async () => ({ ok: true, service: "expert" }));

/* ------------------------------------------------------------------ *
 * REST auth — the dashboards/create-form hit these over HTTP. Reuse the
 * exact same token resolution as the socket (Bearer header -> user id in
 * dev-token mode, or Supabase JWT when SUPABASE_SERVICE_ROLE_KEY is set).
 * ------------------------------------------------------------------ */
async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<AuthedUser | null> {
  const header = req.headers.authorization ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : undefined;
  const user = await authenticateToken(token);
  if (!user) {
    reply.code(401).send({ message: "Unauthorized." });
    return null;
  }
  return user;
}

// A user's profile (resolves role + display name for the dashboards).
app.get("/me", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const user = await prisma.user.findUnique({ where: { id: authed.id } });
  if (!user) return reply.code(404).send({ message: "User not found." });
  return { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl, username: user.username };
});

/* ------------------------------------------------------------------ *
 * Interview list / create / edit — the "set up an interview" surface.
 * ------------------------------------------------------------------ */

// Shape one interview row for a dashboard card.
function serializeInterviewSummary(i: {
  id: string;
  status: string;
  scheduledAt: Date | null;
  timezone: string | null;
  durationMinutes: number;
  startedAt: Date | null;
  endedAt: Date | null;
  interviewerNotes: string | null;
  candidateInstructions: string | null;
  interviewer: { id: string; name: string; email: string | null };
  interviewee: { id: string; name: string; email: string | null; avatarUrl: string | null };
  questions: { id: string; questionId: string | null; text: string; difficulty: string | null; order: number }[];
  evaluation: { score: number | null; recommendation: string } | null;
}) {
  return {
    id: i.id,
    status: i.status,
    scheduledAt: i.scheduledAt?.toISOString() ?? null,
    timezone: i.timezone,
    durationMinutes: i.durationMinutes,
    startedAt: i.startedAt?.toISOString() ?? null,
    endedAt: i.endedAt?.toISOString() ?? null,
    interviewerNotes: i.interviewerNotes,
    candidateInstructions: i.candidateInstructions,
    interviewer: i.interviewer,
    interviewee: i.interviewee,
    questions: i.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ id: q.id, questionId: q.questionId, text: q.text, difficulty: q.difficulty, order: q.order })),
    questionCount: i.questions.length,
    evaluation: i.evaluation ? { score: i.evaluation.score, recommendation: i.evaluation.recommendation } : null,
  };
}

const interviewInclude = {
  interviewer: { select: { id: true, name: true, email: true } },
  interviewee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  questions: { orderBy: { order: "asc" } as const },
  evaluation: { select: { score: true, recommendation: true } },
} as const;

// List interviews for the authed user, filtered by their role.
app.get("/interviews", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const user = await prisma.user.findUnique({ where: { id: authed.id } });
  if (!user) return reply.code(404).send({ message: "User not found." });

  const where = user.role === "interviewer" ? { interviewerId: user.id } : { intervieweeId: user.id };
  const interviews = await prisma.interview.findMany({
    where,
    include: interviewInclude,
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
  });
  return { role: user.role, interviews: interviews.map(serializeInterviewSummary) };
});

// Pickers for the create form: interviewees + the question bank. Interviewer-only.
app.get("/interviews/resources", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const user = await prisma.user.findUnique({ where: { id: authed.id } });
  if (!user || user.role !== "interviewer") return reply.code(403).send({ message: "Interviewer access required." });

  const [interviewees, questions] = await Promise.all([
    prisma.user.findMany({ where: { role: "interviewee" }, select: { id: true, name: true, email: true, avatarUrl: true }, orderBy: { name: "asc" } }),
    prisma.question.findMany({ select: { id: true, title: true, difficulty: true, language: true }, orderBy: { title: "asc" } }),
  ]);
  return { interviewees, questions };
});

// Create an interview + its question rows. Interviewer-only.
app.post<{ Body: { intervieweeId?: string; questionIds?: string[]; scheduledAt?: string; durationMinutes?: number; timezone?: string; notes?: string; candidateInstructions?: string } }>(
  "/interviews",
  async (req, reply) => {
    const authed = await requireUser(req, reply);
    if (!authed) return;
    const user = await prisma.user.findUnique({ where: { id: authed.id } });
    if (!user || user.role !== "interviewer") return reply.code(403).send({ message: "Interviewer access required." });

    const { intervieweeId, questionIds = [], scheduledAt, durationMinutes = 60, timezone, notes, candidateInstructions } = req.body ?? {};
    if (!intervieweeId) return reply.code(400).send({ message: "An interviewee is required." });
    if (!Array.isArray(questionIds) || questionIds.length === 0) return reply.code(400).send({ message: "Pick at least one question." });

    const interviewee = await prisma.user.findFirst({ where: { id: intervieweeId, role: "interviewee" } });
    if (!interviewee) return reply.code(400).send({ message: "Unknown interviewee." });

    const bank = await prisma.question.findMany({ where: { id: { in: questionIds } } });
    const byId = new Map(bank.map((q) => [q.id, q]));
    const ordered = questionIds.filter((id) => byId.has(id));
    if (ordered.length === 0) return reply.code(400).send({ message: "None of the picked questions exist in the bank." });

    const duration = Math.min(480, Math.max(15, Number(durationMinutes) || 60));

    const interview = await prisma.interview.create({
      data: {
        interviewerId: user.id,
        intervieweeId,
        status: "scheduled",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        timezone: timezone ?? null,
        durationMinutes: duration,
        interviewerNotes: notes ?? null,
        candidateInstructions: candidateInstructions ?? null,
        questions: {
          create: ordered.map((id, idx) => {
            const q = byId.get(id)!;
            return { questionId: q.id, text: q.title, difficulty: q.difficulty, source: "bank", order: idx };
          }),
        },
        roomSession: { create: { status: "scheduled" } },
      },
      include: interviewInclude,
    });

    return reply.code(201).send(serializeInterviewSummary(interview));
  }
);

// Edit an interview (reschedule / change questions / notes). Interviewer-only, owner-only.
app.patch<{ Params: { id: string }; Body: { questionIds?: string[]; scheduledAt?: string | null; durationMinutes?: number; timezone?: string; notes?: string; candidateInstructions?: string; status?: string } }>(
  "/interviews/:id",
  async (req, reply) => {
    const authed = await requireUser(req, reply);
    if (!authed) return;
    const existing = await prisma.interview.findUnique({ where: { id: req.params.id } });
    if (!existing) return reply.code(404).send({ message: "Interview not found." });
    if (existing.interviewerId !== authed.id) return reply.code(403).send({ message: "Only the assigned interviewer can edit." });

    const { questionIds, scheduledAt, durationMinutes, timezone, notes, candidateInstructions, status } = req.body ?? {};

    const data: Record<string, unknown> = {};
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (durationMinutes !== undefined) data.durationMinutes = Math.min(480, Math.max(15, Number(durationMinutes) || 60));
    if (timezone !== undefined) data.timezone = timezone;
    if (notes !== undefined) data.interviewerNotes = notes;
    if (candidateInstructions !== undefined) data.candidateInstructions = candidateInstructions;
    if (status !== undefined) data.status = status;

    await prisma.interview.update({ where: { id: existing.id }, data });

    // Replace question set if provided.
    if (Array.isArray(questionIds)) {
      const bank = await prisma.question.findMany({ where: { id: { in: questionIds } } });
      const byId = new Map(bank.map((q) => [q.id, q]));
      const ordered = questionIds.filter((id) => byId.has(id));
      await prisma.interviewQuestion.deleteMany({ where: { interviewId: existing.id } });
      if (ordered.length > 0) {
        await prisma.interviewQuestion.createMany({
          data: ordered.map((id, idx) => {
            const q = byId.get(id)!;
            return { interviewId: existing.id, questionId: q.id, text: q.title, difficulty: q.difficulty, source: "bank", order: idx };
          }),
        });
      }
    }

    const fresh = await prisma.interview.findUnique({ where: { id: existing.id }, include: interviewInclude });
    return serializeInterviewSummary(fresh!);
  }
);

// Question details for the room's problem panel (maps the bank Question -> the
// shape the room page expects, exposing both snake_case and camelCase keys).
app.get<{ Params: { id: string } }>("/ide/question/:id", async (req, reply) => {
  const q = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!q) return reply.code(404).send({ message: "Question not found." });
  return {
    id: q.id,
    title: q.title,
    statement: q.statement,
    description: q.description,
    language: q.language,
    difficulty: q.difficulty,
    examples: q.examples,
    constraints: q.constraints,
    starter_code: q.starterCode,
    starterCode: q.starterCode,
    codeSnippets: q.codeSnippets,
    hints: q.hints,
    solution: q.solution,
    sample_tests: q.sampleTests,
  };
});

type SocketData = { user: AuthedUser; interviewId?: string; role?: Role };

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(app.server, {
  path: SOCKET_PATH,
  cors: { origin: config.allowedOrigins, credentials: true },
  transports: ["websocket", "polling"],
});

/* ------------------------------------------------------------------ *
 * Bootstrap: resolve an interview + participants + questions for a role.
 * ------------------------------------------------------------------ */
async function buildBootstrap(
  interviewId: string,
  user: AuthedUser
): Promise<{ bootstrap: RoomBootstrap; role: Role } | null> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: {
      interviewer: true,
      interviewee: true,
      questions: { orderBy: { order: "asc" } },
      roomSession: { include: { snapshots: { orderBy: { updatedAt: "desc" }, take: 1 } } },
    },
  });
  if (!interview) return null;

  const role: Role | null =
    interview.interviewerId === user.id
      ? "interviewer"
      : interview.intervieweeId === user.id
        ? "interviewee"
        : null;
  if (!role) return null;

  // Ensure a room session exists.
  const roomSession =
    interview.roomSession ??
    (await prisma.roomSession.create({ data: { interviewId, status: "scheduled" } }));

  const snapshot = interview.roomSession?.snapshots[0] ?? null;

  const bootstrap: RoomBootstrap = {
    interviewId: interview.id,
    roomSessionId: roomSession.id,
    role,
    status: interview.status,
    scheduledAt: interview.scheduledAt?.toISOString() ?? null,
    timezone: interview.timezone,
    durationMinutes: interview.durationMinutes,
    startedAt: interview.startedAt?.toISOString() ?? null,
    endedAt: interview.endedAt?.toISOString() ?? null,
    candidateAdmittedAt: roomSession.candidateAdmittedAt?.toISOString() ?? null,
    candidateInstructions: interview.candidateInstructions,
    interviewerNotes: role === "interviewer" ? interview.interviewerNotes : null,
    activeQuestionId: roomSession.activeQuestionId,
    activeQuestionIndex: roomSession.activeQuestionIndex,
    editorState: snapshot
      ? {
          interviewId,
          roomSessionId: roomSession.id,
          questionId: snapshot.questionId,
          language: snapshot.language,
          code: snapshot.code,
          revision: snapshot.revision,
          updatedByUserId: snapshot.updatedByUserId ?? "",
          updatedAt: snapshot.updatedAt.toISOString(),
        }
      : null,
    questions: interview.questions.map((q) => ({
      id: q.id,
      questionId: q.questionId,
      text: q.text,
      setTitle: q.setTitle,
      type: q.type,
      source: q.source,
      difficulty: q.difficulty,
    })),
    interviewee: {
      id: interview.interviewee.id,
      name: interview.interviewee.name,
      email: interview.interviewee.email,
      avatarUrl: interview.interviewee.avatarUrl,
      username: interview.interviewee.username,
    },
    interviewer: {
      memberId: interview.interviewer.id,
      name: interview.interviewer.name,
      email: interview.interviewer.email,
    },
    permissions: {
      canAdmitCandidate: role === "interviewer",
      canRunCode: true,
      canEditCode: role === "interviewee",
    },
  };

  return { bootstrap, role };
}

/* ------------------------------------------------------------------ *
 * Socket lifecycle.
 * ------------------------------------------------------------------ */
io.use(async (socket, next) => {
  const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
  const user = await authenticateToken(token);
  if (!user) return next(new Error("Unauthorized"));
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const user = socket.data.user as AuthedUser;
  socket.join(userRoom(user.id));

  // NOTE: the interview room is (re)joined here on every (re)connect via join-session.
  socket.on("direct:join-session", async ({ interviewId }, ack) => {
    const result = await buildBootstrap(interviewId, user).catch(() => null);
    if (!result) {
      ack?.({ ok: false, message: "Interview not found or access denied." });
      return;
    }
    socket.data.interviewId = interviewId;
    socket.data.role = result.role;

    if (result.role === "interviewer") {
      socket.join(roomName(interviewId));
      // The interviewer may open the room AFTER the candidate is already waiting
      // (or reload). The one-shot lobby-request broadcast fired before they were in
      // the room, so re-scan the lobby now and surface any waiting candidate to them.
      if (!result.bootstrap.candidateAdmittedAt) {
        const waiting = await io.in(lobbyName(interviewId)).fetchSockets();
        if (waiting.length > 0) {
          socket.emit("direct:lobby-request", {
            interviewId,
            candidate: {
              id: result.bootstrap.interviewee.id,
              name: result.bootstrap.interviewee.name,
              avatarUrl: result.bootstrap.interviewee.avatarUrl,
            },
          });
        }
      }
    } else if (result.bootstrap.candidateAdmittedAt) {
      // Already admitted — go straight into the room.
      socket.join(roomName(interviewId));
      socket.emit("direct:lobby-state", { interviewId, state: "admitted", message: "You have been admitted to the interview." });
    } else {
      // Waiting in the lobby until the interviewer admits.
      socket.join(lobbyName(interviewId));
      socket.emit("direct:lobby-state", { interviewId, state: "waiting", message: "Waiting for the interviewer to admit you." });
      io.to(roomName(interviewId)).emit("direct:lobby-request", {
        interviewId,
        candidate: {
          id: result.bootstrap.interviewee.id,
          name: result.bootstrap.interviewee.name,
          avatarUrl: result.bootstrap.interviewee.avatarUrl,
        },
      });
    }
    ack?.({ ok: true, data: result.bootstrap });
  });

  socket.on("direct:admit-candidate", async ({ interviewId }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Only the interviewer can admit." });
    const session = await prisma.roomSession.update({
      where: { interviewId },
      data: { candidateAdmittedAt: new Date(), status: "active" },
    });

    // Move any waiting candidate sockets from the lobby into the room, then
    // notify them they're admitted and hand them a fresh bootstrap.
    const lobbySockets = await io.in(lobbyName(interviewId)).fetchSockets();
    for (const ls of lobbySockets) {
      ls.leave(lobbyName(interviewId));
      ls.join(roomName(interviewId));
      ls.emit("direct:lobby-state", { interviewId, state: "admitted", message: "You have been admitted to the interview." });
      const candidateUserId = ls.data.user?.id;
      if (typeof candidateUserId === "string") {
        const candidateBootstrap = await buildBootstrap(interviewId, { id: candidateUserId, email: null });
        if (candidateBootstrap) ls.emit("direct:bootstrap", candidateBootstrap.bootstrap);
      }
    }

    const result = await buildBootstrap(interviewId, user);
    if (result) io.to(roomName(interviewId)).emit("direct:session-state", {
      interviewId,
      roomSessionId: session.id,
      status: session.status as RoomBootstrap["status"],
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      candidateAdmittedAt: session.candidateAdmittedAt?.toISOString() ?? null,
      activeQuestionId: session.activeQuestionId,
      activeQuestionIndex: session.activeQuestionIndex,
    });
    ack?.({ ok: true, data: result?.bootstrap });
  });

  socket.on("direct:select-question", async ({ interviewId, questionId }, ack) => {
    const interview = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    const index = interview?.questions.findIndex((q) => q.id === questionId) ?? -1;
    const session = await prisma.roomSession.update({
      where: { interviewId },
      data: { activeQuestionId: questionId, activeQuestionIndex: index < 0 ? 0 : index, activeQuestionRevealedAt: new Date() },
    });
    io.to(roomName(interviewId)).emit("direct:session-state", {
      interviewId,
      roomSessionId: session.id,
      status: session.status as RoomBootstrap["status"],
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      candidateAdmittedAt: session.candidateAdmittedAt?.toISOString() ?? null,
      activeQuestionId: session.activeQuestionId,
      activeQuestionIndex: session.activeQuestionIndex,
    });
    ack?.({ ok: true });
  });

  socket.on("direct:editor-sync", async ({ interviewId, questionId, language, code, revision }) => {
    const session = await prisma.roomSession.findUnique({ where: { interviewId } });
    if (!session) return;
    await prisma.roomCodeSnapshot.create({
      data: { roomSessionId: session.id, interviewId, questionId: questionId ?? null, language, code, revision: revision ?? 0, updatedByUserId: user.id },
    });
    socket.to(roomName(interviewId)).emit("direct:editor-state", {
      interviewId,
      roomSessionId: session.id,
      questionId: questionId ?? null,
      language,
      code,
      revision: revision ?? 0,
      updatedByUserId: user.id,
      updatedAt: new Date().toISOString(),
    });
  });

  socket.on("direct:timer-sync", async ({ interviewId, elapsedSeconds, totalSeconds }) => {
    const session = await prisma.roomSession.findUnique({ where: { interviewId } });
    if (!session) return;
    io.to(roomName(interviewId)).emit("direct:timer-sync", {
      interviewId,
      roomSessionId: session.id,
      elapsedSeconds,
      totalSeconds: totalSeconds ?? 0,
      syncedAt: new Date().toISOString(),
    });
  });

  socket.on("direct:end-session", async ({ interviewId, reason }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Only the interviewer can end." });
    const endedAt = new Date();
    const session = await prisma.roomSession.update({ where: { interviewId }, data: { status: "completed", endedAt } });
    await prisma.interview.update({ where: { id: interviewId }, data: { status: "completed", endedAt } });
    io.to(roomName(interviewId)).emit("direct:session-ended", {
      interviewId,
      roomSessionId: session.id,
      reason,
      endedAt: endedAt.toISOString(),
    });
    ack?.({ ok: true });
  });

  socket.on("direct:evaluation-save", async ({ interviewId, score, recommendation, strengths, concerns, notes }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Only the interviewer can evaluate." });
    const session = await prisma.roomSession.findUnique({ where: { interviewId } });
    if (!session) return ack?.({ ok: false, message: "No room session." });
    const evaluation = await prisma.roomEvaluation.upsert({
      where: { interviewId },
      update: { score: score ?? null, recommendation, strengths: strengths ?? [], concerns: concerns ?? [], notes: notes ?? null },
      create: { interviewId, roomSessionId: session.id, interviewerUserId: user.id, score: score ?? null, recommendation, strengths: strengths ?? [], concerns: concerns ?? [], notes: notes ?? null },
    });
    const payload = {
      id: evaluation.id,
      score: evaluation.score,
      recommendation: evaluation.recommendation,
      strengths: evaluation.strengths,
      concerns: evaluation.concerns,
      notes: evaluation.notes,
      updatedAt: evaluation.updatedAt.toISOString(),
    };
    io.to(roomName(interviewId)).emit("direct:evaluation-saved", payload);
    ack?.({ ok: true, data: payload });
  });

  socket.on("direct:code-execute", async (p, ack) => {
    const session = await prisma.roomSession.findUnique({ where: { interviewId: p.interviewId } });
    if (!session) return ack?.({ ok: false, message: "No room session." });

    const mode = p.mode ?? "run";
    const base = {
      interviewId: p.interviewId,
      roomSessionId: session.id,
      mode,
      questionId: p.questionId ?? session.activeQuestionId ?? null,
      startedByUserId: user.id,
      startedByRole: (socket.data.role ?? "interviewer") as Role,
      language: p.language,
    };

    const running: ExecutionState = { ...base, phase: "running", result: null, executionError: null, executionId: null, updatedAt: new Date().toISOString() };
    io.to(roomName(p.interviewId)).emit("direct:execution-sync", running);

    try {
      const result = await executePlainCode({ code: p.code, language: p.language, stdin: p.stdin ?? null });
      const completed: ExecutionState = { ...base, phase: "completed", result, executionError: null, updatedAt: new Date().toISOString() };
      io.to(roomName(p.interviewId)).emit("direct:execution-sync", completed);
      ack?.({ ok: true, data: completed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Code execution failed.";
      const failed: ExecutionState = { ...base, phase: "completed", result: null, executionError: message, updatedAt: new Date().toISOString() };
      io.to(roomName(p.interviewId)).emit("direct:execution-sync", failed);
      ack?.({ ok: false, message });
    }
  });

  /* --- WebRTC A/V + screen-share signaling relays (broadcast to the peer) --- */
  socket.on("direct:signal-offer", (p) => socket.to(roomName(p.interviewId)).emit("direct:signal-offer", p));
  socket.on("direct:signal-answer", (p) => socket.to(roomName(p.interviewId)).emit("direct:signal-answer", p));
  socket.on("direct:signal-ice", (p) => socket.to(roomName(p.interviewId)).emit("direct:signal-ice", p));

  socket.on("direct:request-screen-share", (p) => socket.to(roomName(p.interviewId)).emit("direct:screen-share-requested", p));
  socket.on("direct:screen-share-state", (p) => socket.to(roomName(p.interviewId)).emit("direct:screen-share-state", p));
  socket.on("direct:screen-offer", (p) => socket.to(roomName(p.interviewId)).emit("direct:screen-offer", p));
  socket.on("direct:screen-answer", (p) => socket.to(roomName(p.interviewId)).emit("direct:screen-answer", p));
  socket.on("direct:screen-ice", (p) => socket.to(roomName(p.interviewId)).emit("direct:screen-ice", p));

  socket.on("disconnect", () => {
    // Room membership drops with the socket; clients re-emit join-session on reconnect.
    void lobbyName; // reserved for future lobby routing
  });
});

const address = await app.listen({ host: config.host, port: config.port });
app.log.info(`expert listening on ${address} (socket path ${SOCKET_PATH})`);
