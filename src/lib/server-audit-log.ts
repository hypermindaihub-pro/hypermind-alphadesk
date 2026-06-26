import "server-only";

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ServerAuditStatus = {
  enabled: boolean;
  writable: boolean;
  detail: string;
};

export type ServerAuditEvent = {
  timestamp?: string;
  route: string;
  event: string;
  actor: "system" | "agent" | "risk-manager" | "paper-trading" | "user";
  summary: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function configuredAuditDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.ALPHADESK_AUDIT_LOG_DIR?.trim();

  if (!raw) {
    return null;
  }

  const safeName =
    raw === "1" || raw.toLowerCase() === "true"
      ? "default"
      : path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, "-") || "default";

  return path.join(process.cwd(), "data", "alphadesk-audit", safeName);
}

function sanitizeMetadata(
  metadata: ServerAuditEvent["metadata"],
): Record<string, string | number | boolean> {
  const sanitized: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function logPathFor(date: Date, env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = configuredAuditDir(env);

  if (!dir) {
    return null;
  }

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return path.join(dir, `alphadesk-audit-${yyyy}-${mm}-${dd}.jsonl`);
}

export async function getServerAuditStatus(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ServerAuditStatus> {
  const dir = configuredAuditDir(env);

  if (!dir) {
    return {
      detail: "Server audit JSONL storage is disabled. Set ALPHADESK_AUDIT_LOG_DIR to enable it.",
      enabled: false,
      writable: false,
    };
  }

  try {
    await mkdir(dir, { recursive: true });
    const info = await stat(dir);

    if (!info.isDirectory()) {
      return {
        detail: "Configured server audit path is not a directory.",
        enabled: true,
        writable: false,
      };
    }

    return {
      detail: "Server audit JSONL storage is enabled and writable.",
      enabled: true,
      writable: true,
    };
  } catch {
    return {
      detail: "Server audit JSONL storage is enabled but not writable.",
      enabled: true,
      writable: false,
    };
  }
}

export async function appendServerAuditEvent(
  event: ServerAuditEvent,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ServerAuditStatus> {
  const now = event.timestamp ? new Date(event.timestamp) : new Date();
  const filePath = logPathFor(Number.isNaN(now.getTime()) ? new Date() : now, env);

  if (!filePath) {
    return getServerAuditStatus(env);
  }

  const status = await getServerAuditStatus(env);

  if (!status.writable) {
    return status;
  }

  const payload = {
    actor: event.actor,
    event: event.event,
    metadata: sanitizeMetadata(event.metadata),
    route: event.route,
    summary: event.summary,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  await writeFile(filePath, `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    flag: "a",
  });

  return status;
}
