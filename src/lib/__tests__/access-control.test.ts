import { describe, expect, it } from "vitest";
import {
  ACCESS_SESSION_TTL_SECONDS,
  createAccessToken,
  getAccessConfig,
  getRoleForAccessCode,
  isAccessCodeValid,
  verifyAccessSession,
  verifyAccessToken,
} from "../access-control";

describe("access control", () => {
  it("requires private access secrets by default", () => {
    const config = getAccessConfig({});

    expect(config.authRequired).toBe(true);
    expect(config.ready).toBe(false);
    expect(config.accessCodeConfigured).toBe(false);
    expect(config.adminCodeConfigured).toBe(false);
    expect(config.sessionSecretConfigured).toBe(false);
  });

  it("validates access codes without exposing the configured code", () => {
    const config = getAccessConfig({
      ALPHADESK_ACCESS_CODE: "correct-code",
      ALPHADESK_SESSION_SECRET: "session-secret",
    });

    expect(config.ready).toBe(true);
    expect(isAccessCodeValid("wrong-code", config)).toBe(false);
    expect(isAccessCodeValid("correct-code", config)).toBe(true);
    expect(getRoleForAccessCode("correct-code", config)).toBe("trader");
  });

  it("assigns admin role only when the admin code is supplied", () => {
    const config = getAccessConfig({
      ALPHADESK_ACCESS_CODE: "trader-code",
      ALPHADESK_ADMIN_CODE: "admin-code",
      ALPHADESK_SESSION_SECRET: "session-secret",
    });

    expect(config.adminCodeConfigured).toBe(true);
    expect(getRoleForAccessCode("trader-code", config)).toBe("trader");
    expect(getRoleForAccessCode("admin-code", config)).toBe("admin");
    expect(getRoleForAccessCode("wrong-code", config)).toBeNull();
  });

  it("creates expiring signed session tokens", async () => {
    const now = Date.parse("2026-05-31T00:00:00.000Z");
    const token = await createAccessToken("session-secret", now, "admin");
    const session = await verifyAccessSession(token, "session-secret", now);

    expect(session).toMatchObject({ role: "admin", valid: true });
    expect(await verifyAccessToken(token, "session-secret", now)).toBe(true);
    expect(await verifyAccessToken(token, "other-secret", now)).toBe(false);
    expect(
      await verifyAccessToken(
        token,
        "session-secret",
        now + ACCESS_SESSION_TTL_SECONDS * 1000 + 1,
      ),
    ).toBe(false);
  });
});
