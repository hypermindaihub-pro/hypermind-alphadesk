import { describe, expect, it, vi } from "vitest";
import { generateAgentReasoning } from "../openai-agent";
import { evaluateRisk } from "../risk-manager";
import { fallbackMarkets, seedPortfolio, seedTradeIdeas } from "../sample-data";

const input = {
  ideas: seedTradeIdeas,
  markets: fallbackMarkets,
  riskDecision: evaluateRisk(seedTradeIdeas[1], seedPortfolio),
};

describe("OpenAI agent reasoning", () => {
  it("uses the Responses API when OPENAI_API_KEY is configured", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const headers = init?.headers as Record<string, string>;

      expect(headers.authorization).toBe("Bearer secret-openai-key");
      expect(body.model).toBe("gpt-test");
      expect(body.instructions).toContain("paper trading");
      expect(body.max_output_tokens).toBeLessThanOrEqual(450);

      return new Response(
        JSON.stringify({
          output_text: "Risk-first summary\n- Prefer paper execution\n- Review stop loss",
        }),
        { status: 200 },
      );
    });

    const reasoning = await generateAgentReasoning(
      input,
      {
        OPENAI_API_KEY: "secret-openai-key",
        OPENAI_MODEL: "gpt-test",
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(reasoning.mode).toBe("openai");
    expect(reasoning.model).toBe("gpt-test");
    expect(reasoning.summary).toContain("Risk-first summary");
    expect(reasoning.bullets).toContain("Prefer paper execution");
    expect(JSON.stringify(reasoning)).not.toContain("secret-openai-key");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("falls back deterministically when OpenAI is unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const reasoning = await generateAgentReasoning(
      input,
      {
        OPENAI_API_KEY: "secret-openai-key",
        OPENAI_MODEL: "gpt-test",
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(reasoning.mode).toBe("deterministic-fallback");
    expect(reasoning.bullets.length).toBeGreaterThan(0);
    expect(JSON.stringify(reasoning)).not.toContain("secret-openai-key");
  });
});
