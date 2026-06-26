import { describe, expect, it } from "vitest";
import {
  buildPaperOrderTicket,
  executePaperOrderTicket,
} from "../paper-order-ticket";

describe("paper order tickets", () => {
  it("previews and executes a valid short derivatives ticket", () => {
    const preview = buildPaperOrderTicket(
      {
        confidence: "70",
        entryPrice: "154",
        leverage: "2",
        product: "derivatives",
        quantity: "2",
        side: "short",
        stopLoss: "162",
        symbol: "SOLUSDT",
        takeProfit: "140",
        thesis: "Paper hedge practice.",
      },
      1_777_777,
    );
    const execution = executePaperOrderTicket(
      preview.trade,
      150,
      "2026-06-04T00:00:00.000Z",
      1_777_777,
    );

    expect(preview.valid).toBe(true);
    expect(preview.notionalUsd).toBe(616);
    expect(preview.riskUsd).toBe(32);
    expect(preview.rewardUsd).toBe(56);
    expect(preview.riskRewardRatio).toBe(1.75);
    expect(execution.position?.side).toBe("short");
    expect(execution.position?.unrealizedPnlUsd).toBe(8);
    expect(execution.audit?.event).toBe("paper-ticket-open");
    expect(execution.audit?.metadata.paperOnly).toBe(true);
  });

  it("rejects spot shorts before paper execution", () => {
    const execution = executePaperOrderTicket({
      confidence: "70",
      entryPrice: "100",
      leverage: "1",
      product: "spot",
      quantity: "1",
      side: "short",
      stopLoss: "110",
      symbol: "BTCUSDT",
      thesis: "Invalid spot short.",
    });

    expect(execution.preview.valid).toBe(false);
    expect(execution.preview.errors).toContain(
      "Short paper tickets must use derivatives, not spot.",
    );
    expect(execution.position).toBeUndefined();
    expect(execution.audit).toBeUndefined();
  });

  it("rejects stops on the wrong side of entry", () => {
    const longPreview = buildPaperOrderTicket({
      confidence: "70",
      entryPrice: "100",
      leverage: "1",
      product: "spot",
      quantity: "1",
      side: "long",
      stopLoss: "105",
      symbol: "ETHUSDT",
      thesis: "Bad stop.",
    });
    const shortPreview = buildPaperOrderTicket({
      confidence: "70",
      entryPrice: "100",
      leverage: "1",
      product: "derivatives",
      quantity: "1",
      side: "short",
      stopLoss: "95",
      symbol: "ETHUSDT",
      thesis: "Bad stop.",
    });

    expect(longPreview.errors).toContain("Long tickets need a stop loss below entry.");
    expect(shortPreview.errors).toContain("Short tickets need a stop loss above entry.");
  });
});
