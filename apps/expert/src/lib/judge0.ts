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
