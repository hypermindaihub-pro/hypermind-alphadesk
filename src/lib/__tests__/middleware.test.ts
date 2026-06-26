import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { middleware } from "../../../middleware";
import { ACCESS_COOKIE_NAME, createAccessToken } from "../access-control";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("private access middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the login page without a session", async () => {
    vi.stubEnv("ALPHADESK_AUTH_REQUIRED", "true");
    vi.stubEnv("ALPHADESK_ACCESS_CODE", "desk-code");
    vi.stubEnv("ALPHADESK_SESSION_SECRET", "desk-session-secret");

    const response = await middleware(request("/login"));

    expect(response.status).toBe(200);
  });

  it("redirects protected pages to setup when access secrets are missing", async () => {
    vi.stubEnv("ALPHADESK_AUTH_REQUIRED", "true");
    vi.stubEnv("ALPHADESK_ACCESS_CODE", "");
    vi.stubEnv("ALPHADESK_SESSION_SECRET", "");

    const response = await middleware(request("/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?setup=required");
  });

  it("rejects protected APIs without a valid session", async () => {
    vi.stubEnv("ALPHADESK_AUTH_REQUIRED", "true");
    vi.stubEnv("ALPHADESK_ACCESS_CODE", "desk-code");
    vi.stubEnv("ALPHADESK_SESSION_SECRET", "desk-session-secret");

    const response = await middleware(request("/api/system-health"));
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Authentication required.");
  });

  it("allows protected pages with a signed session cookie", async () => {
    vi.stubEnv("ALPHADESK_AUTH_REQUIRED", "true");
    vi.stubEnv("ALPHADESK_ACCESS_CODE", "desk-code");
    vi.stubEnv("ALPHADESK_SESSION_SECRET", "desk-session-secret");
    const token = await createAccessToken("desk-session-secret", Date.now(), "trader");

    const response = await middleware(
      request("/dashboard", `${ACCESS_COOKIE_NAME}=${token}`),
    );

    expect(response.status).toBe(200);
  });
});
