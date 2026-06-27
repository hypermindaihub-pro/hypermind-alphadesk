"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  Gauge,
  ListChecks,
  LockKeyhole,
  Radar,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Zap,
  type LucideIcon,
} from "lucide-react";
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
import {
  EmptyState,
  MetricCell,
  ProgressMeter,
  StateBadge,
  TerminalPanel,
} from "./trading-ui";

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
    <section className="min-w-0 overflow-hidden rounded-md border border-white/[0.08] bg-[#0d1115]">
      <div className="flex min-w-0 flex-col gap-3 border-b border-white/[0.07] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-1 break-words text-xs leading-5 text-zinc-500">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
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
      "border-emerald-400/30 bg-emerald-400/[0.09] text-emerald-200 hover:bg-emerald-400/[0.15]",
    secondary: "border-white/[0.09] bg-white/[0.025] text-zinc-300 hover:bg-white/[0.06]",
    danger: "border-red-400/30 bg-red-400/[0.08] text-red-200 hover:bg-red-400/[0.14]",
  }[variant];

  return (
    <button
      className={`inline-flex min-h-8 items-center justify-center rounded border px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      <span className="text-[10px] font-semibold uppercase text-zinc-600">
        {label}
      </span>
      <input
        className="mt-1.5 h-9 w-full rounded border border-white/[0.09] bg-[#090c0f] px-3 text-xs text-white outline-none transition placeholder:text-zinc-700 focus:border-emerald-400/40"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function AgentStatusCard({
  title,
  icon: Icon,
  status,
  recommendation,
  confidence,
  lastRun,
  onRun,
  loading,
  tone = "positive",
  source,
}: {
  title: string;
  icon: LucideIcon;
  status: string;
  recommendation: string;
  confidence: number;
  lastRun: string;
  onRun: () => void;
  loading: boolean;
  tone?: "positive" | "warning" | "danger" | "neutral" | "info";
  source: string;
}) {
  return (
    <article className="min-w-0 rounded-md border border-white/[0.08] bg-[#090c0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded border border-white/[0.08] bg-white/[0.025]">
            <Icon aria-hidden className="size-4 text-zinc-400" strokeWidth={1.6} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-semibold text-zinc-100">{title}</h3>
            <p className="mt-1 truncate text-[10px] text-zinc-600">{source}</p>
          </div>
        </div>
        <StateBadge tone={tone}>{status}</StateBadge>
      </div>

      <p className="mt-4 min-h-10 text-xs leading-5 text-zinc-400">{recommendation}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[10px]">
          <span className="text-zinc-600">Confidence</span>
          <span className="font-mono text-zinc-300">{Math.round(confidence * 100)}%</span>
        </div>
        <ProgressMeter
          value={confidence * 100}
          tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "positive"}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <Clock3 aria-hidden className="size-3" />
          {lastRun}
        </span>
        <button
          className="rounded border border-white/[0.09] px-2.5 py-1 text-[10px] font-semibold text-zinc-400 transition hover:border-emerald-400/30 hover:text-emerald-300 disabled:opacity-50"
          disabled={loading}
          onClick={onRun}
          type="button"
        >
          {loading ? "Running" : "Run agent"}
        </button>
      </div>
    </article>
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
      <section className="flex min-w-0 flex-col gap-3 rounded-md border border-white/[0.07] bg-[#0b0e11] px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase text-emerald-400">
              {operatorBrief.title}
            </span>
            <span className="text-zinc-800">/</span>
            <span className="text-[10px] text-zinc-600">{operatorBrief.primaryAction}</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{operatorBrief.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {operatorBrief.evidence.slice(0, 4).map((item) => (
            <StatusChip
              key={`${item.label}-${item.value}`}
              label={`${item.label}: ${item.value}`}
              tone={item.tone}
            />
          ))}
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

  function renderRiskOverview() {
    const exposureUsd = openPositions.reduce(
      (sum, position) => sum + Math.abs(position.quantity * position.markPrice),
      0,
    );
    const openRiskUsd = Math.abs(selectedIdea.entryPrice - selectedIdea.stopLoss) * selectedIdea.quantity;
    const dailyLossUsedPct = Math.min(
      100,
      (seedPortfolio.dailyDrawdownPct / Math.max(config.risk.maxDailyDrawdownPct, 0.01)) * 100,
    );
    const positionLimitUsedPct = Math.min(
      100,
      ((selectedIdea.quantity * selectedIdea.entryPrice) /
        Math.max(config.risk.maxPositionUsd, 1)) *
        100,
    );

    return (
      <div className="space-y-3">
        <section className="grid overflow-hidden rounded-md border border-white/[0.08] sm:grid-cols-2 xl:grid-cols-5">
          <MetricCell
            detail={`${dailyLossUsedPct.toFixed(1)}% utilized`}
            icon={Gauge}
            label="Daily loss limit"
            tone={dailyLossUsedPct > 75 ? "danger" : dailyLossUsedPct > 50 ? "warning" : "positive"}
            value={`${config.risk.maxDailyDrawdownPct}%`}
          />
          <MetricCell
            detail={`${positionLimitUsedPct.toFixed(1)}% selected`}
            icon={CircleDollarSign}
            label="Max position size"
            value={formatUsd(config.risk.maxPositionUsd, 0)}
          />
          <MetricCell
            detail={`${openPositions.length} open paper positions`}
            icon={WalletCards}
            label="Exposure"
            value={formatUsd(exposureUsd, 0)}
          />
          <MetricCell
            detail={`Selected ${selectedIdea.symbol}`}
            icon={ShieldCheck}
            label="Open risk"
            tone={riskDecision.approved ? "positive" : "danger"}
            value={formatUsd(openRiskUsd, 2)}
          />
          <MetricCell
            detail="Server-side environment guard"
            icon={LockKeyhole}
            label="Live trading lock"
            tone={config.liveTradingEnabled ? "danger" : "positive"}
            value={config.liveTradingEnabled ? "REVIEW" : "LOCKED"}
          />
        </section>

        <TerminalPanel
          title="Risk controls"
          description="Limits are enforced by server configuration and exact-trade evaluation. The browser cannot override them."
        >
          <div className="grid gap-px bg-white/[0.07] lg:grid-cols-3">
            <div className="bg-[#0d1115] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-300">Daily drawdown</span>
                <span className="font-mono text-xs text-zinc-500">
                  {seedPortfolio.dailyDrawdownPct.toFixed(2)}% / {config.risk.maxDailyDrawdownPct}%
                </span>
              </div>
              <div className="mt-3">
                <ProgressMeter
                  value={dailyLossUsedPct}
                  tone={dailyLossUsedPct > 75 ? "danger" : dailyLossUsedPct > 50 ? "warning" : "positive"}
                />
              </div>
            </div>
            <div className="bg-[#0d1115] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-300">Selected position</span>
                <span className="font-mono text-xs text-zinc-500">
                  {formatUsd(selectedIdea.quantity * selectedIdea.entryPrice, 0)}
                </span>
              </div>
              <div className="mt-3">
                <ProgressMeter
                  value={positionLimitUsedPct}
                  tone={positionLimitUsedPct > 90 ? "danger" : positionLimitUsedPct > 65 ? "warning" : "positive"}
                />
              </div>
            </div>
            <div className="bg-[#0d1115] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-zinc-300">Kill switch</span>
                <StateBadge tone={config.emergencyStop ? "danger" : "positive"}>
                  {config.emergencyStop ? "Active" : "Ready"}
                </StateBadge>
              </div>
              <button
                className="mt-3 flex h-8 w-full cursor-not-allowed items-center justify-center gap-2 rounded border border-red-400/20 bg-red-400/[0.05] text-[10px] font-semibold text-red-300/70"
                disabled
                title="Emergency stop is controlled by server environment configuration."
                type="button"
              >
                <LockKeyhole aria-hidden className="size-3.5" />
                Server-controlled emergency stop
              </button>
            </div>
          </div>
        </TerminalPanel>
      </div>
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
    const tradeRows = markedPositions.slice(0, 12);

    return (
      <div className="space-y-3">
        <TerminalPanel
          title="Trade journal"
          description="Paper and live activity are explicitly labeled. Current positions remain local paper simulations."
          action={<StateBadge tone="positive">Paper ledger</StateBadge>}
        >
          {tradeRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-white/[0.07] bg-white/[0.015] text-[10px] uppercase text-zinc-600">
                  <tr>
                    {[
                      "Pair",
                      "Mode",
                      "Side",
                      "Entry reason",
                      "Exit reason",
                      "P&L",
                      "Opened",
                    ].map((heading) => (
                      <th className="px-4 py-2.5 font-semibold" key={heading}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tradeRows.map((position) => {
                    const idea = ideas.find((item) => item.symbol === position.symbol);
                    const pnl = position.closedAt
                      ? position.realizedPnlUsd ?? 0
                      : position.unrealizedPnlUsd;

                    return (
                      <tr className="border-b border-white/[0.055] last:border-0" key={position.id}>
                        <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{position.symbol}</td>
                        <td className="px-4 py-3"><StateBadge tone="positive">Paper</StateBadge></td>
                        <td className={`px-4 py-3 uppercase ${position.side === "long" ? "text-emerald-300" : "text-red-300"}`}>
                          {position.side}
                        </td>
                        <td className="max-w-xs px-4 py-3 text-zinc-500">
                          <span className="line-clamp-2">{idea?.thesis ?? "Manual paper ticket."}</span>
                        </td>
                        <td className="max-w-xs px-4 py-3 text-zinc-500">
                          {position.closedAt ? "Closed manually at the marked price." : "Open / stop or target pending."}
                        </td>
                        <td className={`px-4 py-3 font-mono ${pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                          {formatUsd(pnl, 2)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[10px] text-zinc-600">{formatUtcDateTime(position.openedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              description="Paper trades will appear here with rationale, state, and P&L."
              icon={ListChecks}
              title="No trade history"
            />
          )}
        </TerminalPanel>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <TerminalPanel
            title="Journal coach"
            description="Capture mistakes, lessons learned, skipped trades, or exit rationale."
            action={<Button onClick={addManualNote}>Add journal note</Button>}
          >
            <div className="p-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase text-zinc-600">
                  Mistakes and lessons learned
                </span>
                <textarea
                  className="mt-2 min-h-32 w-full rounded border border-white/[0.09] bg-[#090c0f] px-3 py-2 text-xs leading-5 text-white outline-none transition placeholder:text-zinc-700 focus:border-emerald-400/40"
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What did the setup teach you? What should change next time?"
                  value={note}
                />
              </label>
              <div className="mt-3 rounded border border-white/[0.07] bg-white/[0.018] p-3 text-[11px] leading-5 text-zinc-500">
                {agentWorkbench?.runs.find((run) => run.role === "journal-coach")?.summary ??
                  "Run the agents to generate a journal-coach review from the selected setup and risk decision."}
              </div>
            </div>
          </TerminalPanel>

          <TerminalPanel title="Audit timeline" description="Most recent system, agent, risk, and execution events.">
            <div className="divide-y divide-white/[0.06]">
              {journal.slice(0, 12).map((entry) => (
                <article className="grid gap-2 px-4 py-3 sm:grid-cols-[120px_110px_minmax(0,1fr)]" key={entry.id}>
                  <span className="font-mono text-[10px] text-zinc-700">{formatUtcDateTime(entry.timestamp)}</span>
                  <span className="text-[10px] uppercase text-zinc-600">{entry.event}</span>
                  <p className="text-xs leading-5 text-zinc-400">{entry.summary}</p>
                </article>
              ))}
            </div>
          </TerminalPanel>
        </div>
      </div>
    );
  }

  function renderAgentConsole() {
    const runByRole = new Map(agentWorkbench?.runs.map((run) => [run.role, run]));
    const marketRun = runByRole.get("market-analyst");
    const riskRun = runByRole.get("risk-manager");
    const executionRun = runByRole.get("execution-coach");
    const strongestMarket = marketData.assets
      .slice()
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))[0];
    const positiveMarkets = marketData.assets.filter((asset) => asset.change24h >= 0).length;
    const marketBreadth = marketData.assets.length
      ? positiveMarkets / marketData.assets.length
      : 0;
    const lastRun = agentWorkbench ? "This session" : "Not run";
    const source = agent?.mode === "openai" ? `${config.openAiModel} / OpenAI` : "Deterministic fallback";

    return (
      <TerminalPanel
        title="Agent command center"
        description="Five specialist lenses review live market context, exact trade risk, execution readiness, sentiment, and paper portfolio state. Agents remain advisory."
        action={
          <Button disabled={agentLoading || !costUsage.allowed} onClick={runAgent}>
            <RefreshCw aria-hidden className="mr-2 size-3.5" />
            {agentLoading ? "Running agents" : "Run all agents"}
          </Button>
        }
      >
        <div className="grid gap-3 p-3 md:grid-cols-2 2xl:grid-cols-5">
          <AgentStatusCard
            confidence={marketRun?.confidence ?? selectedIdea.confidence}
            icon={BrainCircuit}
            lastRun={lastRun}
            loading={agentLoading}
            onRun={runAgent}
            recommendation={
              marketRun?.summary ??
              `${strongestMarket?.symbol ?? selectedIdea.symbol} leads current monitored momentum. Refresh reasoning before promoting a setup.`
            }
            source={source}
            status={agentWorkbench ? "Ready" : "Idle"}
            title="Research Agent"
            tone={agentWorkbench ? "positive" : "neutral"}
          />
          <AgentStatusCard
            confidence={riskRun?.confidence ?? Math.max(0.5, riskDecision.score / 100)}
            icon={ShieldCheck}
            lastRun={lastRun}
            loading={agentLoading}
            onRun={runAgent}
            recommendation={
              riskRun?.summary ??
              `${selectedIdea.symbol} is ${riskDecision.approved ? "approved for paper review" : "vetoed"} at ${riskDecision.score}/100 risk score.`
            }
            source="Exact trade fingerprint"
            status={riskDecision.approved ? "Approved" : "Veto"}
            title="Risk Agent"
            tone={riskDecision.approved ? "positive" : "danger"}
          />
          <AgentStatusCard
            confidence={executionRun?.confidence ?? 0.74}
            icon={Zap}
            lastRun={lastRun}
            loading={agentLoading}
            onRun={runAgent}
            recommendation={
              executionRun?.summary ??
              `Paper execution is ready. Live remains ${config.liveTradingEnabled ? "guarded" : "locked"} by the server-side switch.`
            }
            source="Order and guard checks"
            status={config.liveTradingEnabled ? "Review" : "Paper ready"}
            title="Execution Agent"
            tone={config.liveTradingEnabled ? "warning" : "positive"}
          />
          <AgentStatusCard
            confidence={Math.max(0.52, Math.abs(marketBreadth - 0.5) + 0.5)}
            icon={Activity}
            lastRun={marketData.status.freshness === "fresh" ? "Live snapshot" : "Fallback snapshot"}
            loading={agentLoading}
            onRun={runAgent}
            recommendation={`${positiveMarkets}/${marketData.assets.length} monitored assets are positive over 24h. Breadth is ${
              marketBreadth >= 0.75 ? "bullish" : marketBreadth <= 0.25 ? "defensive" : "mixed"
            }.`}
            source="Local market breadth synthesis"
            status={marketData.status.freshness}
            title="Sentiment Agent"
            tone={marketData.status.freshness === "fresh" ? "info" : "warning"}
          />
          <AgentStatusCard
            confidence={openPositions.length ? 0.76 : 0.58}
            icon={WalletCards}
            lastRun="Live paper state"
            loading={agentLoading}
            onRun={runAgent}
            recommendation={`${openPositions.length} open paper position${
              openPositions.length === 1 ? "" : "s"
            } with ${formatUsd(unrealizedPnl, 2)} unrealized P&L. ${
              riskDecision.approved ? "Exposure is within the selected trade limits." : "Risk veto requires attention."
            }`}
            source="Local portfolio synthesis"
            status={riskDecision.approved ? "Balanced" : "Review"}
            title="Portfolio Agent"
            tone={riskDecision.approved ? "positive" : "warning"}
          />
        </div>

        <div className="grid border-t border-white/[0.07] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge tone={agent?.mode === "openai" ? "positive" : "warning"}>
                {agent?.mode ?? "not run"}
              </StateBadge>
              <StateBadge tone="neutral">{config.openAiModel}</StateBadge>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              {agent?.summary ??
                "Run the agents to generate current recommendations from market data, the selected trade, the Risk Manager decision, and paper portfolio state."}
            </p>
            {agent?.bullets.length ? (
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {agent.bullets.slice(0, 4).map((bullet) => (
                  <li className="rounded border border-white/[0.07] bg-white/[0.018] p-3 text-xs leading-5 text-zinc-500" key={bullet}>
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="border-t border-white/[0.07] p-4 lg:border-l lg:border-t-0">
            <h3 className="text-[11px] font-semibold text-zinc-300">Cost preflight</h3>
            <dl className="mt-3 space-y-2.5 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600">Estimated call</dt>
                <dd className="font-mono text-zinc-300">{formatUsd(costUsage.estimatedCostUsd, 4)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-600">Daily budget</dt>
                <dd className="font-mono text-zinc-300">{formatUsd(costUsage.dailyBudgetUsd, 2)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-5 text-zinc-600">{costUsage.message}</p>
          </div>
        </div>
      </TerminalPanel>
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
    const openAiConfigured =
      healthChecks.find((check) => check.name === "OpenAI reasoning")?.status === "pass";
    const safetyChecks = [
      {
        label: "Paper trading is the default",
        pass: config.paperTradingEnabled,
        detail: "Simulated orders remain available without exchange execution.",
      },
      {
        label: "Live trading is locked",
        pass: !config.liveTradingEnabled,
        detail: "Only a server-side environment change can unlock the live guard chain.",
      },
      {
        label: "MEXC test-order mode",
        pass: exchangeStatus.orderTestMode,
        detail: "Exchange submissions validate on MEXC without creating a real order.",
      },
      {
        label: "Emergency stop is clear",
        pass: !config.emergencyStop,
        detail: "An active emergency stop rejects every live execution attempt.",
      },
      {
        label: "No-trade mode is clear",
        pass: !config.noTradeMode,
        detail: "No-trade mode can freeze execution while analysis remains available.",
      },
      {
        label: "Admin operator session",
        pass: sessionRole === "admin",
        detail: "Only the admin role can pass the live execution authorization guard.",
      },
    ];

    return (
      <div className="space-y-3">
        <TerminalPanel
          title="Trading mode and safety"
          description="Runtime controls are server-authoritative. The browser can inspect them, but it cannot silently unlock live trading."
        >
          <div className="grid gap-px bg-white/[0.07] md:grid-cols-2 xl:grid-cols-4">
            <div className="bg-[#0d1115] p-4">
              <p className="text-[10px] uppercase text-zinc-600">Operator mode</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-200">Paper trading</span>
                <StateBadge tone={config.paperTradingEnabled ? "positive" : "danger"}>
                  {config.paperTradingEnabled ? "Default" : "Disabled"}
                </StateBadge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-200">Live trading</span>
                <StateBadge tone={config.liveTradingEnabled ? "danger" : "positive"}>
                  {config.liveTradingEnabled ? "Enabled" : "Locked"}
                </StateBadge>
              </div>
            </div>
            <div className="bg-[#0d1115] p-4">
              <p className="text-[10px] uppercase text-zinc-600">MEXC connection</p>
              <p className="mt-3 text-sm font-medium text-zinc-200">
                {exchangeStatus.credentialsReady ? "Credentials configured" : "Credentials unavailable"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <StateBadge tone={exchangeStatus.credentialsReady ? "positive" : "warning"}>
                  {exchangeStatus.credentialsReady ? "Server ready" : "Disconnected"}
                </StateBadge>
                <StateBadge tone={exchangeStatus.orderTestMode ? "info" : "danger"}>
                  {exchangeStatus.orderTestMode ? "Test order" : "Mainnet"}
                </StateBadge>
              </div>
            </div>
            <div className="bg-[#0d1115] p-4">
              <p className="text-[10px] uppercase text-zinc-600">AI provider</p>
              <p className="mt-3 font-mono text-sm text-zinc-200">{config.openAiModel}</p>
              <div className="mt-2">
                <StateBadge tone={openAiConfigured ? "positive" : "warning"}>
                  {openAiConfigured ? "OpenAI ready" : "Deterministic fallback"}
                </StateBadge>
              </div>
            </div>
            <div className="bg-[#0d1115] p-4">
              <p className="text-[10px] uppercase text-zinc-600">Environment</p>
              <p className="mt-3 font-mono text-sm text-zinc-200">
                {exchangeStatus.testnet ? "Testnet / protected" : "Mainnet / guarded"}
              </p>
              <div className="mt-2">
                <StateBadge tone={sessionRole === "admin" ? "positive" : "warning"}>
                  {sessionRole ?? "No operator role"}
                </StateBadge>
              </div>
            </div>
          </div>
        </TerminalPanel>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <TerminalPanel
            title="API connection checks"
            description="Only sanitized readiness and account diagnostics are shown. Credential values never reach the client."
            action={
              <Button onClick={recordAccountDiagnosticsSnapshot} variant="secondary">
                Record diagnostics
              </Button>
            }
          >
            <div className="divide-y divide-white/[0.06]">
              {[
                {
                  label: "MEXC Spot API",
                  detail: accountDiagnostics.beginnerExplanation,
                  tone:
                    accountDiagnostics.status === "pass"
                      ? "positive"
                      : accountDiagnostics.status === "fail"
                        ? "danger"
                        : "warning",
                  value: accountDiagnostics.status,
                },
                {
                  label: "CoinGecko market data",
                  detail: `${marketData.status.source} source, ${marketData.status.freshness} freshness`,
                  tone:
                    marketData.status.source === "coingecko"
                      ? "positive"
                      : marketData.status.freshness === "stale"
                        ? "warning"
                        : "info",
                  value: marketData.status.source,
                },
                {
                  label: "AI reasoning",
                  detail: openAiConfigured
                    ? `Requests use ${config.openAiModel} within the configured cost guard.`
                    : "Agents remain functional with deterministic, auditable local reasoning.",
                  tone: openAiConfigured ? "positive" : "warning",
                  value: openAiConfigured ? "OpenAI" : "Fallback",
                },
              ].map((connection) => (
                <div className="flex items-start justify-between gap-4 px-4 py-3" key={connection.label}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200">{connection.label}</p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-500">{connection.detail}</p>
                  </div>
                  <StateBadge
                    tone={
                      connection.tone as
                        | "positive"
                        | "warning"
                        | "danger"
                        | "neutral"
                        | "info"
                    }
                  >
                    {connection.value}
                  </StateBadge>
                </div>
              ))}
            </div>
          </TerminalPanel>

          <TerminalPanel
            title="Safety checklist"
            description="Every live request must pass this checklist again for the exact selected trade."
          >
            <div className="divide-y divide-white/[0.06]">
              {safetyChecks.map((check) => (
                <div className="flex items-start gap-3 px-4 py-3" key={check.label}>
                  <span
                    aria-hidden
                    className={`mt-1 size-1.5 shrink-0 rounded-full ${
                      check.pass ? "bg-emerald-400" : "bg-amber-300"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200">{check.label}</p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-500">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </TerminalPanel>
        </div>

        <div className="rounded-md border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3 text-xs leading-5 text-amber-100">
          {
            "Secret values are never printed. Trading-mode changes require server environment configuration, a new deployment, exact Risk Manager approval, and manual confirmation at execution time."
          }
        </div>

        <Panel
          description="Detailed MEXC account-mode evidence remains read-only and sanitized."
          title="MEXC diagnostics"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {accountDiagnostics.checks.map((check) => (
              <div className="rounded border border-white/[0.07] bg-black/20 p-3" key={check.name}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-medium text-zinc-200">{check.name}</h3>
                  <StateBadge
                    tone={
                      check.status === "pass"
                        ? "positive"
                        : check.status === "fail"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {check.status}
                  </StateBadge>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-500">{check.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

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

  function renderCompactExecutionPanel() {
    const selectedSideTone = paperTicket.side === "long" ? "positive" : "danger";

    return (
      <TerminalPanel
        title="Trade execution"
        description="Paper is the default. Live requests still pass through the server-side guard chain."
        action={
          <StateBadge tone={executionMode === "paper" ? "positive" : "danger"}>
            {executionMode === "paper" ? "Paper mode" : "Live review"}
          </StateBadge>
        }
      >
        <div className="p-4">
          <div className="grid grid-cols-2 rounded border border-white/[0.08] bg-[#080a0c] p-1">
            <button
              className={`rounded px-3 py-2 text-xs font-semibold ${
                executionMode === "paper"
                  ? "bg-emerald-400/[0.11] text-emerald-300"
                  : "text-zinc-600"
              }`}
              onClick={() => setExecutionMode("paper")}
              type="button"
            >
              Paper Trade
            </button>
            <button
              className={`rounded px-3 py-2 text-xs font-semibold ${
                executionMode === "live"
                  ? "bg-red-400/[0.11] text-red-300"
                  : "text-zinc-600"
              }`}
              onClick={() => setExecutionMode("live")}
              type="button"
            >
              Live Trade
            </button>
          </div>

          {executionMode === "live" ? (
            <div className="mt-3 flex gap-2 rounded border border-red-400/25 bg-red-400/[0.07] p-3 text-xs leading-5 text-red-200">
              <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
              Live mode is locked by default. Enabling the UI does not bypass admin, MEXC,
              product, risk, emergency-stop, no-trade, or manual-confirmation guards.
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Pair"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, symbol: value.toUpperCase() }))
              }
              value={paperTicket.symbol}
            />
            <div>
              <p className="text-[10px] font-semibold uppercase text-zinc-600">Direction</p>
              <div className="mt-1.5 grid h-9 grid-cols-2 rounded border border-white/[0.09] bg-[#090c0f] p-1">
                {(["long", "short"] as TradeSide[]).map((side) => (
                  <button
                    className={`rounded text-[11px] font-semibold ${
                      paperTicket.side === side
                        ? side === "long"
                          ? "bg-emerald-400/[0.13] text-emerald-300"
                          : "bg-red-400/[0.13] text-red-300"
                        : "text-zinc-600"
                    }`}
                    key={side}
                    onClick={() => setPaperTicket((current) => ({ ...current, side }))}
                    type="button"
                  >
                    {side === "long" ? "Buy / Long" : "Sell / Short"}
                  </button>
                ))}
              </div>
            </div>
            <TextInput
              label="Position size"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, quantity: value }))
              }
              type="number"
              value={paperTicket.quantity}
            />
            <TextInput
              label="Entry"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, entryPrice: value }))
              }
              type="number"
              value={paperTicket.entryPrice}
            />
            <TextInput
              label="Stop loss"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, stopLoss: value }))
              }
              type="number"
              value={paperTicket.stopLoss}
            />
            <TextInput
              label="Take profit"
              onChange={(value) =>
                setPaperTicket((current) => ({ ...current, takeProfit: value }))
              }
              type="number"
              value={paperTicket.takeProfit}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-white/[0.07] bg-white/[0.07]">
            {[
              ["Notional", formatUsd(paperTicketPreview.notionalUsd, 2)],
              [
                "Risk / reward",
                paperTicketPreview.riskRewardRatio === undefined
                  ? "n/a"
                  : `${paperTicketPreview.riskRewardRatio.toFixed(2)} : 1`,
              ],
            ].map(([label, value]) => (
              <div className="bg-[#090c0f] p-3" key={label}>
                <p className="text-[9px] uppercase text-zinc-700">{label}</p>
                <p className="mt-1 font-mono text-sm text-zinc-200">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded border border-white/[0.07] bg-white/[0.018] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase text-zinc-600">AI recommendation</p>
              <StateBadge tone={selectedSideTone}>{paperTicket.side}</StateBadge>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              {agent?.summary ?? selectedIdea.thesis}
            </p>
            <p className="mt-2 font-mono text-[10px] text-zinc-600">
              Confidence {Math.round(selectedIdea.confidence * 100)}% / Risk score{" "}
              {riskDecision.score}
            </p>
          </div>

          {executionMode === "live" ? (
            <TextInput
              label="Manual confirmation"
              onChange={setManualConfirmation}
              value={manualConfirmation}
            />
          ) : null}

          <div className="mt-4 grid gap-2">
            {executionMode === "paper" ? (
              <Button disabled={!paperTicketPreview.valid} onClick={submitPaperTicket}>
                Review & approve paper order
              </Button>
            ) : (
              <Button onClick={probeLiveExecution} variant="danger">
                Submit live request
              </Button>
            )}
            <button
              className="text-[10px] text-zinc-700 transition hover:text-zinc-400"
              onClick={syncPaperTicketFromSelectedIdea}
              type="button"
            >
              Sync selected idea
            </button>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-zinc-600">{paperTicketStatus}</p>
        </div>
      </TerminalPanel>
    );
  }

  function renderDashboard() {
    const paperEquity = seedPortfolio.equityUsd + unrealizedPnl + realizedPnl;
    const dailyPnl = seedPortfolio.dailyRealizedPnlUsd + unrealizedPnl + realizedPnl;
    const exposureUsd = openPositions.reduce(
      (sum, position) => sum + Math.abs(position.quantity * position.markPrice),
      0,
    );
    const selectedRiskUsd =
      Math.abs(selectedIdea.entryPrice - selectedIdea.stopLoss) * selectedIdea.quantity;
    const riskUtilization = Math.min(
      100,
      (selectedRiskUsd / Math.max(seedPortfolio.equityUsd, 1)) * 100 * 10,
    );

    return (
      <div className="space-y-3">
        <section className="grid grid-cols-2 overflow-hidden rounded-md border border-white/[0.08] xl:grid-cols-6">
          <MetricCell
            detail="Simulated portfolio"
            icon={WalletCards}
            label="Paper equity"
            tone="positive"
            value={formatUsd(paperEquity, 2)}
          />
          <MetricCell
            detail={`${dailyPnl >= 0 ? "+" : ""}${((dailyPnl / seedPortfolio.equityUsd) * 100).toFixed(2)}%`}
            icon={dailyPnl >= 0 ? ArrowUpRight : ArrowDownRight}
            label="Daily P&L"
            tone={dailyPnl >= 0 ? "positive" : "danger"}
            value={formatUsd(dailyPnl, 2)}
          />
          <MetricCell
            detail={`${openPositions.length} active paper trade${openPositions.length === 1 ? "" : "s"}`}
            icon={ChartNoAxesCombined}
            label="Open positions"
            value={String(openPositions.length)}
          />
          <MetricCell
            detail="Gross paper notional"
            icon={CircleDollarSign}
            label="Exposure"
            value={formatUsd(exposureUsd, 0)}
          />
          <MetricCell
            detail={`Selected ${selectedIdea.symbol}`}
            icon={Gauge}
            label="Risk score"
            tone={riskDecision.approved ? "positive" : "danger"}
            value={`${riskDecision.score}/100`}
          />
          <MetricCell
            detail={`${marketData.status.provider} / ${marketData.status.source}`}
            icon={Radar}
            label="Market data"
            tone={marketData.status.freshness === "fresh" ? "info" : "warning"}
            value={marketData.status.freshness.toUpperCase()}
          />
        </section>

        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-3">
            <MarketTable marketData={marketData} />

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
              <TerminalPanel
                title="AI signal feed"
                description="Selected trade ideas remain paper-first and require exact Risk Manager approval."
                action={
                  <Button onClick={() => setActiveView("trade-ideas")} variant="secondary">
                    Build idea
                  </Button>
                }
              >
                <div className="divide-y divide-white/[0.06]">
                  {ideas.slice(0, 5).map((idea) => {
                    const decision = evaluateRisk(idea, seedPortfolio, config);
                    const selected = idea.id === selectedIdea.id;
                    const reward = Math.abs((idea.takeProfit ?? idea.entryPrice) - idea.entryPrice);
                    const risk = Math.abs(idea.entryPrice - idea.stopLoss);
                    const ratio = risk > 0 ? reward / risk : 0;

                    return (
                      <button
                        className={`grid w-full gap-3 px-4 py-3 text-left transition hover:bg-white/[0.025] sm:grid-cols-[110px_minmax(0,1fr)_70px] ${
                          selected ? "bg-emerald-400/[0.035]" : ""
                        }`}
                        key={idea.id}
                        onClick={() => setSelectedIdeaId(idea.id)}
                        type="button"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold text-zinc-100">{idea.symbol}</p>
                          <p className="mt-1 text-[10px] uppercase text-zinc-600">{idea.product}</p>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StateBadge tone={idea.side === "long" ? "positive" : "danger"}>
                              {idea.side}
                            </StateBadge>
                            <span className="font-mono text-[10px] text-zinc-600">
                              {Math.round(idea.confidence * 100)}% confidence
                            </span>
                            <span className="font-mono text-[10px] text-zinc-600">
                              {ratio.toFixed(2)} : 1 R/R
                            </span>
                          </div>
                          <p className="mt-2 truncate text-xs text-zinc-500">{idea.thesis}</p>
                          <p className="mt-1 font-mono text-[10px] text-zinc-700">
                            Entry {idea.entryPrice} / Stop {idea.stopLoss} / Target{" "}
                            {idea.takeProfit ?? "manual"}
                          </p>
                        </div>
                        <StateBadge tone={decision.approved ? "positive" : "danger"}>
                          {decision.approved ? "Approved" : "Veto"}
                        </StateBadge>
                      </button>
                    );
                  })}
                </div>
              </TerminalPanel>

              <TerminalPanel
                title="Risk summary"
                description="Current selected trade and account constraints."
                action={
                  <Button onClick={recordLaunchReadinessSnapshot} variant="secondary">
                    Record snapshot
                  </Button>
                }
              >
                <div className="space-y-4 p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[10px]">
                      <span className="text-zinc-600">Selected risk utilization</span>
                      <span className="font-mono text-zinc-300">{riskUtilization.toFixed(1)}%</span>
                    </div>
                    <ProgressMeter
                      value={riskUtilization}
                      tone={riskUtilization > 75 ? "danger" : riskUtilization > 50 ? "warning" : "positive"}
                    />
                  </div>
                  {[
                    ["Daily loss limit", `${config.risk.maxDailyDrawdownPct}%`],
                    ["Max position", formatUsd(config.risk.maxPositionUsd, 0)],
                    ["Open exposure", formatUsd(exposureUsd, 0)],
                    ["Live trading lock", config.liveTradingEnabled ? "REVIEW" : "LOCKED"],
                  ].map(([label, value]) => (
                    <div className="flex items-center justify-between gap-4 text-xs" key={label}>
                      <span className="text-zinc-600">{label}</span>
                      <span className="font-mono text-zinc-300">{value}</span>
                    </div>
                  ))}
                  <div className="rounded border border-white/[0.07] bg-white/[0.018] p-3 text-[11px] leading-5 text-zinc-500">
                    {riskDecision.explanation}
                  </div>
                </div>
              </TerminalPanel>
            </div>

            <TerminalPanel
              title="Open positions"
              description="Local paper book marked against the latest available market snapshot."
            >
              {openPositions.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-white/[0.07] bg-white/[0.015] text-[10px] uppercase text-zinc-600">
                      <tr>
                        {["Pair", "Side", "Size", "Entry", "Mark", "P&L", "Mode", "Opened"].map(
                          (heading) => (
                            <th className="px-4 py-2.5 font-semibold" key={heading}>
                              {heading}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map((position) => (
                        <tr className="border-b border-white/[0.055] last:border-0" key={position.id}>
                          <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{position.symbol}</td>
                          <td className={`px-4 py-3 uppercase ${position.side === "long" ? "text-emerald-300" : "text-red-300"}`}>
                            {position.side}
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-400">{position.quantity}</td>
                          <td className="px-4 py-3 font-mono text-zinc-400">{formatUsd(position.entryPrice, 2)}</td>
                          <td className="px-4 py-3 font-mono text-zinc-400">{formatUsd(position.markPrice, 2)}</td>
                          <td className={`px-4 py-3 font-mono ${position.unrealizedPnlUsd >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                            {formatUsd(position.unrealizedPnlUsd, 2)}
                          </td>
                          <td className="px-4 py-3"><StateBadge tone="positive">Paper</StateBadge></td>
                          <td className="px-4 py-3 text-zinc-600">{formatUtcDateTime(position.openedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  description="Approve a paper order ticket to add a simulated position."
                  icon={ChartNoAxesCombined}
                  title="No open paper positions"
                />
              )}
            </TerminalPanel>
          </div>

          <aside className="min-w-0 space-y-3">
            {renderCompactExecutionPanel()}

            <TerminalPanel
              title="Agent status"
              description="Advisory agents cannot place orders."
              action={
                <Button disabled={agentLoading || !costUsage.allowed} onClick={runAgent} variant="secondary">
                  Run agent
                </Button>
              }
            >
              <div className="divide-y divide-white/[0.06]">
                {[
                  ["Research", BrainCircuit, agentWorkbench ? "Ready" : "Idle", selectedIdea.confidence],
                  ["Risk", ShieldCheck, riskDecision.approved ? "Approved" : "Veto", riskDecision.score / 100],
                  ["Execution", Zap, "Paper ready", 0.78],
                  ["Sentiment", Activity, marketData.status.freshness, 0.69],
                  ["Portfolio", WalletCards, openPositions.length ? "Tracking" : "Flat", 0.74],
                ].map(([label, Icon, status, confidence]) => {
                  const AgentIcon = Icon as LucideIcon;
                  return (
                    <div className="flex items-center gap-3 px-4 py-3" key={String(label)}>
                      <AgentIcon aria-hidden className="size-4 text-zinc-600" strokeWidth={1.6} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-300">{String(label)} Agent</p>
                        <p className="mt-0.5 text-[10px] text-zinc-700">{String(status)}</p>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {Math.round(Number(confidence) * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </TerminalPanel>

            <TerminalPanel title="Recent journal" description="Latest desk decisions and execution events.">
              <div className="divide-y divide-white/[0.06]">
                {journal.slice(0, 6).map((entry) => (
                  <div className="px-4 py-3" key={entry.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] uppercase text-zinc-600">{entry.event}</span>
                      <span className="font-mono text-[9px] text-zinc-700">
                        {formatUtcDateTime(entry.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-zinc-500">
                      {entry.summary}
                    </p>
                  </div>
                ))}
              </div>
            </TerminalPanel>
          </aside>
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
      <div className="space-y-3">
        {renderRiskOverview()}
        {renderRiskConsole()}
        {renderLaunchReadinessPanel()}
      </div>
    ),
    "paper-trading": () => (
      <div className="space-y-3">
        {renderCompactExecutionPanel()}
        {renderPaperPortfolio()}
        {renderRiskConsole()}
      </div>
    ),
    journal: renderJournal,
    reports: renderReports,
    settings: renderSettings,
    "system-health": renderHealth,
    "cost-control": renderCostControl,
  } satisfies Record<CommandView, () => React.ReactNode>;

  return (
    <div className="min-w-0 space-y-3">
      {renderOperatorBrief()}
      {content[activeView]()}
    </div>
  );
}
