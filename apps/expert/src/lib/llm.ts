/**
 * Minimal JSON-mode LLM client for the Probe copilot.
 *
 * Provider chain (same keys practers uses): Google Gemini
 * (GOOGLE_GENERATIVE_AI_API_KEY), then xAI Grok (XAI_API_KEY), then Groq
 * (GROQ_API_KEY) — the latter two share one OpenAI-compatible call path.
 * All plain fetch — no SDK dependency. Every call demands strict JSON back.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export type LlmJsonRequest = {
  system: string;
  user: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export function llmConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY);
}

/** Strip markdown fences / stray prose and parse the first JSON value found. */
function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    if (start >= 0) {
      const open = trimmed[start];
      const close = open === "{" ? "}" : "]";
      const end = trimmed.lastIndexOf(close);
      if (end > start) return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("LLM did not return valid JSON.");
  }
}

async function callGemini(req: LlmJsonRequest, apiKey: string): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.3,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return parseJsonLoose(text);
}

async function callOpenAiCompatible(
  req: LlmJsonRequest,
  opts: { name: string; baseUrl: string; model: string; apiKey: string }
): Promise<unknown> {
  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxOutputTokens ?? 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${opts.name} request failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`${opts.name} returned an empty response.`);
  return parseJsonLoose(text);
}

/**
 * Ask for a JSON object. Tries Gemini, then xAI, then Groq. Throws when no
 * provider is configured or every provider fails.
 */
export async function generateJson(req: LlmJsonRequest): Promise<unknown> {
  const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
  const xaiKey = process.env.XAI_API_KEY || "";
  const groqKey = process.env.GROQ_API_KEY || "";
  if (!geminiKey && !xaiKey && !groqKey) {
    throw new Error("No LLM provider configured (set GOOGLE_GENERATIVE_AI_API_KEY, XAI_API_KEY, or GROQ_API_KEY).");
  }

  let lastError: unknown = null;
  if (geminiKey) {
    try {
      return await callGemini(req, geminiKey);
    } catch (err) {
      lastError = err;
    }
  }
  if (xaiKey) {
    try {
      return await callOpenAiCompatible(req, { name: "xAI", baseUrl: "https://api.x.ai/v1", model: XAI_MODEL, apiKey: xaiKey });
    } catch (err) {
      lastError = err;
    }
  }
  if (groqKey) {
    try {
      return await callOpenAiCompatible(req, { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: GROQ_MODEL, apiKey: groqKey });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM call failed.");
}
