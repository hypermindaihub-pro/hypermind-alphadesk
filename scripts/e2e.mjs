import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const host = "127.0.0.1";
const port = 3107;
const baseUrl = `http://${host}:${port}`;
const accessCode = "alphadesk-e2e-access";
const adminCode = "alphadesk-e2e-admin";
const sessionSecret = "alphadesk-e2e-session-secret-with-enough-length";
const fakeMexcKey = "fake-e2e-mexc-key";
const fakeMexcSecret = "fake-e2e-mexc-secret";
const leakedValues = [accessCode, adminCode, sessionSecret, fakeMexcKey, fakeMexcSecret];
const requiredRoutes = [
  ["/dashboard", "Mission control workstation"],
  ["/watchlist", "Market intelligence workstation"],
  ["/agents", "Agent reasoning workstation"],
  ["/trade-ideas", "Trade idea workstation"],
  ["/risk", "Risk command workstation"],
  ["/paper-trading", "Paper execution workstation"],
  ["/journal", "Audit journal workstation"],
  ["/reports", "Reporting workstation"],
  ["/settings", "Private settings workstation"],
  ["/system-health", "System health workstation"],
  ["/cost-control", "Cost control workstation"],
];
const requiredUiAffordances = [
  ["/login", ['name="access_code"', 'action="/api/auth/login"', "Enter private desk"]],
  ["/dashboard", ["Record snapshot", "Live Trade", "Review &amp; approve paper order", "Run agent"]],
  ["/paper-trading", ["Paper order ticket", "Sync selected idea", "Submit paper ticket"]],
  ["/reports", ["Diagnostics and readiness history", "Run reconciliation"]],
  ["/settings", ["Record diagnostics", "Enable autosave", "Create vault", "Import vault"]],
  ["/system-health", ["Record diagnostics", "Run reconciliation", "Diagnostics and readiness history"]],
  ["/cost-control", ["Projected agent calls", "within budget"]],
];

let server;
let serverOutput = "";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoLeak(payload, label) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const value of leakedValues) {
    assert(!text.includes(value), `${label} leaked a private test secret.`);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 45_000;
  let lastError = "server did not respond";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status === 200) {
        return;
      }

      lastError = `unexpected /login status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for Next dev server: ${lastError}\n${serverOutput}`);
}

async function runNextBuild() {
  const nextBin = "node_modules/next/dist/bin/next";
  const build = spawn(process.execPath, [nextBin, "build"], {
    env: safeEnv(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";

  build.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  build.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const code = await new Promise((resolve) => {
    build.on("close", resolve);
  });

  if (code !== 0) {
    throw new Error(`E2E prebuild failed with exit code ${code}.\n${output}`);
  }
}

async function startServer(envOverrides = {}) {
  const nextBin = "node_modules/next/dist/bin/next";
  serverOutput = "";
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", host, "--port", String(port)],
    {
      env: safeEnv(envOverrides),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  await waitForServer();
}

async function stopServer() {
  if (!server || server.killed) {
    return;
  }

  const currentServer = server;
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2_500);
    currentServer.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    currentServer.kill();
  });
  server = undefined;
}

function cookieFrom(response) {
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie().join(", ")
      : response.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=\s*alphadesk_session=)/)
    .map((part) => part.trim().split(";")[0])
    .filter(Boolean)
    .join("; ");

  assert(cookie.includes("alphadesk_session="), "Login did not set the session cookie.");
  return cookie;
}

async function login(code, next = "/dashboard") {
  const form = new FormData();
  form.set("access_code", code);
  form.set("next", next);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    body: form,
    method: "POST",
    redirect: "manual",
  });

  assert(
    response.status >= 300 && response.status < 400,
    `Login expected redirect, got ${response.status}.`,
  );

  return cookieFrom(response);
}

async function getText(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: cookie ? { cookie } : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  assertNoLeak(text, path);

  return { response, text };
}

async function getJson(path, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie },
  });
  const payload = await response.json();
  assertNoLeak(payload, path);

  return { response, payload };
}

async function postJson(path, body, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie,
    },
    method: "POST",
    redirect: "manual",
  });
  const payload = await response.json();
  assertNoLeak(payload, path);

  return { response, payload };
}

async function readAuditLines(auditName) {
  const auditDir = path.join(process.cwd(), "data", "alphadesk-audit", auditName);
  const files = await readdir(auditDir);
  const jsonl = files.find((file) => file.endsWith(".jsonl"));
  assert(jsonl, "Configured server audit sink did not create a JSONL file.");
  const raw = await readFile(path.join(auditDir, jsonl), "utf8");
  assertNoLeak(raw, "server audit JSONL");

  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function removeGeneratedAuditDir(auditName) {
  const auditDir = path.resolve(process.cwd(), "data", "alphadesk-audit", auditName);
  const auditRoot = path.resolve(process.cwd(), "data", "alphadesk-audit");
  assert(
    auditDir.startsWith(`${auditRoot}${path.sep}`) && auditName.startsWith("e2e-"),
    "Refusing to remove an audit directory outside the E2E namespace.",
  );
  await rm(auditDir, { force: true, recursive: true });
}

function safeEnv(overrides = {}) {
  return {
    ...process.env,
    ALPHADESK_ACCESS_CODE: accessCode,
    ALPHADESK_ADMIN_CODE: adminCode,
    ALPHADESK_AUTH_REQUIRED: "true",
    ALPHADESK_SESSION_SECRET: sessionSecret,
    MEXC_API_KEY: "",
    MEXC_API_SECRET: "",
    MEXC_ORDER_TEST_MODE: "true",
    EMERGENCY_STOP: "false",
    LIVE_TRADING_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
    NO_TRADE_MODE: "false",
    OPENAI_API_KEY: "",
    PAPER_TRADING_ENABLED: "true",
    PRODUCT_DERIVATIVES_LIVE_ENABLED: "false",
    PRODUCT_SPOT_LIVE_ENABLED: "false",
    ALPHADESK_AUDIT_LOG_DIR: "",
    ...overrides,
  };
}

async function run() {
  await runNextBuild();
  await startServer();

  const unauthenticated = await getText("/dashboard");
  assert(
    unauthenticated.response.status >= 300 && unauthenticated.response.status < 400,
    "Protected dashboard should redirect without a session.",
  );
  assert(
    unauthenticated.response.headers.get("location")?.includes("/login"),
    "Protected dashboard should redirect to login.",
  );

  const traderCookie = await login(accessCode);
  const adminCookie = await login(adminCode, "/risk");

  for (const [route, expectedText] of requiredRoutes) {
    const { response, text } = await getText(route, traderCookie);
    assert(response.status === 200, `${route} expected 200, got ${response.status}.`);
    assert(text.includes(expectedText), `${route} did not render ${expectedText}.`);
    assert(text.includes("Paper trading ON"), `${route} did not show paper trading ON.`);
    assert(text.includes("Live trading OFF"), `${route} did not show live trading OFF.`);
  }

  for (const [route, expectedTexts] of requiredUiAffordances) {
    const { response, text } = await getText(route, route === "/login" ? undefined : traderCookie);
    assert(response.status === 200, `${route} UI affordance route expected 200.`);
    for (const expectedText of expectedTexts) {
      assert(
        text.includes(expectedText),
        `${route} did not render clickable/control affordance: ${expectedText}`,
      );
    }
  }

  const paperRoute = await getText("/paper-trading", traderCookie);
  assert(
    paperRoute.text.includes("Paper order ticket"),
    "Paper trading route should render the interactive ticket.",
  );
  assert(
    paperRoute.text.includes("Submit paper ticket"),
    "Paper trading route should expose the ticket submit action.",
  );

  const market = await getJson("/api/market", traderCookie);
  assert(market.response.status === 200, "/api/market should return 200.");
  assert(market.payload.status.provider === "CoinGecko", "Market provider should be CoinGecko.");
  assert(
    ["fresh", "stale", "fallback"].includes(market.payload.status.freshness),
    "Market data should expose freshness labels.",
  );
  assert(Array.isArray(market.payload.assets) && market.payload.assets.length > 0, "Market assets missing.");

  const agents = await postJson("/api/agents", {}, traderCookie);
  assert(agents.response.status === 200, "/api/agents should return 200.");
  assert(agents.payload.reasoning.mode === "deterministic-fallback", "Agent fallback should run without OPENAI_API_KEY.");
  assert(agents.payload.costUsage.allowed === true, "Agent cost control should allow the default E2E call.");
  assert(agents.payload.reasoning.bullets.length > 0, "Agent reasoning should include bullets.");
  assert(Array.isArray(agents.payload.workbench?.runs), "Agent workbench should include specialist runs.");
  assert(agents.payload.workbench.runs.length === 4, "Agent workbench should verify four specialist agents.");
  assert(
    ["market-analyst", "risk-manager", "execution-coach", "journal-coach"].every((role) =>
      agents.payload.workbench.runs.some((run) => run.role === role),
    ),
    "Agent workbench should include market, risk, execution, and journal agents.",
  );

  const paper = await postJson(
    "/api/paper-trading",
    {
      symbol: "SOLUSDT",
      side: "short",
      product: "derivatives",
      quantity: 2,
      entryPrice: 154,
      stopLoss: 162,
      takeProfit: 140,
      leverage: 2,
      confidence: 0.7,
      thesis: "E2E paper short hedge.",
      markPrice: 150,
    },
    traderCookie,
  );
  assert(paper.response.status === 200, "/api/paper-trading should return 200.");
  assert(paper.payload.position.side === "short", "Paper position should preserve short side.");
  assert(paper.payload.position.unrealizedPnlUsd > 0, "Paper short P&L should be positive when mark is below entry.");
  assert(paper.payload.audit.metadata.paperOnly === true, "Paper trade audit should be marked paper-only.");

  const invalidPaper = await postJson(
    "/api/paper-trading",
    {
      symbol: "BTCUSDT",
      side: "short",
      product: "spot",
      quantity: 1,
      entryPrice: 100,
      stopLoss: 110,
      leverage: 1,
      confidence: 0.7,
      thesis: "Invalid E2E spot short.",
    },
    traderCookie,
  );
  assert(invalidPaper.response.status === 400, "Invalid paper ticket should return 400.");
  assert(invalidPaper.payload.preview.valid === false, "Invalid paper ticket preview should be invalid.");
  assert(
    invalidPaper.payload.preview.errors.includes("Short paper tickets must use derivatives, not spot."),
    "Invalid paper ticket should explain spot-short rejection.",
  );

  const health = await getJson("/api/system-health", traderCookie);
  assert(health.response.status === 200, "/api/system-health should return 200.");
  const healthDetails = health.payload.health.checks.map((check) => check.detail).join(" ");
  assert(healthDetails.includes("Live trading is OFF by default."), "Health should confirm live trading OFF.");
  assert(healthDetails.includes("Paper trading is ON by default."), "Health should confirm paper trading ON.");
  assert(health.payload.accountDiagnostics.exchange.credentialsReady === false, "MEXC credentials should be absent in E2E.");
  assert(health.payload.serverAuditStatus.enabled === false, "Server audit storage should be disabled in default E2E.");
  assert(
    healthDetails.includes("Server audit JSONL storage is disabled."),
    "Health should report disabled server audit storage.",
  );

  const rejectedLive = await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.31,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E live rejection probe.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    adminCookie,
  );
  assert(rejectedLive.response.status === 403, "/api/live-order should reject while live is disabled.");
  assert(rejectedLive.payload.submitted === false, "Rejected live order must not be submitted.");
  assert(rejectedLive.payload.sessionRole === "admin", "Admin session should be recognized.");
  assert(
    rejectedLive.payload.reasons.includes("LIVE_TRADING_ENABLED is not true."),
    "Live rejection should include global live flag.",
  );
  assert(
    rejectedLive.payload.reasons.includes("MEXC API credentials are not configured server-side."),
    "Live rejection should include missing MEXC credentials.",
  );
  assert(
    rejectedLive.payload.diagnostic?.category === "alphadesk-guard",
    "Live rejection should include a sanitized AlphaDesk guard diagnostic.",
  );

  const nonAdminLive = await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.31,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E non-admin rejection probe.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    traderCookie,
  );
  assert(nonAdminLive.response.status === 403, "Trader session should not pass admin live guard.");
  assert(nonAdminLive.payload.sessionRole === "trader", "Trader session should be recognized.");
  assert(
    nonAdminLive.payload.reasons.includes("Admin permission did not pass."),
    "Live rejection should include admin permission failure.",
  );

  const missingManualLive = await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.31,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E manual confirmation rejection probe.",
    },
    adminCookie,
  );
  assert(missingManualLive.response.status === 403, "Missing manual confirmation should reject.");
  assert(
    missingManualLive.payload.reasons.includes("Manual confirmation phrase required: CONFIRM LIVE TRADE."),
    "Live rejection should include manual confirmation failure.",
  );

  const riskRejectedLive = await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 10,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E risk rejection probe.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    adminCookie,
  );
  assert(riskRejectedLive.response.status === 403, "Risk Manager veto should reject live orders.");
  assert(riskRejectedLive.payload.riskApproved === false, "Risk rejected live probe should expose false risk approval.");
  assert(
    riskRejectedLive.payload.reasons.includes("Risk Manager did not approve this exact trade."),
    "Live rejection should include exact Risk Manager approval failure.",
  );

  const derivativesProductRejected = await postJson(
    "/api/live-order",
    {
      symbol: "SOLUSDT",
      side: "short",
      product: "derivatives",
      quantity: 8,
      entryPrice: 154.2,
      stopLoss: 161.6,
      takeProfit: 142.8,
      leverage: 2,
      confidence: 0.64,
      thesis: "E2E derivatives product flag rejection probe.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    adminCookie,
  );
  assert(derivativesProductRejected.response.status === 403, "Disabled derivatives live flag should reject.");
  assert(derivativesProductRejected.payload.riskApproved === true, "Product flag probe should use a risk-approved trade.");
  assert(
    derivativesProductRejected.payload.reasons.includes("Live trading is disabled for derivatives."),
    "Live rejection should include product-specific derivatives flag.",
  );
  assert(
    derivativesProductRejected.payload.diagnostic?.category === "alphadesk-guard",
    "Product-flag rejection should include a sanitized diagnostic.",
  );

  const settings = await getText("/settings", traderCookie);
  assert(settings.text.includes("Secret values are never printed."), "Settings should explain secret safety.");

  const reports = await getText("/reports", traderCookie);
  assert(
    reports.text.includes("Diagnostics and readiness history"),
    "Reports should render structured readiness and diagnostics history.",
  );
  assert(
    reports.text.includes("Agent direction calls") && reports.text.includes("Brier"),
    "Reports should render dynamic forecast calibration metrics.",
  );

  await stopServer();
  await startServer({
    MEXC_API_KEY: fakeMexcKey,
    MEXC_API_SECRET: fakeMexcSecret,
    EMERGENCY_STOP: "true",
    LIVE_TRADING_ENABLED: "true",
    PRODUCT_SPOT_LIVE_ENABLED: "true",
  });
  const emergencyAdminCookie = await login(adminCode, "/risk");
  const emergencyRejectedLive = await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.31,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E emergency stop rejection probe.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    emergencyAdminCookie,
  );
  assert(emergencyRejectedLive.response.status === 403, "Emergency stop should reject live orders.");
  assert(emergencyRejectedLive.payload.submitted === false, "Emergency stop probe must not submit.");
  assert(
    emergencyRejectedLive.payload.reasons.includes("Emergency stop is active."),
    "Live rejection should include emergency stop.",
  );

  await stopServer();
  await startServer({
    MEXC_API_KEY: fakeMexcKey,
    MEXC_API_SECRET: fakeMexcSecret,
    LIVE_TRADING_ENABLED: "true",
    NO_TRADE_MODE: "true",
    PRODUCT_SPOT_LIVE_ENABLED: "true",
  });
  const noTradeAdminCookie = await login(adminCode, "/risk");
  const noTradeRejectedLive = await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.31,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E no-trade-mode rejection probe.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    noTradeAdminCookie,
  );
  assert(noTradeRejectedLive.response.status === 403, "No-trade mode should reject live orders.");
  assert(noTradeRejectedLive.payload.submitted === false, "No-trade probe must not submit.");
  assert(
    noTradeRejectedLive.payload.reasons.includes("No-trade mode is active."),
    "Live rejection should include no-trade mode.",
  );

  await stopServer();
  const auditName = `e2e-${Date.now()}`;
  await startServer({
    ALPHADESK_AUDIT_LOG_DIR: auditName,
  });
  const auditTraderCookie = await login(accessCode);
  const auditAdminCookie = await login(adminCode, "/risk");
  const auditHealth = await getJson("/api/system-health", auditTraderCookie);
  assert(auditHealth.payload.serverAuditStatus.enabled === true, "Server audit storage should be enabled.");
  assert(auditHealth.payload.serverAuditStatus.writable === true, "Server audit storage should be writable.");
  await postJson("/api/agents", {}, auditTraderCookie);
  await postJson(
    "/api/paper-trading",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.1,
      entryPrice: 3600,
      stopLoss: 3450,
      takeProfit: 3850,
      leverage: 1,
      confidence: 0.7,
      thesis: "E2E audited paper trade.",
      markPrice: 3620,
    },
    auditTraderCookie,
  );
  await postJson(
    "/api/live-order",
    {
      symbol: "ETHUSDT",
      side: "long",
      product: "spot",
      quantity: 0.31,
      entryPrice: 3625,
      stopLoss: 3478,
      takeProfit: 3890,
      leverage: 1,
      confidence: 0.71,
      thesis: "E2E audited live rejection.",
      manualConfirmation: "CONFIRM LIVE TRADE",
    },
    auditAdminCookie,
  );
  const auditEvents = await readAuditLines(auditName);
  const eventNames = auditEvents.map((event) => event.event);
  assert(eventNames.includes("agent-reasoning"), "Server audit should include agent reasoning.");
  assert(eventNames.includes("paper-ticket-open"), "Server audit should include paper ticket execution.");
  assert(eventNames.includes("live-order-rejected"), "Server audit should include live-order rejection.");
  assert(
    auditEvents.every((event) => event.metadata && typeof event.metadata === "object" && !("body" in event.metadata)),
    "Server audit metadata should stay sanitized and omit request bodies.",
  );
  await removeGeneratedAuditDir(auditName);

  await stopServer();
  await startServer({
    OPENAI_DAILY_BUDGET_USD: "0.000001",
    OPENAI_HARD_STOP_USD: "0.000001",
  });
  const budgetTraderCookie = await login(accessCode);
  const blockedAgents = await postJson("/api/agents", {}, budgetTraderCookie);
  assert(blockedAgents.response.status === 429, "Cost control should block over-budget agent calls.");
  assert(blockedAgents.payload.mode === "blocked", "Blocked agent payload should expose blocked mode.");
  assert(blockedAgents.payload.costUsage.allowed === false, "Blocked agent payload should expose disallowed cost usage.");
  assert(
    blockedAgents.payload.message.includes("Cost control blocks"),
    "Blocked agent payload should explain the cost-control rejection.",
  );

  console.log("AlphaDesk E2E passed: auth, protected route UI affordances, agents, market data, risk/live rejection matrix, paper ticket validation, paper trading, sanitized audit sink, cost blocking, settings, history, and health.");
}

try {
  await run();
} finally {
  await stopServer();
}
