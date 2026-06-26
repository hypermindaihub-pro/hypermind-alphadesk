import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendServerAuditEvent,
  getServerAuditStatus,
} from "../server-audit-log";

vi.mock("server-only", () => ({}));

const tempDirs: string[] = [];

function testAuditDir(name: string): string {
  const dir = path.join(process.cwd(), "data", "alphadesk-audit", name);
  tempDirs.push(dir);

  return dir;
}

describe("server audit log", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
    );
  });

  it("is disabled by default", async () => {
    const status = await getServerAuditStatus({} as NodeJS.ProcessEnv);

    expect(status.enabled).toBe(false);
    expect(status.writable).toBe(false);
    expect(status.detail).toContain("disabled");
  });

  it("writes sanitized JSONL events when configured", async () => {
    const auditName = `test-${Date.now()}`;
    const dir = testAuditDir(auditName);
    const env = { ALPHADESK_AUDIT_LOG_DIR: auditName } as unknown as NodeJS.ProcessEnv;
    const status = await appendServerAuditEvent(
      {
        actor: "paper-trading",
        event: "paper-ticket-open",
        metadata: {
          nested: undefined,
          paperOnly: true,
          secretLike: "safe-symbol-only",
          symbol: "BTCUSDT",
        },
        route: "/api/paper-trading",
        summary: "Opened paper ticket.",
        timestamp: "2026-06-04T00:00:00.000Z",
      },
      env,
    );
    const raw = await readFile(
      path.join(dir, "alphadesk-audit-2026-06-04.jsonl"),
      "utf8",
    );
    const parsed = JSON.parse(raw.trim()) as {
      metadata: Record<string, unknown>;
      route: string;
    };

    expect(status.enabled).toBe(true);
    expect(status.writable).toBe(true);
    expect(parsed.route).toBe("/api/paper-trading");
    expect(parsed.metadata.symbol).toBe("BTCUSDT");
    expect(parsed.metadata.paperOnly).toBe(true);
    expect(parsed.metadata.nested).toBeUndefined();
  });
});
