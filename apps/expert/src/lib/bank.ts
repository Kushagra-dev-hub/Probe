/**
 * Question bank backed by the practers MongoDB Atlas cluster (db `mockr_questions`).
 * Read-only: we list + fetch questions from the same collections practers uses
 * (dsa_questions, sql_questions, system_design_questions) and normalize them to
 * the shape Probe's room problem panel already renders.
 *
 * Connection failures are non-fatal — callers fall back to the Postgres bank.
 */
import { MongoClient, ObjectId, type Db } from "mongodb";

export type BankRound = "dsa" | "sql" | "design";

const COLLECTIONS: Record<BankRound, string> = {
  dsa: "dsa_questions",
  sql: "sql_questions",
  design: "system_design_questions",
};

let clientPromise: Promise<Db | null> | null = null;

async function getDb(): Promise<Db | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const uri = process.env.MONGODB_URI || "";
      if (!uri) return null;
      try {
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
        await client.connect();
        return client.db("mockr_questions");
      } catch (err) {
        console.warn("[bank] Mongo unavailable:", err instanceof Error ? err.message : err);
        return null;
      }
    })();
  }
  return clientPromise;
}

export async function bankAvailable(): Promise<boolean> {
  return (await getDb()) !== null;
}

export type BankListItem = {
  id: string;
  round: BankRound;
  title: string;
  difficulty: string | null;
  topics: string[];
};

export async function listBankQuestions(round: BankRound, opts?: { limit?: number; search?: string }): Promise<BankListItem[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 60));
  const filter: Record<string, unknown> = {};
  if (opts?.search) filter.title = { $regex: opts.search, $options: "i" };
  const docs = await db
    .collection(COLLECTIONS[round])
    .find(filter, { projection: { title: 1, difficulty: 1, topics: 1 } })
    .limit(limit)
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    round,
    title: String(d.title ?? "Untitled"),
    difficulty: d.difficulty ? String(d.difficulty).toLowerCase() : null,
    topics: Array.isArray(d.topics) ? d.topics.map(String) : [],
  }));
}

export async function pickRandomBankQuestions(round: BankRound, count: number): Promise<BankListItem[]> {
  const db = await getDb();
  if (!db) return [];
  const docs = await db
    .collection(COLLECTIONS[round])
    .aggregate([{ $sample: { size: count } }, { $project: { title: 1, difficulty: 1, topics: 1 } }])
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    round,
    title: String(d.title ?? "Untitled"),
    difficulty: d.difficulty ? String(d.difficulty).toLowerCase() : null,
    topics: Array.isArray(d.topics) ? d.topics.map(String) : [],
  }));
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** codeSnippets is a Map<lang, {starter_code, wrapper_code}> in Mongo (plain object over the wire). */
function extractSnippets(raw: unknown): { starters: Record<string, string>; wrappers: Record<string, string> } {
  const starters: Record<string, string> = {};
  const wrappers: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    for (const [lang, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        if (typeof e.starter_code === "string") starters[lang] = e.starter_code;
        if (typeof e.wrapper_code === "string") wrappers[lang] = e.wrapper_code;
      } else if (typeof entry === "string") {
        starters[lang] = entry;
      }
    }
  }
  return { starters, wrappers };
}

/**
 * Normalized question detail — a superset of what the room's problem panel
 * renders (same keys as the Postgres /ide/question/:id response) plus
 * execution metadata (`wrappers`, `sqlMeta`, `designMeta`).
 */
export type BankQuestionDetail = {
  id: string;
  round: BankRound;
  title: string;
  statement: string;
  description: string;
  difficulty: string | null;
  language: string | null;
  examples: Array<{ input: unknown; output: unknown; explanation?: string }>;
  constraints: string[];
  starter_code: Record<string, string>;
  starterCode: Record<string, string>;
  codeSnippets: Record<string, { starter_code?: string; wrapper_code?: string }>;
  hints: string[];
  solution: unknown;
  sample_tests: Array<{ id: string; stdin: string; expected_output: string }>;
  /** Per-language wrapper harnesses for DSA execution. */
  wrappers: Record<string, string>;
  sqlMeta: { wrapperCode: string; schemaText: string } | null;
  designMeta: { rubricLite: unknown; followUpQuestions: string[] } | null;
};

export async function getBankQuestion(id: string): Promise<BankQuestionDetail | null> {
  const db = await getDb();
  if (!db || !ObjectId.isValid(id)) return null;
  const _id = new ObjectId(id);

  for (const round of Object.keys(COLLECTIONS) as BankRound[]) {
    const doc = await db.collection(COLLECTIONS[round]).findOne({ _id });
    if (!doc) continue;

    if (round === "dsa") {
      const { starters, wrappers } = extractSnippets(doc.codeSnippets);
      return {
        id,
        round,
        title: asString(doc.title),
        statement: asString(doc.description),
        description: asString(doc.description),
        difficulty: doc.difficulty ? String(doc.difficulty).toLowerCase() : null,
        language: null,
        examples: Array.isArray(doc.examples)
          ? doc.examples.map((e: { example_text?: unknown }) => ({ input: "", output: "", explanation: asString(e?.example_text) }))
          : [],
        constraints: Array.isArray(doc.constraints) ? doc.constraints.map(asString) : [],
        starter_code: starters,
        starterCode: starters,
        codeSnippets: (doc.codeSnippets ?? {}) as BankQuestionDetail["codeSnippets"],
        hints: Array.isArray(doc.hints) ? doc.hints.map(asString) : [],
        solution: doc.solution ?? null,
        sample_tests: Array.isArray(doc.sampleTestCases)
          ? doc.sampleTestCases.map((t: { id?: unknown; input?: unknown; output?: unknown }, i: number) => ({
              id: asString(t?.id) || `t${i + 1}`,
              stdin: asString(t?.input),
              expected_output: asString(t?.output),
            }))
          : [],
        wrappers,
        sqlMeta: null,
        designMeta: null,
      };
    }

    if (round === "sql") {
      const schemaText = asString(doc.schema);
      const statement = [asString(doc.description), schemaText ? `\n### Schema\n\n\`\`\`sql\n${schemaText}\n\`\`\`` : ""].join("\n");
      return {
        id,
        round,
        title: asString(doc.title),
        statement,
        description: asString(doc.description),
        difficulty: "medium",
        language: "sql",
        examples: Array.isArray(doc.examples)
          ? doc.examples.map((e: { input?: unknown; output?: unknown; explanation?: unknown }) => ({
              input: e?.input ?? "",
              output: e?.output ?? "",
              explanation: e?.explanation ? asString(e.explanation) : undefined,
            }))
          : [],
        constraints: [],
        starter_code: { sql: "-- Write your SQL query here\n" },
        starterCode: { sql: "-- Write your SQL query here\n" },
        codeSnippets: {},
        hints: [],
        solution: doc.solution ?? null,
        sample_tests: Array.isArray(doc.testCases)
          ? doc.testCases.map((t: { id?: unknown; label?: unknown; expected_output?: unknown }, i: number) => ({
              id: asString(t?.id) || `t${i + 1}`,
              stdin: asString(t?.label) || `Case ${i + 1}`,
              expected_output: asString(t?.expected_output),
            }))
          : [],
        wrappers: {},
        sqlMeta: { wrapperCode: asString(doc.wrapperCode), schemaText },
        designMeta: null,
      };
    }

    // round === "design"
    const rubricFull = (doc.rubricFull ?? {}) as { sampleAnswer?: unknown };
    return {
      id,
      round,
      title: asString(doc.title),
      statement: asString(doc.problemStatement),
      description: asString(doc.problemStatement),
      difficulty: doc.difficulty ? String(doc.difficulty).toLowerCase() : null,
      language: "markdown",
      examples: [],
      constraints: [],
      starter_code: { markdown: "# Design notes\n\nSketch the architecture on the canvas; capture key decisions here.\n" },
      starterCode: { markdown: "# Design notes\n\nSketch the architecture on the canvas; capture key decisions here.\n" },
      codeSnippets: {},
      hints: Array.isArray(doc.hints) ? doc.hints.map(asString) : [],
      solution: rubricFull.sampleAnswer ? { explanation: asString(rubricFull.sampleAnswer) } : null,
      sample_tests: [],
      wrappers: {},
      sqlMeta: null,
      designMeta: {
        rubricLite: doc.rubricLite ?? null,
        followUpQuestions: Array.isArray(doc.followUpQuestions) ? doc.followUpQuestions.map(asString) : [],
      },
    };
  }
  return null;
}
