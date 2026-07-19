export const LANGUAGE_IDS = {
  python3: 71,
  javascript: 63,
  typescript: 74,
  java: 62,
  cpp: 54,
  c: 50,
  csharp: 51,
  go: 60,
  rust: 73,
  ruby: 72,
} as const;

export type SupportedLanguage = keyof typeof LANGUAGE_IDS;

type Judge0SubmissionResponse = {
  token?: string;
};

type Judge0ResultResponse = {
  status?: {
    id?: number;
    description?: string;
  };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
};

export type ExpertCodeExecutionResult = {
  statusId: number;
  status: string;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
};

const TERMINAL_STATUSES = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

function normalizeLanguage(language: string): SupportedLanguage {
  const normalized = language.trim().toLowerCase();
  const aliases: Record<string, SupportedLanguage> = {
    py: "python3",
    python: "python3",
    python3: "python3",
    js: "javascript",
    node: "javascript",
    nodejs: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    "c++": "cpp",
    cpp: "cpp",
    cplusplus: "cpp",
    c: "c",
    "c#": "csharp",
    csharp: "csharp",
    "c-sharp": "csharp",
    java: "java",
    go: "go",
    golang: "go",
    rust: "rust",
    ruby: "ruby",
  };

  const languageKey = aliases[normalized];
  if (!languageKey) {
    throw new Error("Unsupported language.");
  }
  return languageKey;
}

function getJudge0Config() {
  const apiUrl = (process.env.JUDGE0_CE_URL || process.env.JUDGE0_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) {
    throw new Error("Code execution is not configured.");
  }

  const host = process.env.JUDGE0_CE_HOST || process.env.JUDGE0_HOST || new URL(apiUrl).host;
  const provider = (process.env.JUDGE0_PROVIDER || "auto").toLowerCase();
  const rapidApi = provider === "rapidapi" || (provider === "auto" && host.includes("rapidapi.com"));
  const apiKey = process.env.JUDGE0_API_KEY || "";
  if (rapidApi && !apiKey) {
    throw new Error("Code execution is not configured.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (rapidApi) {
    headers["X-RapidAPI-Key"] = apiKey;
    headers["X-RapidAPI-Host"] = host;
  } else if (apiKey) {
    headers[process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token"] = apiKey;
  }

  return {
    apiUrl,
    headers,
    pollMaxAttempts: Math.max(1, Number(process.env.JUDGE0_POLL_MAX_ATTEMPTS || 30)),
    pollInitialDelayMs: Math.max(250, Number(process.env.JUDGE0_POLL_INITIAL_DELAY_MS || 1000)),
    pollMaxDelayMs: Math.max(500, Number(process.env.JUDGE0_POLL_MAX_DELAY_MS || 5000)),
    cpuTimeLimit: Math.min(5, Math.max(0.1, Number(process.env.JUDGE0_CPU_TIME_LIMIT_SECONDS || 5))),
    wallTimeLimit: Math.min(8, Math.max(1, Number(process.env.JUDGE0_WALL_TIME_LIMIT_SECONDS || 6))),
    memoryLimitKb: Math.min(256 * 1024, Math.max(16 * 1024, Number(process.env.JUDGE0_MEMORY_LIMIT_KB || 256 * 1024))),
  };
}

function decodeMaybeBase64(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  try {
    return Buffer.from(value, "base64").toString("utf-8");
  } catch {
    return value;
  }
}

function normalizeResult(result: Judge0ResultResponse): ExpertCodeExecutionResult {
  const statusId = Number(result.status?.id || 0);
  return {
    statusId,
    status: result.status?.description || "Unknown",
    stdout: decodeMaybeBase64(result.stdout),
    stderr: decodeMaybeBase64(result.stderr),
    compileOutput: decodeMaybeBase64(result.compile_output),
    message: decodeMaybeBase64(result.message),
    time: result.time || null,
    memory: result.memory ?? null,
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executePlainCode(input: {
  code: string;
  language: string;
  stdin?: string | null;
}): Promise<ExpertCodeExecutionResult> {
  const language = normalizeLanguage(input.language);
  const config = getJudge0Config();
  const submitResponse = await fetch(`${config.apiUrl}/submissions?base64_encoded=true&wait=false`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      source_code: Buffer.from(input.code).toString("base64"),
      language_id: LANGUAGE_IDS[language],
      stdin: input.stdin ? Buffer.from(input.stdin).toString("base64") : undefined,
      cpu_time_limit: config.cpuTimeLimit,
      wall_time_limit: config.wallTimeLimit,
      memory_limit: config.memoryLimitKb,
    }),
  });

  if (!submitResponse.ok) {
    throw new Error("Code execution service rejected the submission.");
  }

  const submitted = (await submitResponse.json()) as Judge0SubmissionResponse;
  if (!submitted.token) {
    throw new Error("Code execution service did not return a token.");
  }

  for (let attempt = 0; attempt < config.pollMaxAttempts; attempt += 1) {
    const resultResponse = await fetch(
      `${config.apiUrl}/submissions/${encodeURIComponent(submitted.token)}?base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time,memory`,
      {
        headers: config.headers,
      }
    );

    if (!resultResponse.ok) {
      throw new Error("Code execution service could not fetch the result.");
    }

    const result = (await resultResponse.json()) as Judge0ResultResponse;
    const statusId = Number(result.status?.id || 0);
    if (TERMINAL_STATUSES.has(statusId)) {
      return normalizeResult(result);
    }

    const delay = Math.min(
      config.pollInitialDelayMs * Math.pow(1.5, attempt),
      config.pollMaxDelayMs
    );
    await sleep(delay);
  }

  throw new Error("Code execution timed out while waiting for Judge0.");
}

/* ------------------------------------------------------------------ *
 * SQL execution (ported pattern from practers sql-execution.ts): the whole
 * script runs through Judge0's SQLite runtime (language 82). The question's
 * wrapperCode carries the DDL/DML setup; the user's query is injected either
 * at a {{USER_QUERY}} placeholder or appended after the setup. Output
 * comparison is order-insensitive and whitespace-normalized.
 * ------------------------------------------------------------------ */

const SQLITE_LANGUAGE_ID = 82;

function buildSqlScript(wrapperCode: string, userQuery: string): string {
  // Tab-separated output with headers parses cleanly into a table.
  const pragmas = ".headers on\n.mode tabs";
  const injection = `${pragmas}\n\n${userQuery.trim()}`;
  const wrapper = (wrapperCode || "").trim();
  if (wrapper.includes("{{USER_QUERY}}")) return wrapper.replace("{{USER_QUERY}}", injection);
  return [wrapper, "", pragmas, "", userQuery.trim()].join("\n");
}

export type SqlTable = { columns: string[]; rows: string[][] };

/** Parse tab-separated (or, as a fallback, whitespace-aligned) sqlite output into a table. */
export function parseSqlTable(text: string | null | undefined): SqlTable {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const hasTabs = lines[0].includes("\t");
  const split = (l: string) => (hasTabs ? l.split("\t") : l.trim().split(/\s{2,}/));
  const columns = split(lines[0]).map((c) => c.trim());
  const rows = lines
    .slice(1)
    .filter((l) => !/^[-\s|]+$/.test(l)) // drop separator lines from column mode
    .map((l) => split(l).map((c) => c.trim()));
  return { columns, rows };
}

/** Canonical form for order-insensitive comparison (works across output modes). */
function normalizeSqlOutput(value: string | null | undefined): string {
  const { rows } = parseSqlTable(value);
  if (rows.length === 0) {
    return (value ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .sort()
      .join("\n");
  }
  return rows
    .map((r) => r.map((c) => c.replace(/\s+/g, " ").trim()).join("\t"))
    .sort()
    .join("\n");
}

async function submitRaw(sourceCode: string, languageId: number, stdin?: string | null): Promise<ExpertCodeExecutionResult> {
  const config = getJudge0Config();
  const submitResponse = await fetch(`${config.apiUrl}/submissions?base64_encoded=true&wait=false`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      source_code: Buffer.from(sourceCode).toString("base64"),
      language_id: languageId,
      stdin: stdin ? Buffer.from(stdin).toString("base64") : undefined,
      cpu_time_limit: config.cpuTimeLimit,
      wall_time_limit: config.wallTimeLimit,
      memory_limit: config.memoryLimitKb,
    }),
  });
  if (!submitResponse.ok) throw new Error("Code execution service rejected the submission.");
  const submitted = (await submitResponse.json()) as Judge0SubmissionResponse;
  if (!submitted.token) throw new Error("Code execution service did not return a token.");

  for (let attempt = 0; attempt < config.pollMaxAttempts; attempt += 1) {
    const resultResponse = await fetch(
      `${config.apiUrl}/submissions/${encodeURIComponent(submitted.token)}?base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time,memory`,
      { headers: config.headers }
    );
    if (!resultResponse.ok) throw new Error("Code execution service could not fetch the result.");
    const result = (await resultResponse.json()) as Judge0ResultResponse;
    if (TERMINAL_STATUSES.has(Number(result.status?.id || 0))) return normalizeResult(result);
    await sleep(Math.min(config.pollInitialDelayMs * Math.pow(1.5, attempt), config.pollMaxDelayMs));
  }
  throw new Error("Code execution timed out while waiting for Judge0.");
}

export type SqlRunResult = {
  /** Raw stdout of the user's query against the seeded schema. */
  result: ExpertCodeExecutionResult;
  /** The user's query output parsed as a table (for a proper results grid). */
  table: SqlTable;
  /** Expected result as a table when the question ships a solution. */
  expectedTable: SqlTable | null;
  /** Present when the question ships expected outputs — per-case verdicts. */
  tests: TestCaseOutcome[];
  passedCount: number;
  totalCount: number;
};

export async function executeSql(input: {
  query: string;
  wrapperCode: string;
  tests: SampleTest[];
  /** The reference solution query — used to regenerate expected output (practers-style). */
  solution?: string | null;
}): Promise<SqlRunResult> {
  const script = buildSqlScript(input.wrapperCode, input.query);
  const result = await submitRaw(script, SQLITE_LANGUAGE_ID);
  const table = parseSqlTable(result.stdout);

  // Regenerate expected output by running the reference solution through the same
  // schema — more reliable than trusting a stored, differently-formatted string.
  let expectedNormalized: string | null = null;
  let expectedTable: SqlTable | null = null;
  if (input.solution?.trim()) {
    try {
      const solResult = await submitRaw(buildSqlScript(input.wrapperCode, input.solution), SQLITE_LANGUAGE_ID);
      if (solResult.statusId === 3 && solResult.stdout) {
        expectedNormalized = normalizeSqlOutput(solResult.stdout);
        expectedTable = parseSqlTable(solResult.stdout);
      }
    } catch {
      /* fall back to stored expected */
    }
  }

  const tests: TestCaseOutcome[] = input.tests.map((test, index) => {
    const expected = expectedNormalized ?? normalizeSqlOutput(test.expectedOutput);
    const passed = result.statusId === 3 && normalizeSqlOutput(result.stdout) === expected;
    return {
      id: test.id,
      index,
      passed,
      status: result.status,
      stdin: test.stdin,
      expectedOutput: test.expectedOutput,
      actualOutput: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
      time: result.time,
    };
  });

  return {
    result,
    table,
    expectedTable,
    tests,
    passedCount: tests.filter((t) => t.passed).length,
    totalCount: tests.length,
  };
}

/* ------------------------------------------------------------------ *
 * Per-test-case execution (practers-style run/submit): execute the code
 * once per sample test with that test's stdin, then compare trimmed
 * outputs. Sequential to stay friendly to the shared RapidAPI quota.
 * ------------------------------------------------------------------ */

export type SampleTest = {
  id: string;
  stdin: string;
  expectedOutput: string;
};

export type TestCaseOutcome = {
  id: string;
  index: number;
  passed: boolean;
  status: string;
  stdin: string;
  expectedOutput: string;
  actualOutput: string | null;
  stderr: string | null;
  compileOutput: string | null;
  time: string | null;
};

export type TestRunResult = {
  tests: TestCaseOutcome[];
  passedCount: number;
  totalCount: number;
  /** Worst raw result across the cases — statusId/status reflect it. */
  worst: ExpertCodeExecutionResult;
};

function normalizeOutput(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function extractSampleTests(raw: unknown): SampleTest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const test = entry as Record<string, unknown>;
      const stdin = test.stdin ?? test.input ?? "";
      const expected = test.expected_output ?? test.expectedOutput ?? test.output ?? "";
      return {
        id: String(test.id ?? `t${index + 1}`),
        stdin: typeof stdin === "string" ? stdin : JSON.stringify(stdin),
        expectedOutput: typeof expected === "string" ? expected : JSON.stringify(expected),
      };
    })
    .filter((t): t is SampleTest => t !== null);
}

/**
 * Compose the runnable source. Mongo DSA questions ship a per-language
 * `wrapper_code` harness (reads stdin, calls the user's function); the user's
 * buffer replaces a {{USER_CODE}} placeholder when present, else prefixes it.
 */
function composeSource(code: string, wrapper?: string | null): string {
  const harness = (wrapper || "").trim();
  if (!harness) return code;
  if (harness.includes("{{USER_CODE}}")) return harness.replace("{{USER_CODE}}", code);
  return `${code}\n\n${harness}`;
}

export async function executeAgainstTests(input: {
  code: string;
  language: string;
  tests: SampleTest[];
  wrapper?: string | null;
}): Promise<TestRunResult> {
  const tests: TestCaseOutcome[] = [];
  let worst: ExpertCodeExecutionResult | null = null;
  const source = composeSource(input.code, input.wrapper);

  for (let index = 0; index < input.tests.length; index += 1) {
    const test = input.tests[index];
    const result = await executePlainCode({ code: source, language: input.language, stdin: test.stdin });
    // Status 3 = Accepted (ran fine); anything else is a compile/runtime failure.
    const ranClean = result.statusId === 3;
    const passed = ranClean && normalizeOutput(result.stdout) === normalizeOutput(test.expectedOutput);
    tests.push({
      id: test.id,
      index,
      passed,
      status: result.status,
      stdin: test.stdin,
      expectedOutput: test.expectedOutput,
      actualOutput: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
      time: result.time,
    });
    if (!worst || (worst.statusId === 3 && result.statusId !== 3)) worst = result;
    // A compile error will fail every case identically — stop early.
    if (result.compileOutput && result.statusId === 6) break;
  }

  const passedCount = tests.filter((t) => t.passed).length;
  return {
    tests,
    passedCount,
    totalCount: input.tests.length,
    worst: worst ?? {
      statusId: 0,
      status: "No tests",
      stdout: null,
      stderr: null,
      compileOutput: null,
      message: null,
      time: null,
      memory: null,
    },
  };
}
