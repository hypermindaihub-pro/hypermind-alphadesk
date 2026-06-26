export const ACCESS_COOKIE_NAME = "alphadesk_session";
export const ACCESS_SESSION_TTL_SECONDS = 60 * 60 * 8;

export type AccessEnv = Record<string, string | undefined>;
export type AccessRole = "trader" | "admin";

export type AccessConfig = {
  authRequired: boolean;
  accessCodeConfigured: boolean;
  adminCodeConfigured: boolean;
  sessionSecretConfigured: boolean;
  ready: boolean;
  accessCode: string;
  adminCode: string;
  sessionSecret: string;
};

export type AccessSession = {
  valid: boolean;
  role: AccessRole | null;
  expiresAt: number | null;
};

function envFlag(env: AccessEnv, key: string, defaultValue: boolean): boolean {
  const raw = env[key]?.trim().toLowerCase();

  if (!raw) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on", "enabled"].includes(raw);
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const byteArray = new Uint8Array(bytes);
  let binary = "";

  for (const byte of byteArray) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function stringToBase64Url(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);

  return bytesToBase64Url(bytes.slice().buffer);
}

function base64UrlToString(value: string): string | null {
  try {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoder = new TextDecoder();

    return decoder.decode(bytes);
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));

  return bytesToBase64Url(signature);
}

export function getAccessConfig(env: AccessEnv = process.env): AccessConfig {
  const accessCode = env.ALPHADESK_ACCESS_CODE?.trim() ?? "";
  const adminCode = env.ALPHADESK_ADMIN_CODE?.trim() ?? "";
  const sessionSecret = env.ALPHADESK_SESSION_SECRET?.trim() ?? "";
  const authRequired = envFlag(env, "ALPHADESK_AUTH_REQUIRED", true);

  return {
    authRequired,
    accessCodeConfigured: Boolean(accessCode),
    adminCodeConfigured: Boolean(adminCode),
    sessionSecretConfigured: Boolean(sessionSecret),
    ready: !authRequired || (Boolean(accessCode) && Boolean(sessionSecret)),
    accessCode,
    adminCode,
    sessionSecret,
  };
}

export async function createAccessToken(
  sessionSecret: string,
  nowMs = Date.now(),
  role: AccessRole = "trader",
): Promise<string> {
  const expiresAt = nowMs + ACCESS_SESSION_TTL_SECONDS * 1000;
  const payload = stringToBase64Url(JSON.stringify({ expiresAt, role }));
  const signature = await hmacSha256(payload, sessionSecret);

  return `${payload}.${signature}`;
}

export async function verifyAccessSession(
  token: string | undefined,
  sessionSecret: string,
  nowMs = Date.now(),
): Promise<AccessSession> {
  if (!token || !sessionSecret) {
    return { expiresAt: null, role: null, valid: false };
  }

  const [payload, signature] = token.split(".");
  const decoded = payload ? base64UrlToString(payload) : null;

  if (!payload || !signature || !decoded) {
    return { expiresAt: null, role: null, valid: false };
  }

  let parsed: Partial<{
    expiresAt: unknown;
    role: unknown;
  }>;

  try {
    parsed = JSON.parse(decoded) as Partial<{
      expiresAt: unknown;
      role: unknown;
    }>;
  } catch {
    return { expiresAt: null, role: null, valid: false };
  }
  const expiresAt =
    typeof parsed.expiresAt === "number" && Number.isFinite(parsed.expiresAt)
      ? parsed.expiresAt
      : null;
  const role =
    parsed.role === "admin" || parsed.role === "trader" ? parsed.role : null;

  if (!expiresAt || !role || expiresAt <= nowMs) {
    return { expiresAt, role, valid: false };
  }

  const expected = await hmacSha256(payload, sessionSecret);
  const valid = timingSafeEqual(signature, expected);

  return { expiresAt, role, valid };
}

export async function verifyAccessToken(
  token: string | undefined,
  sessionSecret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const session = await verifyAccessSession(token, sessionSecret, nowMs);

  return session.valid;
}

export function getRoleForAccessCode(
  suppliedCode: string,
  config: AccessConfig,
): AccessRole | null {
  if (!config.ready || !config.authRequired) {
    return null;
  }

  if (config.adminCode && timingSafeEqual(suppliedCode, config.adminCode)) {
    return "admin";
  }

  if (timingSafeEqual(suppliedCode, config.accessCode)) {
    return "trader";
  }

  return null;
}

export function isAccessCodeValid(
  suppliedCode: string,
  config: AccessConfig,
): boolean {
  return getRoleForAccessCode(suppliedCode, config) !== null;
}
