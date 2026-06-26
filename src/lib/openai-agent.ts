import type { EnvLike } from "./config";
import { getAlphaConfig } from "./config";
import type { MarketSnapshot, RiskDecision, TradeIntent } from "./types";

export type AgentReasoning = {
  mode: "openai" | "deterministic-fallback";
  model: string;
  summary: string;
  bullets: string[];
};

type AgentInput = {
  markets: MarketSnapshot[];
  ideas: TradeIntent[];
  riskDecision: RiskDecision;
};

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackReasoning(input: AgentInput, model: string): AgentReasoning {
  const strongest = input.markets
    .slice()
    .sort((a, b) => b.change24h - a.change24h)[0];

  return {
    mode: "deterministic-fallback",
    model,
    summary:
      "OpenAI reasoning is ready but currently using deterministic fallback because no API call was required or configured.",
    bullets: [
      `${strongest?.symbol ?? "BTC"} has the strongest 24h momentum in the current market set.`,
      input.riskDecision.approved
        ? "Risk Manager approved the highlighted idea for paper execution only."
        : "Risk Manager veto remains active, so execution should stay blocked.",
      "Beginner note: paper trading tests the decision process without exposing capital.",
    ],
  };
}

export async function generateAgentReasoning(
  input: AgentInput,
  env: EnvLike = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentReasoning> {
  const config = getAlphaConfig(env);
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return fallbackReasoning(input, config.openAiModel);
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: config.openAiModel,
          instructions:
            "You are Hypermind AlphaDesk. Explain crypto trade ideas cautiously, prefer paper trading, and never recommend live execution without risk approval.",
          input: JSON.stringify({
            markets: input.markets,
            ideas: input.ideas,
            riskDecision: input.riskDecision,
          }),
          max_output_tokens: 450,
        }),
      },
      8_000,
    );

    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
    };
    const text = payload.output_text?.trim();

    if (!text) {
      throw new Error("OpenAI response contained no output_text.");
    }

    return {
      mode: "openai",
      model: config.openAiModel,
      summary: text,
      bullets: text
        .split(/\n+/)
        .map((line) => line.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 4),
    };
  } catch {
    return fallbackReasoning(input, config.openAiModel);
  }
}
