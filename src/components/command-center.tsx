"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AccessRole } from "@/lib/access-control";
import type { AccountDiagnostics } from "@/lib/account-diagnostics";
import type { AlphaConfig } from "@/lib/config";
import { estimateAgentCost } from "@/lib/cost-control";
import {
  createPersistedDeskState,
  DESK_STORAGE_KEY,
  type PersistedDeskState,
  serializeDeskState,
} from "@/lib/desk-storage";
import {
  clearAllDeskStorage,
  DESK_ENCRYPTED_STORAGE_KEY,
  selectInitialDeskStorage,
  type DeskPersistenceMode,
} from "@/lib/desk-secure-storage";
import { decryptDeskVault, encryptDeskVault } from "@/lib/desk-vault";
import { MANUAL_CONFIRMATION_PHRASE } from "@/lib/execution-guards";
import { buildForecastCalibration } from "@/lib/forecast-calibration";
import { formatCompactUsd, formatPct, formatUsd, formatUtcDateTime } from "@/lib/format";
import { appendJournalEntry, createJournalEntry } from "@/lib/journal";
import { buildLaunchReadinessSnapshot } from "@/lib/launch-readiness";
import {
  createAccountDiagnosticsHistoryEntry,
  createLaunchReadinessHistoryEntry,
  prependCapped,
  type AccountDiagnosticsHistoryEntry,
  type LaunchReadinessHistoryEntry,
} from "@/lib/desk-history";
import type { AgentWorkbenchResult } from "@/lib/agent-workbench";
import type { AgentReasoning } from "@/lib/openai-agent";
import { buildOperatorBrief } from "@/lib/operator-brief";
import type {
  LocalOrderRecord,
  OrderReconciliationSummary,
} from "@/lib/order-reconciliation";
import {
  buildPaperOrderTicket,
  executePaperOrderTicket,
  type PaperOrderTicketInput,
} from "@/lib/paper-order-ticket";
import type { PositionReconciliationSummary } from "@/lib/position-reconciliation";
import type { WalletReconciliationSummary } from "@/lib/wallet-reconciliation";
import {
  closePaperPosition,
  markPaperPosition,
} from "@/lib/paper-trading";
import { evaluateRisk } from "@/lib/risk-manager";
import {
  seedJournalEntries,
  seedPaperPositions,
  seedPortfolio,
  seedTradeIdeas,
} from "@/lib/sample-data";
import type {
  ExchangeAdapterStatus,
  CostUsage,
  HealthCheck,
  JournalEntry,
  MarketDataResult,
  PaperPosition,
  TradeIntent,
  TradeProduct,
  TradeSide,
} from "@/lib/types";
import { MarketTable } from "./market-table";
import { StatusChip } from "./status-chip";

export type CommandView =
  | "dashboard"
  | "watchlist"
  | "agents"
  | "trade-ideas"
  | "risk"
  | "paper-trading"
  | "journal"
  | "reports"
  | "settings"
  | "system-health"
  | "cost-control";

type CommandCenterProps = {
  accountDiagnostics: AccountDiagnostics;
  initialView: CommandView;
  marketData: MarketDataResult;
  config: AlphaConfig;
  exchangeStatus: ExchangeAdapterStatus;
  costUsage: CostUsage;
  healthChecks: HealthCheck[];
  sessionRole: AccessRole | null;
};

type DraftIdea = {
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  leverage: string;
  confidence: string;
  thesis: string;
};

type PaperTicketDraft = {
  symbol: string;
  side: TradeSide;
  product: TradeProduct;
  quantity: string;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  leverage: string;
  confidence: string;
  thesis: string;
};

const viewLabels: Record<CommandView, string> = {
  dashboard: "Mission Control",
  watchlist: "Watchlist",
  agents: "AI Agents",
  "trade-ideas": "Trade Ideas",
  risk: "Risk Manager",
  "paper-trading": "Paper Trading",
  journal: "Journal",
  reports: "Reports",
  settings: "Settings",
  "system-health": "System Health",
  "cost-control": "Cost Control",
};

const viewOrder: CommandView[] = [
  "dashboard",
  "watchlist",
  "agents",
  "trade-ideas",
  "risk",
  "paper-trading",
  "journal",
  "reports",
  "settings",
  "system-health",
  "cost-control",
];

function fieldNumber(value: string, fallback = 0): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function marketPriceFor(symbol: string, marketData: MarketDataResult): number | undefined {
  const normalized = symbol.replace("USDT", "").toUpperCase();
  return marketData.assets.find((asset) => asset.symbol === normalized)?.price;
}

function positionMark(position: PaperPosition, marketData: MarketDataResult): PaperPosition {
  const mark = marketPriceFor(position.symbol, marketData) ?? position.markPrice;
  return markPaperPosition(position, mark);
}

function createTradeFromDraft(draft: DraftIdea): TradeIntent {
  return {
    id: `idea-${draft.symbol.toLowerCase()}-${Date.now()}`,
    symbol: draft.symbol.trim().toUpperCase(),
    side: draft.side,
    product: draft.product,
    quantity: fieldNumber(draft.quantity),
    entryPrice: fieldNumber(draft.entryPrice),
    stopLoss: fieldNumber(draft.stopLoss),
    takeProfit: fieldNumber(draft.takeProfit),
    leverage: fieldNumber(draft.leverage, 1),
    confidence: fieldNumber(draft.confidence, 62) / 100,
    thesis: draft.thesis.trim() || "Manual thesis pending review.",
  };
}

function paperTicketFromTrade(trade: TradeIntent): PaperTicketDraft {
  return {
    confidence: String(Math.round(trade.confidence * 100)),
    entryPrice: String(trade.entryPrice),
    leverage: String(trade.leverage),
    product: trade.product,
    quantity: String(trade.quantity),
    side: trade.side,
    stopLoss: String(trade.stopLoss),
    symbol: trade.symbol,
    takeProfit: trade.takeProfit === undefined ? "" : String(trade.takeProfit),
    thesis: trade.thesis,
  };
}

function Panel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-white/10 bg-[#111511] p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-1 break-words text-sm leading-6 text-zinc-400">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const className = {
    primary:
      "border-emerald-300/40 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/25",
    secondary: "border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]",
    danger: "border-red-300/35 bg-red-400/10 text-red-100 hover:bg-red-400/20",
  }[variant];

  return (
    <button
      className={`rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <input
        className="mt-2 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/50"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

export function CommandCenter({
  accountDiagnostics,
  initialView,
  marketData,
  config,
  exchangeStatus,
  costUsage,
  healthChecks,
  sessionRole,
}: CommandCenterProps) {
  const seedDeskState = useMemo(
    () =>
      createPersistedDeskState({
        selectedIdeaId: seedTradeIdeas[1]?.id ?? seedTradeIdeas[0]?.id ?? "",
        ideas: seedTradeIdeas,
        positions: seedPaperPositions.map((position) => positionMark(position, marketData)),
        journal: seedJournalEntries,
      }),
    [marketData],
  );
  const initialDeskState = useMemo(
    () => ({
      mode: "plaintext" as DeskPersistenceMode,
      state: seedDeskState,
      status: "Local private desk storage will hydrate after the app loads.",
    }),
    [seedDeskState],
  );
  const [activeView, setActiveView] = useState<CommandView>(initialView);
  const [ideas, setIdeas] = useState<TradeIntent[]>(initialDeskState.state.ideas);
  const [selectedIdeaId, setSelectedIdeaId] = useState(
    initialDeskState.state.selectedIdeaId,
  );
  const [positions, setPositions] = useState<PaperPosition[]>(
    initialDeskState.state.positions,
  );
  const [journal, setJournal] = useState<JournalEntry[]>(
    initialDeskState.state.journal,
  );
  const [readinessHistory, setReadinessHistory] = useState<
    LaunchReadinessHistoryEntry[]
  >(initialDeskState.state.readinessHistory);
  const [diagnosticsHistory, setDiagnosticsHistory] = useState<
    AccountDiagnosticsHistoryEntry[]
  >(initialDeskState.state.diagnosticsHistory);
  const [persistenceMode, setPersistenceMode] = useState<DeskPersistenceMode>(
    initialDeskState.mode,
  );
  const [storageStatus, setStorageStatus] = useState(initialDeskState.status);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [agent, setAgent] = useState<AgentReasoning | null>(null);
  const [agentWorkbench, setAgentWorkbench] = useState<AgentWorkbenchResult | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [reconciliation, setReconciliation] =
    useState<OrderReconciliationSummary | null>(null);
  const [liveOrders, setLiveOrders] = useState<LocalOrderRecord[]>([]);
  const [positionReconciliation, setPositionReconciliation] =
    useState<PositionReconciliationSummary | null>(null);
  const [walletReconciliation, setWalletReconciliation] =
    useState<WalletReconciliationSummary | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationMessage, setReconciliationMessage] = useState(
    "Run reconciliation to compare local paper orders with exchange-style order status snapshots.",
  );
  const [liveProbe, setLiveProbe] = useState<{
    submitted: boolean;
    reasons: string[];
    diagnostic?: {
      category: string;
      label: string;
      operatorAction: string;
    } | null;
    order?: {
      retCode?: number;
      retMsg?: string;
      orderId?: string;
      orderLinkId?: string;
    };
    requiredManualConfirmation: string;
  } | null>(null);
  const [executionMode, setExecutionMode] = useState<"paper" | "live">("paper");
  const [manualConfirmation, setManualConfirmation] = useState("");
  const [note, setNote] = useState("");
  const [projectedCalls, setProjectedCalls] = useState("4");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultPayload, setVaultPayload] = useState("");
  const [vaultStatus, setVaultStatus] = useState(
    "Encrypted vault backup is ready when you provide a passphrase.",
  );
  const [draft, setDraft] = useState<DraftIdea>({
    symbol: "BTCUSDT",
    side: "long",
    product: "spot",
    quantity: "0.02",
    entryPrice: String(marketPriceFor("BTCUSDT", marketData) ?? 67420),
    stopLoss: "65100",
    takeProfit: "71200",
    leverage: "1",
    confidence: "68",
    thesis: "Manual idea: range reclaim with invalidation below support.",
  });
  const [paperTicket, setPaperTicket] = useState<PaperTicketDraft>(() =>
    paperTicketFromTrade(
      seedTradeIdeas[1] ??
        seedTradeIdeas[0] ?? {
          confidence: 0.62,
          entryPrice: 0,
          id: "fallback-ticket",
          leverage: 1,
          product: "spot",
          quantity: 0,
          side: "long",
          stopLoss: 0,
          symbol: "BTCUSDT",
          thesis: "Fallback paper ticket.",
        },
    ),
  );
  const [paperTicketStatus, setPaperTicketStatus] = useState(
    "Paper ticket is ready for review.",
  );

  const fallbackIdea: TradeIntent = seedTradeIdeas[0] ?? {
    id: "fallback-idea",
    symbol: "BTCUSDT",
    side: "long",
    product: "spot",
    quantity: 0.01,
    entryPrice: 0,
    stopLoss: 0,
    leverage: 1,
    confidence: 0,
    thesis: "Fallback idea.",
  };
  const selectedIdea =
    ideas.find((idea) => idea.id === selectedIdeaId) ?? ideas[0] ?? fallbackIdea;
  const paperTicketPreview = useMemo(
    () => buildPaperOrderTicket(paperTicket),
    [paperTicket],
  );
  const riskDecision = useMemo(
    () => evaluateRisk(selectedIdea, seedPortfolio, config),
    [selectedIdea, config],
  );
  const launchReadiness = useMemo(
    () =>
      buildLaunchReadinessSnapshot({
        accountDiagnostics,
        adminPermission: sessionRole === "admin",
        exchangeStatus,
        config,
        manualConfirmation,
        orderReconciliation: reconciliation,
        positionReconciliation,
        riskDecision,
        trade: selectedIdea,
        walletReconciliation,
      }),
    [
      accountDiagnostics,
      exchangeStatus,
      config,
      manualConfirmation,
      positionReconciliation,
      reconciliation,
      riskDecision,
      selectedIdea,
      sessionRole,
      walletReconciliation,
    ],
  );
  const markedPositions = useMemo(
    () => positions.map((position) => positionMark(position, marketData)),
    [positions, marketData],
  );
  const openPositions = useMemo(
    () => markedPositions.filter((position) => !position.closedAt),
    [markedPositions],
  );
  const closedPositions = useMemo(
    () => markedPositions.filter((position) => position.closedAt),
    [markedPositions],
  );
  const unrealizedPnl = openPositions.reduce(
    (sum, position) => sum + position.unrealizedPnlUsd,
    0,
  );
  const realizedPnl = closedPositions.reduce(
    (sum, position) => sum + (position.realizedPnlUsd ?? 0),
    0,
  );
  const forecastCalibration = useMemo(
    () =>
      buildForecastCalibration({
        ideas,
        journal,
        positions: markedPositions,
      }),
    [ideas, journal, markedPositions],
  );
  const projectedCost = estimateAgentCost(
    1200 * fieldNumber(projectedCalls, 0),
    300 * fieldNumber(projectedCalls, 0),
    0,
    config,
  );
  const operatorBrief = useMemo(
    () =>
      buildOperatorBrief({
        costUsage: projectedCost,
        journalCount: journal.length,
        launchReadiness,
        marketStatus: marketData.status,
        openPositions,
        riskDecision,
        selectedIdea,
        view: activeView,
      }),
    [
      activeView,
      journal.length,
      launchReadiness,
      marketData.status,
      openPositions,
      projectedCost,
      riskDecision,
      selectedIdea,
    ],
  );

  const currentDeskState = useCallback((): PersistedDeskState => {
    return createPersistedDeskState({
      diagnosticsHistory,
      selectedIdeaId: selectedIdea.id,
      ideas,
      positions,
      journal,
      readinessHistory,
    });
  }, [
    diagnosticsHistory,
    ideas,
    journal,
    positions,
    readinessHistory,
    selectedIdea.id,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timeout = window.setTimeout(() => {
      const restored = selectInitialDeskStorage(
        window.localStorage.getItem(DESK_STORAGE_KEY),
        window.localStorage.getItem(DESK_ENCRYPTED_STORAGE_KEY),
        seedDeskState,
      );

      setIdeas(restored.state.ideas);
      setSelectedIdeaId(restored.state.selectedIdeaId);
      setPositions(restored.state.positions);
      setJournal(restored.state.journal);
      setReadinessHistory(restored.state.readinessHistory);
      setDiagnosticsHistory(restored.state.diagnosticsHistory);
      setPersistenceMode(restored.mode);
      setStorageStatus(restored.status);
      setStorageHydrated(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [seedDeskState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!storageHydrated) {
      return;
    }

    const state = currentDeskState();

    if (persistenceMode === "plaintext") {
      window.localStorage.setItem(DESK_STORAGE_KEY, serializeDeskState(state));
      return;
    }

    if (persistenceMode === "encrypted-locked") {
      return;
    }

    if (!vaultPassphrase.trim()) {
      const timeout = window.setTimeout(() => {
        setStorageStatus(
          "Encrypted autosave is unlocked but paused until the passphrase is entered again.",
        );
      }, 0);

      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      encryptDeskVault(state, vaultPassphrase)
        .then((encrypted) => {
          if (cancelled) {
            return;
          }

          window.localStorage.setItem(DESK_ENCRYPTED_STORAGE_KEY, encrypted);
          window.localStorage.removeItem(DESK_STORAGE_KEY);
          setStorageStatus(
            `Encrypted autosave saved at ${new Date().toLocaleTimeString()}.`,
          );
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setStorageStatus(
            error instanceof Error
              ? `Encrypted autosave paused: ${error.message}`
              : "Encrypted autosave paused.",
          );
        });
    }, 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [currentDeskState, persistenceMode, storageHydrated, vaultPassphrase]);

  function addJournal(entry: Omit<JournalEntry, "id" | "timestamp">) {
    setJournal((current) => appendJournalEntry(current, createJournalEntry(entry)));
  }

  function recordLaunchReadinessSnapshot() {
    const entry = createLaunchReadinessHistoryEntry(launchReadiness);
    setReadinessHistory((current) => prependCapped(current, entry, 120));
    addJournal({
      actor: "risk-manager",
      event: "launch-readiness",
      summary: `Launch readiness snapshot recorded as ${launchReadiness.status} with score ${launchReadiness.score}/100.`,
      metadata: {
        blockers: launchReadiness.blockers.length,
        liveAllowed: launchReadiness.liveExecutionAllowed,
        paperTrading: launchReadiness.paperTradingEnabled,
        score: launchReadiness.score,
        status: launchReadiness.status,
        warnings: launchReadiness.warnings.length,
      },
    });
  }

  function recordAccountDiagnosticsSnapshot() {
    const entry = createAccountDiagnosticsHistoryEntry(accountDiagnostics);
    setDiagnosticsHistory((current) => prependCapped(current, entry, 120));
    addJournal({
      actor: "system",
      event: "account-diagnostics-snapshot",
      summary: `Account diagnostics snapshot recorded as ${entry.status} from ${entry.source}.`,
      metadata: {
        credentialsReady: entry.credentialsReady,
        failCount: entry.failCount,
        status: entry.status,
        testnet: entry.testnet,
        warningCount: entry.warningCount,
      },
    });
  }

  function syncPaperTicketFromSelectedIdea() {
    setExecutionMode("paper");
    setPaperTicket(paperTicketFromTrade(selectedIdea));
    setPaperTicketStatus(`Ticket synced from ${selectedIdea.symbol}.`);
  }

  function executeSelectedIdeaAsPaperTrade() {
    const selectedTicket = paperTicketFromTrade(selectedIdea);
    const result = executePaperOrderTicket(
      selectedTicket as PaperOrderTicketInput,
      marketPriceFor(selectedTicket.symbol, marketData) ?? selectedIdea.entryPrice,
    );

    setExecutionMode("paper");
    setPaperTicket(selectedTicket);

    if (!result.preview.valid || !result.position || !result.audit) {
      setPaperTicketStatus(
        `Selected idea rejected for paper execution: ${result.preview.errors.join("; ")}`,
      );
      addJournal({
        actor: "paper-trading",
        event: "paper-ticket-rejected",
        summary: `Rejected selected paper trade ${selectedIdea.symbol}: ${result.preview.errors.join("; ")}`,
        metadata: {
          errorCount: result.preview.errors.length,
          paperOnly: true,
          symbol: selectedIdea.symbol,
        },
      });
      return;
    }

    const { audit, position } = result;

    setPositions((current) => [position, ...current]);
    setJournal((current) => appendJournalEntry(current, audit));
    setPaperTicketStatus(
      `Paper Trade selected. Opened ${result.preview.trade.symbol} ${result.preview.trade.side} with ${formatUsd(
        result.preview.notionalUsd,
        2,
      )} simulated notional.`,
    );
  }

  function submitPaperTicket() {
    setExecutionMode("paper");
    const result = executePaperOrderTicket(
      paperTicket as PaperOrderTicketInput,
      marketPriceFor(paperTicket.symbol, marketData) ?? paperTicketPreview.trade.entryPrice,
    );

    if (!result.preview.valid || !result.position || !result.audit) {
      setPaperTicketStatus(result.preview.errors.join(" ") || "Ticket is not valid.");
      addJournal({
        actor: "paper-trading",
        event: "paper-ticket-rejected",
        summary: `Rejected paper ticket ${paperTicket.symbol}: ${result.preview.errors.join("; ")}`,
        metadata: {
          errorCount: result.preview.errors.length,
          paperOnly: true,
          symbol: paperTicket.symbol,
        },
      });
      return;
    }

    const { audit, position } = result;

    setPositions((current) => [position, ...current]);
    setJournal((current) => appendJournalEntry(current, audit));
    setPaperTicketStatus(
      `Opened paper ticket ${result.preview.trade.symbol} with ${formatUsd(
        result.preview.notionalUsd,
        2,
      )} notional.`,
    );
  }

  function closeFirstOpenPosition() {
    const firstOpen = openPositions[0];

    if (!firstOpen) {
      return;
    }

    const closed = closePaperPosition(firstOpen, firstOpen.markPrice);
    setPositions((current) =>
      current.map((position) => (position.id === firstOpen.id ? closed : position)),
    );
    addJournal({
      actor: "paper-trading",
      event: "paper-close",
      summary: `Closed paper ${firstOpen.symbol} ${firstOpen.side} with ${formatUsd(
        closed.realizedPnlUsd ?? 0,
        2,
      )} realized P&L.`,
      metadata: {
        symbol: firstOpen.symbol,
        realizedPnlUsd: closed.realizedPnlUsd ?? 0,
      },
    });
  }

  function submitDraftIdea() {
    const trade = createTradeFromDraft(draft);
    setIdeas((current) => [trade, ...current]);
    setSelectedIdeaId(trade.id);
    setActiveView("risk");
    addJournal({
      actor: "user",
      event: "idea-created",
      summary: `Created manual trade idea for ${trade.symbol}; Risk Manager review is required.`,
      metadata: {
        symbol: trade.symbol,
        side: trade.side,
        product: trade.product,
      },
    });
  }

  async function runAgent() {
    setAgentLoading(true);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        reasoning?: AgentReasoning;
        workbench?: AgentWorkbenchResult;
        message?: string;
      };
      const nextAgent =
        payload.reasoning ??
        ({
          mode: "deterministic-fallback",
          model: config.openAiModel,
          summary: payload.message ?? "Agent call did not return reasoning.",
          bullets: ["Review cost controls and API readiness before retrying."],
        } satisfies AgentReasoning);
      setAgent(nextAgent);
      setAgentWorkbench(payload.workbench ?? null);
      addJournal({
        actor: "agent",
        event: "reasoning",
        summary: `Agent reasoning ran in ${nextAgent.mode} mode.`,
        metadata: {
          mode: nextAgent.mode,
          model: nextAgent.model,
        },
      });
    } finally {
      setAgentLoading(false);
    }
  }

  async function runExchangeReconciliation() {
    setReconciliationLoading(true);
    try {
      const response = await fetch("/api/reconciliation", {
        body: JSON.stringify({
          liveOrders,
          positions: markedPositions,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as {
        pollingMessage?: string;
        positionReconciliation?: PositionReconciliationSummary;
        reconciliation?: OrderReconciliationSummary;
        walletReconciliation?: WalletReconciliationSummary;
      };

      if (!payload.reconciliation) {
        setReconciliationMessage("Reconciliation did not return a report.");
        return;
      }

      setReconciliation(payload.reconciliation);
      setPositionReconciliation(payload.positionReconciliation ?? null);
      setWalletReconciliation(payload.walletReconciliation ?? null);
      setReconciliationMessage(
        payload.pollingMessage ?? "Reconciliation completed.",
      );
      addJournal({
        actor: "system",
        event: "exchange-reconciliation",
        summary: `Exchange reconciliation ${payload.reconciliation.status}: ${payload.reconciliation.matched} orders matched, ${payload.reconciliation.mismatched} order mismatches, ${payload.positionReconciliation?.mismatched ?? 0} position mismatches, ${payload.walletReconciliation?.mismatched ?? 0} wallet mismatches.`,
        metadata: {
          matched: payload.reconciliation.matched,
          missingOnExchange: payload.reconciliation.missingOnExchange,
          mode: payload.reconciliation.mode,
          mismatched: payload.reconciliation.mismatched,
          positionMismatches: payload.positionReconciliation?.mismatched ?? 0,
          walletMismatches: payload.walletReconciliation?.mismatched ?? 0,
        },
      });
    } catch {
      setReconciliationMessage("Reconciliation failed before a safe report was produced.");
    } finally {
      setReconciliationLoading(false);
    }
  }

  async function probeLiveExecution() {
    setExecutionMode("live");
    const response = await fetch("/api/live-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...selectedIdea,
        manualConfirmation,
      }),
    });
    const payload = (await response.json()) as {
      submitted: boolean;
      reasons: string[];
      diagnostic?: {
        category: string;
        label: string;
        operatorAction: string;
      } | null;
      order?: {
        retCode?: number;
        retMsg?: string;
        orderId?: string;
        orderLinkId?: string;
      };
      requiredManualConfirmation: string;
    };
    setLiveProbe(payload);
    if (payload.submitted && (payload.order?.orderLinkId || payload.order?.orderId)) {
      setLiveOrders((current) => [
        {
          clientOrderId: payload.order?.orderLinkId ?? payload.order?.orderId ?? selectedIdea.id,
          expectedStatus: "expected-filled",
          id: payload.order?.orderId ?? payload.order?.orderLinkId ?? selectedIdea.id,
          product: selectedIdea.product,
          quantity: selectedIdea.quantity,
          side: selectedIdea.side,
          source: "live",
          symbol: selectedIdea.symbol,
          updatedAt: new Date().toISOString(),
        },
        ...current,
      ]);
    }
    addJournal({
      actor: "risk-manager",
      event: "live-guard-check",
      summary: payload.submitted
        ? `Live Trade submitted on MEXC ${exchangeStatus.orderTestMode ? "test-order mode" : "mainnet"}.`
        : `Live Trade rejected by execution guards: ${payload.reasons.join("; ")}`,
      metadata: {
        mode: "live",
        orderLinkId: payload.order?.orderLinkId ?? "",
        submitted: payload.submitted,
        reasonCount: payload.reasons.length,
      },
    });
  }

  function addManualNote() {
    if (!note.trim()) {
      return;
    }

    addJournal({
      actor: "user",
      event: "manual-note",
      summary: note.trim(),
      metadata: {
        source: "journal",
      },
    });
    setNote("");
  }

  function resetLocalDesk() {
    clearAllDeskStorage(window.localStorage);
    setIdeas(seedDeskState.ideas);
    setSelectedIdeaId(seedDeskState.selectedIdeaId);
    setPositions(seedDeskState.positions);
    setLiveOrders([]);
    setJournal(seedDeskState.journal);
    setReadinessHistory(seedDeskState.readinessHistory);
    setDiagnosticsHistory(seedDeskState.diagnosticsHistory);
    setPersistenceMode("plaintext");
    setLiveProbe(null);
    setAgent(null);
    setManualConfirmation("");
    setVaultPassphrase("");
    setStorageStatus("Local desk state reset to safe seed data with plaintext browser persistence.");
    setVaultStatus("Encrypted local desk storage was cleared by the reset.");
  }

  async function enableEncryptedAutosave() {
    try {
      const encrypted = await encryptDeskVault(currentDeskState(), vaultPassphrase);

      window.localStorage.setItem(DESK_ENCRYPTED_STORAGE_KEY, encrypted);
      window.localStorage.removeItem(DESK_STORAGE_KEY);
      setPersistenceMode("encrypted-unlocked");
      setVaultPayload(encrypted);
      setStorageStatus("Encrypted autosave is ON. Plaintext browser storage was removed.");
      setVaultStatus("Encrypted autosave enabled. Passphrase is held only in memory.");
    } catch (error) {
      setVaultStatus(
        error instanceof Error
          ? error.message
          : "Unable to enable encrypted autosave.",
      );
    }
  }

  async function unlockEncryptedAutosave() {
    try {
      const encrypted = window.localStorage.getItem(DESK_ENCRYPTED_STORAGE_KEY);

      if (!encrypted) {
        setVaultStatus("No encrypted local desk storage was found in this browser.");
        return;
      }

      const restored = await decryptDeskVault(encrypted, vaultPassphrase, seedDeskState);

      setIdeas(restored.ideas);
      setSelectedIdeaId(restored.selectedIdeaId);
      setPositions(restored.positions);
      setJournal(restored.journal);
      setReadinessHistory(restored.readinessHistory);
      setDiagnosticsHistory(restored.diagnosticsHistory);
      setPersistenceMode("encrypted-unlocked");
      window.localStorage.removeItem(DESK_STORAGE_KEY);
      setVaultPayload(encrypted);
      setStorageStatus("Encrypted desk unlocked. Autosave will remain encrypted.");
      setVaultStatus("Encrypted local desk restored. Passphrase was not stored.");
    } catch (error) {
      setVaultStatus(
        error instanceof Error ? error.message : "Unable to unlock encrypted desk.",
      );
    }
  }

  function lockEncryptedAutosave() {
    setPersistenceMode("encrypted-locked");
    setVaultPassphrase("");
    setStorageStatus(
      "Encrypted desk locked. Current screen remains visible until refresh; autosave is paused.",
    );
    setVaultStatus("Passphrase cleared from memory.");
  }

  function disableEncryptedAutosave() {
    window.localStorage.removeItem(DESK_ENCRYPTED_STORAGE_KEY);
    window.localStorage.setItem(DESK_STORAGE_KEY, serializeDeskState(currentDeskState()));
    setPersistenceMode("plaintext");
    setStorageStatus("Encrypted autosave is OFF. Plaintext browser persistence is active.");
    setVaultStatus("Encrypted local desk storage removed from this browser.");
  }

  async function createEncryptedVault() {
    try {
      const encrypted = await encryptDeskVault(currentDeskState(), vaultPassphrase);
      setVaultPayload(encrypted);
      setVaultStatus("Encrypted vault created. Store it somewhere private.");
    } catch (error) {
      setVaultStatus(error instanceof Error ? error.message : "Unable to create vault.");
    }
  }

  async function importEncryptedVault() {
    try {
      const restored = await decryptDeskVault(
        vaultPayload,
        vaultPassphrase,
        seedDeskState,
      );
      setIdeas(restored.ideas);
      setSelectedIdeaId(restored.selectedIdeaId);
      setPositions(restored.positions);
      setJournal(restored.journal);
      setReadinessHistory(restored.readinessHistory);
      setDiagnosticsHistory(restored.diagnosticsHistory);
      window.localStorage.setItem(DESK_ENCRYPTED_STORAGE_KEY, vaultPayload);
      window.localStorage.removeItem(DESK_STORAGE_KEY);
      setPersistenceMode("encrypted-unlocked");
      setStorageStatus("Encrypted vault restored. Autosave will remain encrypted.");
      setVaultStatus("Encrypted vault restored. Passphrase was not stored.");
    } catch (error) {
      setVaultStatus(error instanceof Error ? error.message : "Unable to import vault.");
    }
  }

  async function downloadEncryptedVault() {
    try {
      const encrypted =
        vaultPayload.trim() || (await encryptDeskVault(currentDeskState(), vaultPassphrase));
      const blob = new Blob([encrypted], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `alphadesk-vault-${new Date()
        .toISOString()
        .replaceAll(":", "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setVaultPayload(encrypted);
      setVaultStatus("Encrypted vault downloaded. Keep the passphrase separately.");
    } catch (error) {
      setVaultStatus(error instanceof Error ? error.message : "Unable to download vault.");
    }
  }

  function renderOperatorBrief() {
    return (
      <section className="rounded-lg border border-emerald-300/15 bg-[#101510] p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {operatorBrief.title}
            </p>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-300">
              {operatorBrief.summary}
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-white/8 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Next operator move
                </p>
                <p className="mt-2 text-sm leading-6 text-white">
                  {operatorBrief.primaryAction}
                </p>
              </div>
              <div className="rounded-md border border-amber-300/15 bg-amber-300/5 p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-amber-200">
                  Safety note
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-100">
                  {operatorBrief.safetyNote}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-md border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
              Live evidence
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {operatorBrief.evidence.map((item) => (
                <StatusChip
                  key={`${item.label}-${item.value}`}
                  label={`${item.label}: ${item.value}`}
                  tone={item.tone}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderTradeIdeaRows() {
    return (
      <div className="grid gap-3">
        {ideas.map((idea) => {
          const decision = evaluateRisk(idea, seedPortfolio, config);
          const selected = idea.id === selectedIdea.id;

          return (
            <button
              className={`min-w-0 rounded-lg border p-4 text-left transition ${
                selected
                  ? "border-emerald-300/45 bg-emerald-300/10"
                  : "border-white/8 bg-black/20 hover:border-white/20"
              }`}
              key={idea.id}
              onClick={() => setSelectedIdeaId(idea.id)}
              type="button"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">
                    {idea.symbol} {idea.side.toUpperCase()} - {idea.product}
                  </h3>
                  <p className="mt-1 break-words text-sm leading-6 text-zinc-400">
                    {idea.thesis}
                  </p>
                </div>
                <StatusChip
                  label={decision.approved ? "Risk approved" : "Risk veto"}
                  tone={decision.approved ? "green" : "red"}
                />
              </div>
              <div className="mt-4 grid gap-2 text-xs text-zinc-400 sm:grid-cols-5">
                <span>Entry {formatUsd(idea.entryPrice, 2)}</span>
                <span>Stop {formatUsd(idea.stopLoss, 2)}</span>
                <span>Target {formatUsd(idea.takeProfit ?? 0, 2)}</span>
                <span>Lev {idea.leverage}x</span>
                <span>Conf {(idea.confidence * 100).toFixed(0)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  function renderLaunchReadinessPanel() {
    const tone =
      launchReadiness.status === "live-ready"
        ? "green"
        : launchReadiness.status === "paper-ready"
          ? "amber"
          : "red";
    const visibleBlockers = launchReadiness.blockers.slice(0, 5);
    const visibleWarnings = launchReadiness.warnings.slice(0, 5);

    return (
      <Panel
        action={
          <div className="flex flex-wrap gap-2">
            <StatusChip label={launchReadiness.status} tone={tone} />
            <Button onClick={recordLaunchReadinessSnapshot} variant="secondary">
              Record snapshot
            </Button>
          </div>
        }
        description="A plain-English launch snapshot combines risk, account diagnostics, reconciliation, session role, and the live execution guards. It is advisory only; the server-side live API still enforces every guard."
        title="Launch readiness snapshot"
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Score", `${launchReadiness.score}/100`, tone],
            [
              "Paper mode",
              launchReadiness.paperTradingEnabled ? "ON" : "OFF",
              launchReadiness.paperTradingEnabled ? "green" : "red",
            ],
            [
              "Live mode",
              launchReadiness.liveTradingEnabled ? "ON" : "OFF",
              launchReadiness.liveTradingEnabled ? "red" : "green",
            ],
            [
              "Live allowed",
              launchReadiness.liveExecutionAllowed ? "yes" : "no",
              launchReadiness.liveExecutionAllowed ? "green" : "amber",
            ],
          ].map(([label, value, itemTone]) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
              <div className="mt-3">
                <StatusChip
                  label={value}
                  tone={itemTone as "green" | "amber" | "red" | "neutral"}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
          {launchReadiness.beginnerExplanation}
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-red-300/15 bg-red-400/5 p-4">
            <h3 className="text-sm font-semibold text-white">Current blockers</h3>
            {visibleBlockers.length ? (
              <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-red-100">
                {visibleBlockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                No hard blockers in the current snapshot.
              </p>
            )}
          </div>

          <div className="rounded-md border border-amber-300/15 bg-amber-300/5 p-4">
            <h3 className="text-sm font-semibold text-white">Warnings to review</h3>
            {visibleWarnings.length ? (
              <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-6 text-amber-100">
                {visibleWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                No warnings in the current snapshot.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {launchReadiness.checks.map((check) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={check.name}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">{check.name}</h3>
                <StatusChip
                  label={check.status}
                  tone={
                    check.status === "pass"
                      ? "green"
                      : check.status === "fail"
                        ? "red"
                        : "amber"
                  }
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{check.detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    );
  }

  function renderRiskConsole() {
    const guardItems = [
      {
        label: "LIVE_TRADING_ENABLED=true",
        pass: config.liveTradingEnabled,
      },
      { label: "Signed session role is admin", pass: sessionRole === "admin" },
      { label: "Emergency stop is false", pass: !config.emergencyStop },
      { label: "No-trade mode is false", pass: !config.noTradeMode },
      { label: "MEXC credentials exist server-side", pass: exchangeStatus.credentialsReady },
      {
        label: "MEXC test-order mode or explicit mainnet override",
        pass: exchangeStatus.orderTestMode || config.allowMainnetLiveTrading,
      },
      {
        label: `${selectedIdea.product} product live flag enabled`,
        pass:
          selectedIdea.product === "spot"
            ? config.products.spotLiveTrading
            : config.products.derivativesLiveTrading,
      },
      { label: "Risk Manager approved exact trade", pass: riskDecision.approved },
      {
        label: `Manual phrase: ${MANUAL_CONFIRMATION_PHRASE}`,
        pass: manualConfirmation === MANUAL_CONFIRMATION_PHRASE,
      },
    ];
    const liveExecutionAllowed = guardItems.every((item) => item.pass);
    const liveButtonLabel = liveExecutionAllowed
      ? exchangeStatus.orderTestMode
        ? "Validate MEXC test order"
        : "Submit MEXC live order"
      : "Submit live request";

    return (
      <Panel
        action={
          <StatusChip
            label={riskDecision.approved ? "Exact idea approved" : "Veto active"}
            tone={riskDecision.approved ? "green" : "red"}
          />
        }
        description="This is the hard execution console. Approval is exact to the selected idea shape."
        title="Risk Manager and live execution gate"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <div className="min-w-0 rounded-md border border-white/8 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">{selectedIdea.symbol}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {riskDecision.explanation}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(riskDecision.vetoReasons.length
                ? riskDecision.vetoReasons
                : ["No vetoes for paper execution.", ...riskDecision.warnings]
              ).map((item) => (
                <div
                  className="rounded-md border border-white/8 bg-[#111511] p-3 text-sm text-zinc-300"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-md border border-white/8 bg-black/20 p-4 xl:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Operator execution choice</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Choose Paper Trade or Live Trade for this selected idea. Paper is selected
                  by default; Live only submits when the full guard chain passes.
                </p>
              </div>
              <StatusChip
                label={executionMode === "paper" ? "Paper selected" : "Live selected"}
                tone={executionMode === "paper" ? "green" : "amber"}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div
                className={`rounded-md border p-4 ${
                  executionMode === "paper"
                    ? "border-emerald-300/30 bg-emerald-300/10"
                    : "border-white/8 bg-black/20"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-white">Paper Trade</h4>
                  <StatusChip label="default ON" tone="green" />
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Opens a simulated position, updates local P&L, and writes an audit journal
                  entry. It never calls MEXC.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={executeSelectedIdeaAsPaperTrade}>
                    Execute selected idea as Paper Trade
                  </Button>
                  <Button onClick={syncPaperTicketFromSelectedIdea} variant="secondary">
                    Edit paper ticket
                  </Button>
                </div>
                <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
                  {paperTicketStatus}
                </p>
              </div>

              <div
                className={`rounded-md border p-4 ${
                  executionMode === "live"
                    ? "border-red-300/30 bg-red-400/10"
                    : "border-white/8 bg-black/20"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-white">Live Trade</h4>
                  <StatusChip
                    label={config.liveTradingEnabled ? "global ON" : "default OFF"}
                    tone={config.liveTradingEnabled ? "red" : "green"}
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Sends the exact selected idea to the server-only MEXC adapter after admin,
                  test-order/mainnet, product, risk, and manual-confirmation checks.
                </p>
                <div className="mt-4 space-y-3">
                  <TextInput
                    label="Manual confirmation"
                    onChange={setManualConfirmation}
                    value={manualConfirmation}
                  />
                  <Button onClick={probeLiveExecution} variant="danger">
                    {liveButtonLabel}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-md border border-red-300/20 bg-red-400/5 p-4">
            <h3 className="text-sm font-semibold text-white">Live guard checklist</h3>
            <div className="mt-4 space-y-2">
              {guardItems.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2 text-sm"
                  key={item.label}
                >
                  <span className="text-zinc-300">{item.label}</span>
                  <StatusChip label={item.pass ? "pass" : "block"} tone={item.pass ? "green" : "red"} />
                </div>
              ))}
            </div>
            {liveProbe ? (
              <div className="mt-4 rounded-md border border-white/10 bg-black/25 p-3 text-sm text-zinc-300">
                <p className="font-semibold text-white">
                  Submitted: {liveProbe.submitted ? "yes" : "no"}
                </p>
                {liveProbe.order?.orderLinkId || liveProbe.order?.orderId ? (
                  <p className="mt-2 text-zinc-400">
                    MEXC evidence: {liveProbe.order.orderLinkId ?? liveProbe.order.orderId}
                  </p>
                ) : null}
                <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-400">
                  {liveProbe.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {liveProbe.diagnostic ? (
                  <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
                    <p className="font-semibold text-amber-100">
                      {liveProbe.diagnostic.label}
                    </p>
                    <p className="mt-1 text-zinc-300">
                      {liveProbe.diagnostic.operatorAction}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Panel>
    );
  }

  function renderPaperPortfolio() {
    return (
      <Panel
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={syncPaperTicketFromSelectedIdea} variant="secondary">
              Sync selected idea
            </Button>
            <Button disabled={!paperTicketPreview.valid} onClick={submitPaperTicket}>
              Submit paper ticket
            </Button>
            <Button
              disabled={openPositions.length === 0}
              onClick={closeFirstOpenPosition}
              variant="secondary"
            >
              Close first open
            </Button>
          </div>
        }
        description="This is a local simulation layer. It does not call MEXC and remains safe for beginner practice."
        title="Paper trading engine"
      >
        <div className="rounded-md border border-emerald-300/15 bg-emerald-300/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Paper order ticket</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Validate a simulated order before it enters the local paper book.
              </p>
            </div>
            <StatusChip
              label={paperTicketPreview.valid ? "ticket valid" : "needs fixes"}
              tone={paperTicketPreview.valid ? "green" : "red"}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <TextInput
              label="Symbol"
              onChange={(value) => setPaperTicket((current) => ({ ...current, symbol: value }))}
              value={paperTicket.symbol}
            />
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Side
              </span>
              <select
                className="mt-2 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none"
                onChange={(event) =>
                  setPaperTicket((current) => ({
                    ...current,
                    side: event.target.value as TradeSide,
                  }))
                }
                value={paperTicket.side}
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Product
              </span>
              <select
                className="mt-2 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none"
                onChange={(event) =>
                  setPaperTicket((current) => ({
                    ...current,
                    product: event.target.value as TradeProduct,
                  }))
                }
                value={paperTicket.product}
              >
                <option value="spot">Spot</option>
                <option value="derivatives">Derivatives</option>
              </select>
            </label>
            <TextInput
              label="Quantity"
              onChange={(value) => setPaperTicket((current) => ({ ...current, quantity: value }))}
              value={paperTicket.quantity}
            />
            <TextInput
              label="Entry"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, entryPrice: value }))
              }
              value={paperTicket.entryPrice}
            />
            <TextInput
              label="Stop loss"
              onChange={(value) => setPaperTicket((current) => ({ ...current, stopLoss: value }))}
              value={paperTicket.stopLoss}
            />
            <TextInput
              label="Take profit"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, takeProfit: value }))
              }
              value={paperTicket.takeProfit}
            />
            <TextInput
              label="Leverage"
              onChange={(value) => setPaperTicket((current) => ({ ...current, leverage: value }))}
              value={paperTicket.leverage}
            />
            <TextInput
              label="Confidence %"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, confidence: value }))
              }
              value={paperTicket.confidence}
            />
          </div>

          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Ticket thesis
            </span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm leading-6 text-white outline-none transition focus:border-emerald-300/50"
              onChange={(event) =>
                setPaperTicket((current) => ({ ...current, thesis: event.target.value }))
              }
              value={paperTicket.thesis}
            />
          </label>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {[
              ["Notional", formatUsd(paperTicketPreview.notionalUsd, 2)],
              ["Risk at stop", formatUsd(paperTicketPreview.riskUsd, 2)],
              [
                "Reward",
                paperTicketPreview.rewardUsd === undefined
                  ? "not set"
                  : formatUsd(paperTicketPreview.rewardUsd, 2),
              ],
              [
                "R/R",
                paperTicketPreview.riskRewardRatio === undefined
                  ? "n/a"
                  : `${paperTicketPreview.riskRewardRatio}x`,
              ],
            ].map(([label, value]) => (
              <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
                <p className="mt-2 text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
            {paperTicketStatus} {paperTicketPreview.beginnerExplanation}
          </p>

          {[...paperTicketPreview.errors, ...paperTicketPreview.warnings].length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {paperTicketPreview.errors.map((error) => (
                <div
                  className="rounded-md border border-red-300/20 bg-red-400/10 p-3 text-sm text-red-100"
                  key={error}
                >
                  {error}
                </div>
              ))}
              {paperTicketPreview.warnings.map((warning) => (
                <div
                  className="rounded-md border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100"
                  key={warning}
                >
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Open P&L</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-200">
              {formatUsd(unrealizedPnl, 2)}
            </p>
          </div>
          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Realized P&L</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-100">
              {formatUsd(realizedPnl, 2)}
            </p>
          </div>
          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Open positions</p>
            <p className="mt-2 text-2xl font-semibold text-white">{openPositions.length}</p>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr className="border-b border-white/10">
                <th className="px-3 py-3">Symbol</th>
                <th className="px-3 py-3">Side</th>
                <th className="px-3 py-3">Qty</th>
                <th className="px-3 py-3">Entry</th>
                <th className="px-3 py-3">Mark</th>
                <th className="px-3 py-3">Unrealized</th>
                <th className="px-3 py-3">Realized</th>
              </tr>
            </thead>
            <tbody>
              {markedPositions.map((position) => (
                <tr className="border-b border-white/[0.06]" key={position.id}>
                  <td className="px-3 py-3 font-semibold text-white">{position.symbol}</td>
                  <td className="px-3 py-3 capitalize text-zinc-300">{position.side}</td>
                  <td className="px-3 py-3 font-mono text-zinc-300">{position.quantity}</td>
                  <td className="px-3 py-3 font-mono text-zinc-300">
                    {formatUsd(position.entryPrice, 2)}
                  </td>
                  <td className="px-3 py-3 font-mono text-zinc-300">
                    {formatUsd(position.markPrice, 2)}
                  </td>
                  <td className="px-3 py-3 font-mono text-emerald-200">
                    {formatUsd(position.unrealizedPnlUsd, 2)}
                  </td>
                  <td className="px-3 py-3 font-mono text-zinc-300">
                    {position.realizedPnlUsd === undefined
                      ? "-"
                      : formatUsd(position.realizedPnlUsd, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  }

  function renderIdeaBuilder() {
    return (
      <Panel
        action={<Button onClick={submitDraftIdea}>Create and review</Button>}
        description="Create a manual hypothesis, then send it directly into Risk Manager review."
        title="Trade idea builder"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <TextInput
            label="Symbol"
            onChange={(value) => setDraft((current) => ({ ...current, symbol: value }))}
            value={draft.symbol}
          />
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Side
            </span>
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  side: event.target.value as TradeSide,
                }))
              }
              value={draft.side}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Product
            </span>
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  product: event.target.value as TradeProduct,
                }))
              }
              value={draft.product}
            >
              <option value="spot">Spot</option>
              <option value="derivatives">Derivatives</option>
            </select>
          </label>
          <TextInput
            label="Quantity"
            onChange={(value) => setDraft((current) => ({ ...current, quantity: value }))}
            value={draft.quantity}
          />
          <TextInput
            label="Entry"
            onChange={(value) => setDraft((current) => ({ ...current, entryPrice: value }))}
            value={draft.entryPrice}
          />
          <TextInput
            label="Stop loss"
            onChange={(value) => setDraft((current) => ({ ...current, stopLoss: value }))}
            value={draft.stopLoss}
          />
          <TextInput
            label="Take profit"
            onChange={(value) => setDraft((current) => ({ ...current, takeProfit: value }))}
            value={draft.takeProfit}
          />
          <TextInput
            label="Leverage"
            onChange={(value) => setDraft((current) => ({ ...current, leverage: value }))}
            value={draft.leverage}
          />
          <TextInput
            label="Confidence %"
            onChange={(value) => setDraft((current) => ({ ...current, confidence: value }))}
            value={draft.confidence}
          />
        </div>
        <label className="mt-4 block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Thesis
          </span>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/50"
            onChange={(event) =>
              setDraft((current) => ({ ...current, thesis: event.target.value }))
            }
            value={draft.thesis}
          />
        </label>
      </Panel>
    );
  }

  function renderJournal() {
    return (
      <Panel
        action={<Button onClick={addManualNote}>Add note</Button>}
        description="The journal is the audit backbone: user notes, agent output, risk checks, and paper-trade events."
        title="Journal and audit trail"
      >
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Manual desk note
          </span>
          <textarea
            className="mt-2 min-h-20 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-300/50"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record why you took, skipped, or vetoed a setup."
            value={note}
          />
        </label>

        <div className="mt-5 space-y-3">
          {journal.map((entry) => (
            <article className="rounded-md border border-white/8 bg-black/20 p-4" key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip label={entry.actor} tone="neutral" />
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {entry.event}
                  </span>
                </div>
                <span className="text-xs text-zinc-600">
                  {formatUtcDateTime(entry.timestamp)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{entry.summary}</p>
            </article>
          ))}
        </div>
      </Panel>
    );
  }

  function renderAgentConsole() {
    const roleTone = (role: string): "green" | "amber" | "red" | "neutral" => {
      if (role === "risk-manager") {
        return riskDecision.approved ? "green" : "red";
      }
      if (role === "execution-coach") {
        return config.liveTradingEnabled ? "amber" : "neutral";
      }
      return "amber";
    };

    return (
      <Panel
        action={
          <Button disabled={agentLoading || !costUsage.allowed} onClick={runAgent}>
            {agentLoading ? "Running..." : "Run agent reasoning"}
          </Button>
        }
        description="Agents can reason and explain, but they cannot execute. Every run is cost checked and journaled."
        title="AI agent console"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                label={agent?.mode ?? "not run this session"}
                tone={agent?.mode === "openai" ? "green" : "amber"}
              />
              <StatusChip label={config.openAiModel} tone="neutral" />
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-300">
              {agent?.summary ??
                "Run the agent to produce current reasoning from market data, trade ideas, and the active Risk Manager decision."}
            </p>
            {agent ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {agent.bullets.map((bullet) => (
                  <div className="rounded-md border border-white/8 bg-[#111511] p-3 text-sm text-zinc-300" key={bullet}>
                    {bullet}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Cost preflight</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Estimated call</dt>
                <dd className="font-mono text-zinc-200">
                  {formatUsd(costUsage.estimatedCostUsd, 4)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Daily budget</dt>
                <dd className="font-mono text-zinc-200">
                  {formatUsd(costUsage.dailyBudgetUsd, 2)}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-6 text-zinc-400">{costUsage.message}</p>
          </div>
        </div>
        <div className="mt-4 rounded-md border border-white/8 bg-[#0b0f0c] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Specialist workbench</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {agentWorkbench?.beginnerExplanation ??
                  "Run the agent console to split the review into market, risk, execution, and journal specialists."}
              </p>
            </div>
            <StatusChip
              label={`${agentWorkbench?.runs.length ?? 0} agents`}
              tone={agentWorkbench ? "green" : "neutral"}
            />
          </div>
          {agentWorkbench ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-4 md:grid-cols-2">
              {agentWorkbench.runs.map((run) => (
                <article className="rounded-md border border-white/8 bg-black/25 p-4" key={run.role}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip label={run.title} tone={roleTone(run.role)} />
                    <StatusChip label={`${Math.round(run.confidence * 100)}%`} tone="neutral" />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">{run.summary}</p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-400">
                    {run.bullets.slice(0, 3).map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                  <div className="mt-4 rounded-md border border-white/8 bg-[#111511] p-3 text-xs leading-5 text-zinc-300">
                    <strong className="text-zinc-100">Next action:</strong> {run.action}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-amber-200">{run.safetyNote}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </Panel>
    );
  }

  function renderReports() {
    const winCount = closedPositions.filter((position) => (position.realizedPnlUsd ?? 0) > 0).length;
    const lossCount = closedPositions.filter((position) => (position.realizedPnlUsd ?? 0) < 0).length;

    return (
      <div className="space-y-5">
        <Panel
          description="Reports are generated from the current local desk state, not from static copy."
          title="Reports and calibration"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Open paper P&L</p>
              <p className="mt-2 text-xl font-semibold text-emerald-200">
                {formatUsd(unrealizedPnl, 2)}
              </p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Realized</p>
              <p className="mt-2 text-xl font-semibold text-white">{formatUsd(realizedPnl, 2)}</p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Closed W/L</p>
              <p className="mt-2 text-xl font-semibold text-white">
                {winCount}/{lossCount}
              </p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Audit rows</p>
              <p className="mt-2 text-xl font-semibold text-white">{journal.length}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {forecastCalibration.map((item) => (
              <div className="rounded-md border border-white/8 bg-black/20 p-4" key={item.label}>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-sm font-semibold text-white">{item.label}</h3>
                  <span className="font-mono text-emerald-200">{item.accuracyPct}%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusChip label={`${item.sampleSize} samples`} tone="neutral" />
                  <StatusChip label={`Brier ${item.brierScore.toFixed(2)}`} tone="neutral" />
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {item.beginnerExplanation}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        {renderHistoryPanel()}
        {renderReconciliationPanel()}
      </div>
    );
  }

  function renderHistoryPanel() {
    return (
      <Panel
        description="Structured history is saved with the private desk state and included in encrypted vault export/import. It is separate from the free-form journal so audits can compare readiness and diagnostics over time."
        title="Diagnostics and readiness history"
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Readiness snapshots", String(readinessHistory.length)],
            ["Diagnostics snapshots", String(diagnosticsHistory.length)],
            ["Latest readiness", readinessHistory[0]?.status ?? "none"],
            ["Latest diagnostics", diagnosticsHistory[0]?.status ?? "none"],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Readiness timeline</h3>
            <div className="mt-3 space-y-3">
              {readinessHistory.slice(0, 5).map((entry) => (
                <div className="rounded-md border border-white/8 bg-[#111511] p-3" key={entry.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusChip
                      label={entry.status}
                      tone={
                        entry.status === "live-ready"
                          ? "green"
                          : entry.status === "blocked"
                            ? "red"
                            : "amber"
                      }
                    />
                    <span className="text-xs text-zinc-500">{entry.timestamp}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Score {entry.score}/100, blockers {entry.blockerCount}, warnings{" "}
                    {entry.warningCount}. {entry.summary}
                  </p>
                </div>
              ))}
              {!readinessHistory.length ? (
                <p className="text-sm leading-6 text-zinc-400">
                  No readiness snapshots recorded yet.
                </p>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <h3 className="text-sm font-semibold text-white">Diagnostics timeline</h3>
            <div className="mt-3 space-y-3">
              {diagnosticsHistory.slice(0, 5).map((entry) => (
                <div className="rounded-md border border-white/8 bg-[#111511] p-3" key={entry.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StatusChip
                      label={entry.status}
                      tone={
                        entry.status === "pass"
                          ? "green"
                          : entry.status === "fail"
                            ? "red"
                            : "amber"
                      }
                    />
                    <span className="text-xs text-zinc-500">{entry.timestamp}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Source {entry.source}, checks {entry.checkCount}, warnings{" "}
                    {entry.warningCount}, failures {entry.failCount}. {entry.summary}
                  </p>
                </div>
              ))}
              {!diagnosticsHistory.length ? (
                <p className="text-sm leading-6 text-zinc-400">
                  No diagnostics snapshots recorded yet.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  function renderReconciliationPanel() {
    const rowPreview = reconciliation?.rows.slice(0, 6) ?? [];
    const positionRowPreview = positionReconciliation?.rows.slice(0, 6) ?? [];
    const walletRowPreview = walletReconciliation?.rows.slice(0, 6) ?? [];

    return (
      <Panel
        action={
          <Button disabled={reconciliationLoading} onClick={runExchangeReconciliation}>
            {reconciliationLoading ? "Reconciling..." : "Run reconciliation"}
          </Button>
        }
        description="Compare local AlphaDesk order and position expectations against MEXC read-only snapshots when credentials exist, or simulated exchange snapshots when they do not."
        title="Exchange reconciliation"
      >
        <div className="grid gap-4 md:grid-cols-5">
          {[
            ["Order mode", reconciliation?.mode ?? "not run"],
            ["Order status", reconciliation?.status ?? "pending"],
            ["Orders matched", String(reconciliation?.matched ?? 0)],
            ["Order mismatches", String(reconciliation?.mismatched ?? 0)],
            ["Orders missing", String(reconciliation?.missingOnExchange ?? 0)],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-400">
          {reconciliationMessage}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-5">
          {[
            ["Position mode", positionReconciliation?.mode ?? "not run"],
            ["Position status", positionReconciliation?.status ?? "pending"],
            ["Exposure matched", String(positionReconciliation?.matched ?? 0)],
            ["Exposure drift", String(positionReconciliation?.mismatched ?? 0)],
            ["Exposure missing", String(positionReconciliation?.missingOnExchange ?? 0)],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-5">
          {[
            ["Wallet mode", walletReconciliation?.mode ?? "not run"],
            ["Wallet status", walletReconciliation?.status ?? "pending"],
            ["Coins matched", String(walletReconciliation?.matched ?? 0)],
            ["Wallet drift", String(walletReconciliation?.mismatched ?? 0)],
            ["Coins missing", String(walletReconciliation?.missingWalletBalance ?? 0)],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        {rowPreview.length ? (
          <div className="mt-5 grid gap-3">
            <h3 className="text-sm font-semibold text-white">Order rows</h3>
            {rowPreview.map((row) => (
              <article className="rounded-md border border-white/8 bg-black/20 p-4" key={row.key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      label={row.status}
                      tone={
                        row.severity === "pass"
                          ? "green"
                          : row.severity === "fail"
                            ? "red"
                            : "amber"
                      }
                    />
                    <span className="font-mono text-xs text-zinc-500">{row.key}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {row.localOrder?.symbol ?? row.exchangeOrder?.symbol}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {row.beginnerExplanation}
                </p>
                {row.issues.length ? (
                  <p className="mt-2 text-xs leading-5 text-amber-100">
                    {row.issues.join(" ")}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {positionRowPreview.length ? (
          <div className="mt-5 grid gap-3">
            <h3 className="text-sm font-semibold text-white">Position rows</h3>
            {positionRowPreview.map((row) => (
              <article className="rounded-md border border-white/8 bg-black/20 p-4" key={row.key}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      label={row.status}
                      tone={
                        row.severity === "pass"
                          ? "green"
                          : row.severity === "fail"
                            ? "red"
                            : "amber"
                      }
                    />
                    <span className="font-mono text-xs text-zinc-500">{row.key}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    {row.localExposure?.symbol ?? row.exchangePosition?.symbol}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {row.beginnerExplanation}
                </p>
                {row.issues.length ? (
                  <p className="mt-2 text-xs leading-5 text-amber-100">
                    {row.issues.join(" ")}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {walletRowPreview.length ? (
          <div className="mt-5 grid gap-3">
            <h3 className="text-sm font-semibold text-white">Spot wallet rows</h3>
            {walletRowPreview.map((row) => (
              <article className="rounded-md border border-white/8 bg-black/20 p-4" key={row.coin}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip
                      label={row.status}
                      tone={
                        row.severity === "pass"
                          ? "green"
                          : row.severity === "fail"
                            ? "red"
                            : "amber"
                      }
                    />
                    <span className="font-mono text-xs text-zinc-500">{row.coin}</span>
                  </div>
                  <span className="text-xs text-zinc-500">
                    Local {row.localInventory?.quantity ?? 0} / Wallet{" "}
                    {row.walletBalance?.walletBalance ?? 0}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {row.beginnerExplanation}
                </p>
                {row.issues.length ? (
                  <p className="mt-2 text-xs leading-5 text-amber-100">
                    {row.issues.join(" ")}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </Panel>
    );
  }

  function renderSettings() {
    return (
      <div className="space-y-5">
        <Panel
          description="This screen shows server-authoritative safety state. Client toggles are not allowed to enable live trading."
          title="Runtime settings and secret posture"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Paper trading", config.paperTradingEnabled ? "ON" : "OFF", "green"],
              ["Live trading", config.liveTradingEnabled ? "ON" : "OFF", config.liveTradingEnabled ? "red" : "green"],
              ["MEXC mode", exchangeStatus.orderTestMode ? "test order" : "mainnet", exchangeStatus.orderTestMode ? "green" : "red"],
            ["MEXC API key", exchangeStatus.hasApiKey ? "present" : "missing", exchangeStatus.hasApiKey ? "green" : "amber"],
            ["MEXC secret", exchangeStatus.hasApiSecret ? "present" : "missing", exchangeStatus.hasApiSecret ? "green" : "amber"],
            ["OpenAI model", config.openAiModel, "neutral"],
            ["Session role", sessionRole ?? "none", sessionRole === "admin" ? "green" : "amber"],
          ].map(([label, value, tone]) => (
              <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
                <div className="mt-3">
                  <StatusChip
                    label={value}
                    tone={tone as "green" | "amber" | "red" | "neutral"}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
            Secret values are never printed. This screen only exposes readiness booleans and safe mode labels.
          </p>
        </Panel>

        {renderAccountDiagnosticsPanel()}

        <Panel
          action={<Button onClick={resetLocalDesk} variant="secondary">Reset local desk</Button>}
          description="Ideas, paper positions, journal rows, and the selected setup are stored only in this browser. Encrypted autosave removes the plaintext local copy."
          title="Private browser persistence"
        >
          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Ideas</p>
              <p className="mt-2 text-2xl font-semibold text-white">{ideas.length}</p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Positions</p>
              <p className="mt-2 text-2xl font-semibold text-white">{positions.length}</p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Journal</p>
              <p className="mt-2 text-2xl font-semibold text-white">{journal.length}</p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Storage</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {storageHydrated ? "Active" : "Hydrating"}
              </p>
            </div>
            <div className="rounded-md border border-white/8 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Mode</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {persistenceMode.replace("-", " ")}
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-400">
            {storageStatus}
          </p>
        </Panel>

        <Panel
          action={
            <div className="flex flex-wrap gap-2">
              {persistenceMode === "encrypted-locked" ? (
                <Button onClick={unlockEncryptedAutosave}>Unlock autosave</Button>
              ) : (
                <Button onClick={enableEncryptedAutosave}>Enable autosave</Button>
              )}
              <Button
                disabled={persistenceMode !== "encrypted-unlocked"}
                onClick={lockEncryptedAutosave}
                variant="secondary"
              >
                Lock autosave
              </Button>
              <Button onClick={createEncryptedVault}>Create vault</Button>
              <Button onClick={downloadEncryptedVault} variant="secondary">
                Download vault
              </Button>
              <Button onClick={importEncryptedVault} variant="secondary">
                Import vault
              </Button>
              <Button
                disabled={persistenceMode === "plaintext"}
                onClick={disableEncryptedAutosave}
                variant="danger"
              >
                Use plaintext save
              </Button>
            </div>
          }
          description="Export, restore, or turn on encrypted autosave for the private desk state. The passphrase is never saved by AlphaDesk."
          title="Encrypted desk vault"
        >
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <TextInput
                label="Vault passphrase"
                onChange={setVaultPassphrase}
                type="password"
                value={vaultPassphrase}
              />
              <div className="rounded-md border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
                Use at least 12 characters. Losing this passphrase means the vault cannot be restored.
              </div>
            </div>

            <label className="block min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Encrypted vault JSON
              </span>
              <textarea
                className="mt-2 min-h-56 w-full rounded-md border border-white/10 bg-black/25 px-3 py-2 font-mono text-xs leading-5 text-white outline-none transition focus:border-emerald-300/50"
                onChange={(event) => setVaultPayload(event.target.value)}
                placeholder="Create a vault here, or paste an encrypted AlphaDesk vault to import."
                spellCheck={false}
                value={vaultPayload}
              />
            </label>
          </div>
          <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-400">
            {vaultStatus}
          </p>
        </Panel>
      </div>
    );
  }

  function renderAccountDiagnosticsPanel() {
    const info = accountDiagnostics.accountInfo;

    return (
      <Panel
        action={
          <Button onClick={recordAccountDiagnosticsSnapshot} variant="secondary">
            Record diagnostics
          </Button>
        }
        description="Read-only account diagnostics explain whether exchange account mode and safety posture match AlphaDesk's private paper-first operating model."
        title="Account mode diagnostics"
      >
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Source", accountDiagnostics.source],
            ["Status", accountDiagnostics.status],
            ["MEXC mode", accountDiagnostics.exchange.testnet ? "test order" : "mainnet"],
            ["Account mode", info?.accountModeLabel ?? "not checked"],
          ].map(([label, value]) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={label}>
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {accountDiagnostics.checks.map((check) => (
            <div className="rounded-md border border-white/8 bg-black/20 p-4" key={check.name}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">{check.name}</h3>
                <StatusChip
                  label={check.status}
                  tone={
                    check.status === "pass"
                      ? "green"
                      : check.status === "fail"
                        ? "red"
                        : "amber"
                  }
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{check.detail}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-md border border-white/8 bg-black/20 p-3 text-sm leading-6 text-zinc-400">
          {accountDiagnostics.beginnerExplanation}
        </p>
      </Panel>
    );
  }

  function renderHealth() {
    return (
      <div className="space-y-5">
        <Panel
          description="Health is operational evidence: market data freshness, keys, AI readiness, and safety defaults."
          title="System health"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {healthChecks.map((check) => (
              <div className="rounded-md border border-white/8 bg-black/20 p-4" key={check.name}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">{check.name}</h3>
                  <StatusChip
                    label={check.status}
                    tone={
                      check.status === "pass"
                        ? "green"
                        : check.status === "fail"
                          ? "red"
                          : "amber"
                    }
                  />
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{check.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        {renderLaunchReadinessPanel()}
        {renderReconciliationPanel()}
        {renderAccountDiagnosticsPanel()}
        {renderHistoryPanel()}
      </div>
    );
  }

  function renderCostControl() {
    return (
      <Panel
        action={<StatusChip label={projectedCost.allowed ? "within budget" : "blocked"} tone={projectedCost.allowed ? "green" : "red"} />}
        description="Estimate cost before agent calls and block projected overages."
        title="Cost control"
      >
        <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <TextInput
            label="Projected agent calls"
            onChange={setProjectedCalls}
            type="number"
            value={projectedCalls}
          />
          <div className="rounded-md border border-white/8 bg-black/20 p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Projected</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {formatUsd(projectedCost.estimatedCostUsd, 4)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Budget</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {formatUsd(projectedCost.dailyBudgetUsd, 2)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Hard stop</p>
                <p className="mt-2 text-xl font-semibold text-white">
                  {formatUsd(projectedCost.hardStopUsd, 2)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-400">{projectedCost.message}</p>
          </div>
        </div>
      </Panel>
    );
  }

  function renderWatchlist() {
    return (
      <div className="space-y-5">
        <MarketTable marketData={marketData} />
        <Panel
          description="The watchlist uses CoinGecko prices and labels exactly when data is fresh, stale, or fallback."
          title="Market context"
        >
          <div className="grid gap-3 md:grid-cols-4">
            {marketData.assets.map((asset) => (
              <div className="rounded-md border border-white/8 bg-black/20 p-4" key={asset.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-white">{asset.symbol}</h3>
                  <StatusChip label={asset.signal} tone={asset.signal === "accumulate" ? "green" : "neutral"} />
                </div>
                <p className="mt-3 font-mono text-lg text-white">
                  {formatUsd(asset.price, asset.price > 100 ? 0 : 2)}
                </p>
                <p className={asset.change24h >= 0 ? "text-emerald-200" : "text-red-200"}>
                  {formatPct(asset.change24h)} 24h
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Cap {formatCompactUsd(asset.marketCap)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  function renderDashboard() {
    return (
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-[#111511] p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Paper equity</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-200">
              {formatUsd(seedPortfolio.equityUsd + unrealizedPnl + realizedPnl, 2)}
            </p>
            <p className="mt-2 text-sm text-zinc-400">Paper trading is ON by default.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#111511] p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Live state</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-200">OFF</p>
            <p className="mt-2 text-sm text-zinc-400">Live execution remains guarded.</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#111511] p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Risk score</p>
            <p className="mt-2 text-2xl font-semibold text-white">{riskDecision.score}/100</p>
            <p className="mt-2 text-sm text-zinc-400">Selected idea: {selectedIdea.symbol}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#111511] p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Market data</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {marketData.status.freshness.toUpperCase()}
            </p>
            <p className="mt-2 text-sm text-zinc-400">{marketData.status.provider}</p>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
          <div className="space-y-5">
            {renderWatchlist()}
            <Panel title="Selected trade ideas" action={<Button onClick={() => setActiveView("trade-ideas")}>Build idea</Button>}>
              {renderTradeIdeaRows()}
            </Panel>
          </div>
          <div className="space-y-5">
            {renderLaunchReadinessPanel()}
            {renderAgentConsole()}
            {renderRiskConsole()}
            {renderJournal()}
          </div>
        </div>
      </div>
    );
  }

  const content = {
    dashboard: renderDashboard,
    watchlist: renderWatchlist,
    agents: renderAgentConsole,
    "trade-ideas": () => (
      <div className="space-y-5">
        {renderIdeaBuilder()}
        <Panel title="Idea queue">{renderTradeIdeaRows()}</Panel>
      </div>
    ),
    risk: () => (
      <div className="space-y-5">
        {renderLaunchReadinessPanel()}
        {renderRiskConsole()}
      </div>
    ),
    "paper-trading": () => (
      <div className="space-y-5">
        {renderRiskConsole()}
        {renderPaperPortfolio()}
      </div>
    ),
    journal: renderJournal,
    reports: renderReports,
    settings: renderSettings,
    "system-health": renderHealth,
    "cost-control": renderCostControl,
  } satisfies Record<CommandView, () => React.ReactNode>;

  return (
    <div className="min-w-0 space-y-5">
      <div className="rounded-lg border border-white/10 bg-[#111511] p-3">
        <div className="flex gap-2 overflow-x-auto">
          {viewOrder.map((view) => (
            <button
              className={`shrink-0 rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                activeView === view
                  ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-100"
                  : "border-white/10 bg-black/20 text-zinc-400 hover:text-zinc-100"
              }`}
              key={view}
              onClick={() => setActiveView(view)}
              type="button"
            >
              {viewLabels[view]}
            </button>
          ))}
        </div>
      </div>

      {renderOperatorBrief()}
      {content[activeView]()}
    </div>
  );
}
