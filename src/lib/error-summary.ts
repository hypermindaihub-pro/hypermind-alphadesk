function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMessage(value: unknown): string | undefined {
  if (value instanceof Error && value.message.trim()) {
    return value.message.trim();
  }

  if (isRecord(value) && typeof value.message === "string" && value.message.trim()) {
    return value.message.trim();
  }

  return undefined;
}

export function summarizeError(error: unknown, fallback: string): string {
  const messages = [readMessage(error)];
  const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
  const hostname =
    isRecord(error) && typeof error.hostname === "string" ? error.hostname : undefined;
  const cause = isRecord(error) ? error.cause : undefined;

  if (code && hostname) {
    messages.push(`${code} ${hostname}`);
  } else if (code) {
    messages.push(code);
  }

  messages.push(readMessage(cause));

  if (isRecord(cause)) {
    const code = typeof cause.code === "string" ? cause.code : undefined;
    const hostname = typeof cause.hostname === "string" ? cause.hostname : undefined;

    if (code && hostname) {
      messages.push(`${code} ${hostname}`);
    } else if (code) {
      messages.push(code);
    }
  }

  const uniqueMessages = Array.from(
    new Set(messages.filter((message): message is string => Boolean(message))),
  );

  return uniqueMessages.length ? uniqueMessages.join(" / ") : fallback;
}
