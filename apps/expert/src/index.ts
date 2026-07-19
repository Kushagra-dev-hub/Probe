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
import { authenticateToken, issueLocalToken, type AuthedUser } from "./lib/socket-auth.js";
import { hashPassword, verifyPassword } from "./lib/passwords.js";
import { randomBytes } from "node:crypto";
import { executePlainCode, executeAgainstTests, executeSql, extractSampleTests } from "./lib/judge0.js";
import { listBankQuestions, getBankQuestion, pickRandomBankQuestions, type BankRound } from "./lib/bank.js";
import { createRequire } from "node:module";
import { mkdirSync, createWriteStream } from "node:fs";
import { writeFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import multipart from "@fastify/multipart";
import {
  initCopilot,
  analyze as copilotAnalyze,
  generateRubric,
  generateScorecard,
  getRubric,
  getScorecard,
  getRecentSuggestions,
  noteEditorSync,
  noteExecution,
  noteQuestionChange,
  noteSurfaceChange,
  noteTranscript,
  forceFinalizeAnswer,
  analyzeResume,
  getRecentInsights,
} from "./lib/copilot.js";
import type { FastifyReply, FastifyRequest } from "fastify";

const config = getExpertConfig();

const app = Fastify({ logger: true });
await app.register(cors, { origin: config.allowedOrigins, credentials: true });
await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

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

/* ------------------------------------------------------------------ *
 * Local email/password auth (hackathon-grade, no external provider).
 * Issues a signed session token the socket + REST layers both accept.
 * ------------------------------------------------------------------ */

function serializeAuthUser(u: { id: string; name: string; email: string | null; role: string; avatarUrl: string | null; username: string | null }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatarUrl: u.avatarUrl, username: u.username };
}

app.post<{ Body: { name?: string; email?: string; password?: string; role?: string } }>("/auth/signup", async (req, reply) => {
  const { name, email, password, role } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return reply.code(400).send({ message: "Name, email, and a password of 6+ characters are required." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing?.passwordHash) return reply.code(409).send({ message: "An account with this email already exists — log in instead." });

  const userRole = role === "interviewee" ? "interviewee" : "interviewer";
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { name: name.trim(), passwordHash: hashPassword(password) } })
    : await prisma.user.create({
        data: { name: name.trim(), email: normalizedEmail, passwordHash: hashPassword(password), role: userRole },
      });
  return reply.code(201).send({ token: issueLocalToken(user.id), user: serializeAuthUser(user) });
});

app.post<{ Body: { email?: string; password?: string } }>("/auth/login", async (req, reply) => {
  const { email, password } = req.body ?? {};
  if (!email?.trim() || !password) return reply.code(400).send({ message: "Email and password are required." });
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return reply.code(401).send({ message: "Invalid email or password." });
  }
  return { token: issueLocalToken(user.id), user: serializeAuthUser(user) };
});

/* ------------------------------------------------------------------ *
 * Candidate join links (public — the shareToken IS the credential).
 * GET  /join/:shareToken          -> interview info for the instructions page
 * POST /join/:shareToken/resume   -> resume upload (PDF/DOCX), parsed + analyzed
 * ------------------------------------------------------------------ */

const requireCjs = createRequire(import.meta.url);

async function extractResumeText(fileName: string, buffer: Buffer): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    // pdf-parse is CJS-only (practers loads it the same way).
    const pdfParse = requireCjs("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text ?? "";
  }
  if (lower.endsWith(".docx")) {
    const mammoth = requireCjs("mammoth") as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }
  throw new Error("Only PDF and DOCX resumes are supported.");
}

async function findInterviewByShareToken(shareToken: string) {
  if (!shareToken || shareToken.length < 8) return null;
  return prisma.interview.findUnique({
    where: { shareToken },
    include: {
      interviewer: { select: { name: true } },
      interviewee: { select: { id: true, name: true, email: true } },
      roomSession: { select: { candidateAdmittedAt: true, status: true } },
    },
  });
}

app.get<{ Params: { shareToken: string } }>("/join/:shareToken", async (req, reply) => {
  const interview = await findInterviewByShareToken(req.params.shareToken);
  if (!interview) return reply.code(404).send({ message: "This interview link is invalid or has been removed." });
  return {
    interviewId: interview.id,
    status: interview.status,
    scheduledAt: interview.scheduledAt?.toISOString() ?? null,
    timezone: interview.timezone,
    durationMinutes: interview.durationMinutes,
    rounds: interview.rounds,
    companyName: interview.companyName,
    roleTitle: interview.roleTitle,
    experienceLevel: interview.experienceLevel,
    candidateInstructions: interview.candidateInstructions,
    interviewerName: interview.interviewer.name,
    candidate: { name: interview.interviewee.name, email: interview.interviewee.email },
    resumeUploaded: Boolean(interview.resumeFileName),
    admitted: Boolean(interview.roomSession?.candidateAdmittedAt),
    // The shareToken doubles as the candidate's socket/REST credential.
    candidateToken: interview.shareToken,
  };
});

app.post<{ Params: { shareToken: string } }>("/join/:shareToken/resume", async (req, reply) => {
  const interview = await findInterviewByShareToken(req.params.shareToken);
  if (!interview) return reply.code(404).send({ message: "This interview link is invalid." });

  const file = await req.file();
  if (!file) return reply.code(400).send({ message: "Attach a resume file." });
  const fileName = file.filename || "resume.pdf";
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
    return reply.code(400).send({ message: "Only PDF and DOCX resumes are supported." });
  }

  const buffer = await file.toBuffer();
  let text = "";
  try {
    text = (await extractResumeText(fileName, buffer)).trim();
  } catch (err) {
    return reply.code(400).send({ message: err instanceof Error ? err.message : "Could not read the resume." });
  }
  if (!text || text.length < 40) {
    return reply.code(400).send({ message: "Could not extract readable text from that file — try a different export." });
  }

  const safeName = `${interview.id}-${Date.now()}-${fileName.replace(/[^\w.-]+/g, "_")}`;
  await writeFile(path.join(UPLOAD_DIR, safeName), buffer);

  await prisma.interview.update({
    where: { id: interview.id },
    data: { resumeFileName: fileName, resumeText: text.slice(0, 60_000), resumeUploadedAt: new Date() },
  });

  // Analyze in the background; the interviewer gets a live push when it's done.
  void analyzeResume(interview.id).catch((err) => app.log.warn({ err }, "resume analysis failed"));

  return { ok: true, fileName };
});

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
  rounds: string[];
  shareToken: string | null;
  companyName: string | null;
  roleTitle: string | null;
  experienceLevel: string | null;
  resumeFileName: string | null;
  resumeUploadedAt: Date | null;
  interviewer: { id: string; name: string; email: string | null };
  interviewee: { id: string; name: string; email: string | null; avatarUrl: string | null };
  questions: { id: string; questionId: string | null; text: string; difficulty: string | null; order: number; type?: string | null }[];
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
    rounds: i.rounds ?? [],
    shareToken: i.shareToken,
    roleTitle: i.roleTitle,
    companyName: i.companyName,
    experienceLevel: i.experienceLevel,
    resume: i.resumeFileName ? { fileName: i.resumeFileName, uploadedAt: i.resumeUploadedAt?.toISOString() ?? null } : null,
    interviewer: i.interviewer,
    interviewee: i.interviewee,
    questions: i.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ id: q.id, questionId: q.questionId, text: q.text, difficulty: q.difficulty, order: q.order, type: q.type ?? null })),
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

const VALID_ROUNDS = new Set(["dsa", "sql", "design"]);

/** Attach a couple of bank questions per round so the room has real content immediately. */
async function attachRoundQuestions(interviewId: string, rounds: string[]) {
  let order = await prisma.interviewQuestion.count({ where: { interviewId } });
  for (const round of rounds) {
    if (round === "design") {
      const picks = await pickRandomBankQuestions("design", 1).catch(() => []);
      for (const p of picks) {
        await prisma.interviewQuestion.create({
          data: { interviewId, questionId: p.id, text: p.title, difficulty: p.difficulty, type: "design", source: "mongo", order: order++ },
        });
      }
      continue;
    }
    const picks = await pickRandomBankQuestions(round as "dsa" | "sql", 2).catch(() => []);
    for (const p of picks) {
      await prisma.interviewQuestion.create({
        data: { interviewId, questionId: p.id, text: p.title, difficulty: p.difficulty, type: round, source: "mongo", order: order++ },
      });
    }
  }
  // Mongo unreachable → fall back to the Postgres seed bank for the DSA round.
  if (order === 0 && rounds.includes("dsa")) {
    const seedBank = await prisma.question.findMany({ take: 2 });
    for (const q of seedBank) {
      await prisma.interviewQuestion.create({
        data: { interviewId, questionId: q.id, text: q.title, difficulty: q.difficulty, type: "dsa", source: "bank", order: order++ },
      });
    }
  }
}

// Create an interview from candidate details. Interviewer-only. Generates the
// shareable candidate link (shareToken) and auto-attaches bank questions per round.
app.post<{
  Body: {
    candidateName?: string;
    candidateEmail?: string;
    companyName?: string;
    roleTitle?: string;
    experienceLevel?: string;
    rounds?: string[];
    scheduledAt?: string;
    durationMinutes?: number;
    timezone?: string;
    notes?: string;
    candidateInstructions?: string;
    jdText?: string;
    // Legacy shape (old create form) still accepted:
    intervieweeId?: string;
    questionIds?: string[];
  };
}>("/interviews", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const user = await prisma.user.findUnique({ where: { id: authed.id } });
  if (!user || user.role !== "interviewer") return reply.code(403).send({ message: "Interviewer access required." });

  const body = req.body ?? {};
  const {
    candidateName,
    candidateEmail,
    companyName,
    roleTitle,
    experienceLevel,
    scheduledAt,
    durationMinutes = 60,
    timezone,
    notes,
    candidateInstructions,
    jdText,
    intervieweeId,
    questionIds = [],
  } = body;
  const rounds = Array.isArray(body.rounds) ? body.rounds.filter((r) => VALID_ROUNDS.has(r)) : [];

  // Resolve the interviewee: by explicit id (legacy) or by candidate email (new flow).
  let interviewee = intervieweeId ? await prisma.user.findFirst({ where: { id: intervieweeId, role: "interviewee" } }) : null;
  if (!interviewee) {
    if (!candidateEmail?.trim() || !candidateName?.trim()) {
      return reply.code(400).send({ message: "Candidate name and email are required." });
    }
    const email = candidateEmail.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    interviewee =
      existing ??
      (await prisma.user.create({ data: { name: candidateName.trim(), email, role: "interviewee" } }));
    if (existing && existing.role !== "interviewee") {
      return reply.code(400).send({ message: "That email belongs to an interviewer account." });
    }
  }
  if (rounds.length === 0 && questionIds.length === 0) {
    return reply.code(400).send({ message: "Pick at least one interview round." });
  }

  const duration = Math.min(480, Math.max(15, Number(durationMinutes) || 60));
  const shareToken = `iv_${randomBytes(16).toString("hex")}`;

  // Legacy explicit question picks from the Postgres bank.
  const bank = questionIds.length ? await prisma.question.findMany({ where: { id: { in: questionIds } } }) : [];
  const byId = new Map(bank.map((q) => [q.id, q]));
  const ordered = questionIds.filter((id) => byId.has(id));

  const interview = await prisma.interview.create({
    data: {
      interviewerId: user.id,
      intervieweeId: interviewee.id,
      status: "scheduled",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      timezone: timezone ?? null,
      durationMinutes: duration,
      interviewerNotes: notes ?? null,
      candidateInstructions: candidateInstructions ?? null,
      rounds,
      shareToken,
      companyName: companyName?.trim() || null,
      roleTitle: roleTitle?.trim() || null,
      experienceLevel: experienceLevel?.trim() || null,
      questions: {
        create: ordered.map((id, idx) => {
          const q = byId.get(id)!;
          return { questionId: q.id, text: q.title, difficulty: q.difficulty, source: "bank", type: "dsa", order: idx };
        }),
      },
      roomSession: { create: { status: "scheduled" } },
    },
    include: interviewInclude,
  });

  // Background: role pack + per-round bank questions (Mongo) — keep creation snappy.
  void generateRubric({ interviewId: interview.id, roleTitle: roleTitle ?? null, jdText: jdText ?? null }).catch((err) =>
    app.log.warn({ err }, "rubric generation failed")
  );
  void attachRoundQuestions(interview.id, rounds).catch((err) => app.log.warn({ err }, "round question attach failed"));

  return reply.code(201).send(serializeInterviewSummary(interview));
});

// Edit an interview (reschedule / change questions / notes). Interviewer-only, owner-only.
app.patch<{ Params: { id: string }; Body: { questionIds?: string[]; scheduledAt?: string | null; durationMinutes?: number; timezone?: string; notes?: string; candidateInstructions?: string; status?: string; roleTitle?: string; jdText?: string } }>(
  "/interviews/:id",
  async (req, reply) => {
    const authed = await requireUser(req, reply);
    if (!authed) return;
    const existing = await prisma.interview.findUnique({ where: { id: req.params.id }, include: { rubric: true } });
    if (!existing) return reply.code(404).send({ message: "Interview not found." });
    if (existing.interviewerId !== authed.id) return reply.code(403).send({ message: "Only the assigned interviewer can edit." });

    const { questionIds, scheduledAt, durationMinutes, timezone, notes, candidateInstructions, status, roleTitle, jdText } = req.body ?? {};

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

    // Regenerate the role pack when the role/JD changed (or was newly provided).
    const rubricChanged =
      (roleTitle !== undefined && roleTitle !== (existing.rubric?.roleTitle ?? "")) ||
      (jdText !== undefined && jdText !== (existing.rubric?.jdText ?? ""));
    if (rubricChanged) {
      void generateRubric({ interviewId: existing.id, roleTitle: roleTitle ?? null, jdText: jdText ?? null }).catch((err) =>
        app.log.warn({ err }, "rubric regeneration failed")
      );
    }

    const fresh = await prisma.interview.findUnique({ where: { id: existing.id }, include: interviewInclude });
    return serializeInterviewSummary(fresh!);
  }
);

// Hard-delete an interview (owner only) — used by the Schedule page.
app.delete<{ Params: { id: string } }>("/interviews/:id", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const existing = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!existing) return reply.code(404).send({ message: "Interview not found." });
  if (existing.interviewerId !== authed.id) return reply.code(403).send({ message: "Only the assigned interviewer can delete." });
  await prisma.interview.delete({ where: { id: existing.id } });
  return { ok: true };
});

/* ------------------------------------------------------------------ *
 * Probe copilot REST surface (interviewer/owner only).
 * ------------------------------------------------------------------ */

// Full copilot state for room hydration: role pack + recent suggestions + scorecard.
app.get<{ Params: { id: string } }>("/interviews/:id/copilot", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview) return reply.code(404).send({ message: "Interview not found." });
  if (interview.interviewerId !== authed.id) return reply.code(403).send({ message: "Copilot data is interviewer-only." });

  const [rubric, suggestions, scorecard, insights] = await Promise.all([
    getRubric(interview.id),
    getRecentSuggestions(interview.id),
    getScorecard(interview.id),
    getRecentInsights(interview.id),
  ]);
  return {
    rubric,
    suggestions,
    scorecard,
    insights,
    resumeAnalysis: interview.resumeAnalysis ?? null,
    resume: interview.resumeFileName ? { fileName: interview.resumeFileName, uploadedAt: interview.resumeUploadedAt?.toISOString() ?? null } : null,
  };
});

// Resume payload for the interviewer's resume panel (interviewer-only).
app.get<{ Params: { id: string } }>("/interviews/:id/resume", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview) return reply.code(404).send({ message: "Interview not found." });
  if (interview.interviewerId !== authed.id) return reply.code(403).send({ message: "The resume is interviewer-only." });
  if (!interview.resumeFileName) return reply.code(404).send({ message: "No resume uploaded yet." });
  return {
    fileName: interview.resumeFileName,
    uploadedAt: interview.resumeUploadedAt?.toISOString() ?? null,
    text: interview.resumeText,
    analysis: interview.resumeAnalysis ?? null,
  };
});

// Stream the actual uploaded resume file so the interviewer can view the real PDF
// (native browser PDF viewer via a blob URL on the client). Interviewer-only.
app.get<{ Params: { id: string } }>("/interviews/:id/resume/file", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview) return reply.code(404).send({ message: "Interview not found." });
  if (interview.interviewerId !== authed.id) return reply.code(403).send({ message: "The resume is interviewer-only." });

  const files = (await readdir(UPLOAD_DIR).catch(() => [])).filter((f) => f.startsWith(`${interview.id}-`));
  if (files.length === 0) return reply.code(404).send({ message: "No resume file on disk." });
  // safeName = `${id}-${Date.now()}-${name}`; the 13-digit timestamp sorts chronologically.
  files.sort();
  const latest = files[files.length - 1];
  const buffer = await readFile(path.join(UPLOAD_DIR, latest));
  const isPdf = latest.toLowerCase().endsWith(".pdf");
  reply
    .type(isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    .header("Content-Disposition", `inline; filename="${interview.resumeFileName || latest}"`);
  return reply.send(buffer);
});

// Fallback: the room calls this when the interviewer opens a resume that has no
// analysis yet (analysis normally runs automatically on upload). Interviewer-only.
app.post<{ Params: { id: string } }>("/interviews/:id/resume/analyze", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview) return reply.code(404).send({ message: "Interview not found." });
  if (interview.interviewerId !== authed.id) return reply.code(403).send({ message: "The resume is interviewer-only." });
  if (!interview.resumeText) return reply.code(404).send({ message: "No resume uploaded yet." });
  const analysis = await analyzeResume(interview.id).catch(() => null);
  return { ok: Boolean(analysis), analysis };
});

// (Re)generate the role pack from a role title + JD.
app.post<{ Params: { id: string }; Body: { roleTitle?: string; jdText?: string } }>(
  "/interviews/:id/rubric",
  async (req, reply) => {
    const authed = await requireUser(req, reply);
    if (!authed) return;
    const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
    if (!interview) return reply.code(404).send({ message: "Interview not found." });
    if (interview.interviewerId !== authed.id) return reply.code(403).send({ message: "Only the interviewer can build the rubric." });

    const rubric = await generateRubric({
      interviewId: interview.id,
      roleTitle: req.body?.roleTitle,
      jdText: req.body?.jdText,
    });
    return rubric;
  }
);

/* ------------------------------------------------------------------ *
 * Question bank browsing (Mongo `mockr_questions` — practers' collections).
 * ------------------------------------------------------------------ */
app.get<{ Querystring: { round?: string; search?: string; limit?: string } }>("/bank/questions", async (req, reply) => {
  const authed = await requireUser(req, reply);
  if (!authed) return;
  const round = (req.query.round || "dsa") as BankRound;
  if (!["dsa", "sql", "design"].includes(round)) return reply.code(400).send({ message: "round must be dsa|sql|design" });
  const questions = await listBankQuestions(round, {
    search: req.query.search,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  return { round, questions };
});

// Question details for the room's problem panel. Postgres seed bank first,
// then the Mongo bank (24-hex ObjectIds) — same response shape either way.
app.get<{ Params: { id: string } }>("/ide/question/:id", async (req, reply) => {
  const q = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!q) {
    const bankQuestion = await getBankQuestion(req.params.id);
    if (bankQuestion) return bankQuestion;
    return reply.code(404).send({ message: "Question not found." });
  }
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

initCopilot(io as unknown as Server);

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
    rounds: interview.rounds,
    activeSurface: (roomSession.activeSurface as RoomBootstrap["activeSurface"]) || "meet",
    // Resume metadata is interviewer-only by design.
    resume:
      role === "interviewer" && interview.resumeFileName
        ? { fileName: interview.resumeFileName, uploadedAt: interview.resumeUploadedAt?.toISOString() ?? null }
        : null,
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
    noteQuestionChange(interviewId, questionId);
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
    // Only the candidate's typing is a copilot signal (the interviewer's editor is read-only).
    if (socket.data.role === "interviewee") {
      noteEditorSync(interviewId, { code, language, questionId: questionId ?? null });
    }
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
    // Draft the evidence-linked scorecard in the background so it's ready by
    // the time the interviewer reaches the evaluation screen.
    void generateScorecard(interviewId).catch((err) => app.log.warn({ err }, "scorecard generation failed"));
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
      // Resolve the question source: Postgres seed bank or the Mongo bank
      // (24-hex ObjectId in InterviewQuestion.questionId). SQL questions run
      // through the SQLite path; DSA runs per-sample-test with the question's
      // wrapper harness when it ships one.
      let sampleTests: ReturnType<typeof extractSampleTests> = [];
      let wrapper: string | null = null;
      let sqlMeta: { wrapperCode: string } | null = null;
      let sqlSolution: string | null = null;
      if (!p.stdin && base.questionId) {
        const questionRow = await prisma.interviewQuestion.findFirst({
          where: { id: base.questionId, interviewId: p.interviewId },
        });
        // Postgres seed/bank question: sampleTests live on the Question table
        // (questionId is a non-hex uuid/slug). Look it up separately — no FK relation.
        // Run = sample cases only (fast feedback). Submit = sample + hidden cases
        // (the full graded set, practers-style).
        const includeHidden = mode === "submit";
        if (questionRow?.questionId && !/^[0-9a-f]{24}$/i.test(questionRow.questionId)) {
          const pgQuestion = await prisma.question.findUnique({ where: { id: questionRow.questionId }, select: { sampleTests: true } });
          sampleTests = extractSampleTests(pgQuestion?.sampleTests);
        }
        if (sampleTests.length === 0 && questionRow?.questionId && /^[0-9a-f]{24}$/i.test(questionRow.questionId)) {
          const bankQuestion = await getBankQuestion(questionRow.questionId);
          if (bankQuestion) {
            sampleTests = extractSampleTests(bankQuestion.sample_tests);
            if (includeHidden) sampleTests = sampleTests.concat(extractSampleTests(bankQuestion.hidden_tests));
            wrapper = bankQuestion.wrappers[p.language] ?? bankQuestion.wrappers[p.language === "python" ? "python3" : p.language] ?? null;
            if (bankQuestion.sqlMeta) sqlMeta = { wrapperCode: bankQuestion.sqlMeta.wrapperCode };
            const sol = bankQuestion.solution;
            sqlSolution = typeof sol === "string" ? sol : (sol && typeof sol === "object" ? String((sol as Record<string, unknown>).sqlite ?? (sol as Record<string, unknown>).sql ?? "") : null);
          }
        }
      }

      let result: NonNullable<ExecutionState["result"]>;
      if (sqlMeta || p.language === "sql") {
        const sqlRun = await executeSql({ query: p.code, wrapperCode: sqlMeta?.wrapperCode ?? "", tests: sampleTests, solution: sqlSolution });
        result = {
          statusId: sqlRun.result.statusId,
          status:
            sqlRun.totalCount > 0
              ? sqlRun.passedCount === sqlRun.totalCount && sqlRun.result.statusId === 3
                ? "Accepted"
                : sqlRun.result.statusId === 3
                  ? "Wrong Answer"
                  : sqlRun.result.status
              : sqlRun.result.status,
          stdout:
            sqlRun.totalCount > 0
              ? JSON.stringify({
                  sample: {
                    tests: sqlRun.tests.map((t) => ({ id: t.id, status: t.status, passed: t.passed, stdout: t.actualOutput, expected: t.expectedOutput, stderr: t.stderr })),
                    summary: { passed: sqlRun.passedCount, total: sqlRun.totalCount },
                  },
                })
              : sqlRun.result.stdout,
          stderr: sqlRun.result.stderr,
          compileOutput: sqlRun.result.compileOutput,
          message: sqlRun.result.message,
          time: sqlRun.result.time,
          memory: sqlRun.result.memory,
          tests: sqlRun.tests,
          passedCount: sqlRun.totalCount > 0 ? sqlRun.passedCount : null,
          totalCount: sqlRun.totalCount > 0 ? sqlRun.totalCount : null,
          table: sqlRun.table,
          expectedTable: sqlRun.expectedTable,
        };
      } else if (sampleTests.length > 0) {
        const testRun = await executeAgainstTests({ code: p.code, language: p.language, tests: sampleTests, wrapper });
        result = {
          statusId: testRun.worst.statusId,
          status:
            testRun.passedCount === testRun.totalCount && testRun.worst.statusId === 3
              ? "Accepted"
              : testRun.worst.statusId === 3
                ? "Wrong Answer"
                : testRun.worst.status,
          // Keep the room UIs' JSON-aware output formatter working: stdout is
          // the per-case payload keyed the same way the reference API shaped it.
          stdout: JSON.stringify({
            sample: {
              tests: testRun.tests.map((t) => ({
                id: t.id,
                status: t.status,
                passed: t.passed,
                stdout: t.actualOutput,
                expected: t.expectedOutput,
                stderr: t.stderr,
              })),
              summary: { passed: testRun.passedCount, total: testRun.totalCount },
            },
          }),
          stderr: testRun.worst.stderr,
          compileOutput: testRun.worst.compileOutput,
          message: testRun.worst.message,
          time: testRun.worst.time,
          memory: testRun.worst.memory,
          tests: testRun.tests.map((t) => ({
            id: t.id,
            index: t.index,
            passed: t.passed,
            status: t.status,
            stdin: t.stdin,
            expectedOutput: t.expectedOutput,
            actualOutput: t.actualOutput,
            stderr: t.stderr,
            compileOutput: t.compileOutput,
            time: t.time,
          })),
          passedCount: testRun.passedCount,
          totalCount: testRun.totalCount,
        };
      } else {
        result = await executePlainCode({ code: p.code, language: p.language, stdin: p.stdin ?? null });
      }

      const completed: ExecutionState = { ...base, phase: "completed", result, executionError: null, updatedAt: new Date().toISOString() };
      io.to(roomName(p.interviewId)).emit("direct:execution-sync", completed);
      noteExecution(p.interviewId, {
        mode,
        language: p.language,
        questionId: base.questionId,
        result,
        executionError: null,
        code: p.code,
      });
      ack?.({ ok: true, data: completed });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Code execution failed.";
      const failed: ExecutionState = { ...base, phase: "completed", result: null, executionError: message, updatedAt: new Date().toISOString() };
      io.to(roomName(p.interviewId)).emit("direct:execution-sync", failed);
      noteExecution(p.interviewId, { mode, language: p.language, questionId: base.questionId, result: null, executionError: message, code: p.code });
      ack?.({ ok: false, message });
    }
  });

  /* --- Room surface control (Google-Meet-first room; interviewer drives) --- */
  socket.on("direct:surface-change", async ({ interviewId, surface }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Only the interviewer can switch the workspace." });
    if (!["meet", "dsa", "sql", "design"].includes(surface)) return ack?.({ ok: false, message: "Unknown surface." });
    await prisma.roomSession.update({ where: { interviewId }, data: { activeSurface: surface } }).catch(() => null);
    io.to(roomName(interviewId)).emit("direct:surface-state", { interviewId, surface, updatedAt: new Date().toISOString() });
    noteSurfaceChange(interviewId, surface);
    ack?.({ ok: true });
  });

  /* --- Live transcript intake (each browser transcribes its own mic) --- */
  socket.on("direct:transcript", (p) => {
    if (!p?.text?.trim()) return;
    const speaker = (socket.data.role ?? "interviewee") as Role;
    const entry = { interviewId: p.interviewId, speaker, text: p.text.trim(), isFinal: Boolean(p.isFinal), at: new Date().toISOString() };
    // The live transcript is an interviewer-only panel; the candidate never sees it.
    void prisma.interview
      .findUnique({ where: { id: p.interviewId }, select: { interviewerId: true } })
      .then((row) => {
        if (row) io.to(userRoom(row.interviewerId)).emit("direct:transcript-entry", entry);
      })
      .catch(() => {});
    if (entry.isFinal) noteTranscript(p.interviewId, { speaker, text: entry.text, at: entry.at });
  });

  // Interviewer pressed Enter → analyze the candidate's current answer immediately.
  socket.on("direct:analyze-answer", ({ interviewId }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Interviewer-only." });
    forceFinalizeAnswer(interviewId);
    ack?.({ ok: true });
  });

  /* --- Probe copilot (interviewer-only) --- */
  socket.on("direct:copilot-analyze", async ({ interviewId }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Copilot is interviewer-only." });
    const suggestion = await copilotAnalyze(interviewId, "manual");
    ack?.({ ok: true, data: suggestion ?? undefined });
  });

  socket.on("direct:copilot-scorecard", async ({ interviewId }, ack) => {
    if (socket.data.role !== "interviewer") return ack?.({ ok: false, message: "Copilot is interviewer-only." });
    try {
      const scorecard = await generateScorecard(interviewId);
      ack?.({ ok: true, data: scorecard });
    } catch (err) {
      ack?.({ ok: false, message: err instanceof Error ? err.message : "Scorecard generation failed." });
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
