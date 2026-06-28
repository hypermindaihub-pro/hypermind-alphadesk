"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { AsyncActionError, useAsyncAction } from "@/lib/ui/use-async-action";
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
import { buildForecastCalibration } from "@/lib/forecast-calibration";
import { formatUsd } from "@/lib/format";
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
import { DeskProvider } from "./desk/desk-context";
import {
  AgentConsole,
  CostControlView,
  DashboardView,
  JournalView,
  OperatorBrief,
  PaperTradingView,
  ReportsView,
  RiskView,
  SettingsView,
  SystemHealthView,
  TradeIdeasView,
} from "./desk/desk-views";
import { WatchlistView } from "./desk/watchlist-view";

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

type LiveOrderProbeResult = {
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

// The shared shape every extracted command-center view consumes via useDesk().
// It is the seam between the stateful CommandCenter shell and the stateless
// presentation views. Assembled once at the end of CommandCenter.
export type DeskController = {
  // sanitized server page data (passed through unchanged)
  accountDiagnostics: AccountDiagnostics;
  marketData: MarketDataResult;
  config: AlphaConfig;
  exchangeStatus: ExchangeAdapterStatus;
  costUsage: CostUsage;
  healthChecks: HealthCheck[];
  sessionRole: AccessRole | null;
  // local desk state + the setters views are allowed to drive
  activeView: CommandView;
  navigate: (view: CommandView) => void;
  ideas: TradeIntent[];
  setSelectedIdeaId: Dispatch<SetStateAction<string>>;
  positions: PaperPosition[];
  journal: JournalEntry[];
  readinessHistory: LaunchReadinessHistoryEntry[];
  diagnosticsHistory: AccountDiagnosticsHistoryEntry[];
  persistenceMode: DeskPersistenceMode;
  storageStatus: string;
  storageHydrated: boolean;
  agent: AgentReasoning | null;
  agentWorkbench: AgentWorkbenchResult | null;
  agentLoading: boolean;
  agentError: string | null;
  agentBlocked: string | null;
  reconciliation: OrderReconciliationSummary | null;
  positionReconciliation: PositionReconciliationSummary | null;
  walletReconciliation: WalletReconciliationSummary | null;
  reconciliationLoading: boolean;
  reconciliationError: string | null;
  reconciliationMessage: string;
  liveProbe: LiveOrderProbeResult | null;
  liveProbeLoading: boolean;
  liveProbeError: string | null;
  executionMode: "paper" | "live";
  setExecutionMode: Dispatch<SetStateAction<"paper" | "live">>;
  manualConfirmation: string;
  setManualConfirmation: Dispatch<SetStateAction<string>>;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  projectedCalls: string;
  setProjectedCalls: Dispatch<SetStateAction<string>>;
  vaultPassphrase: string;
  setVaultPassphrase: Dispatch<SetStateAction<string>>;
  vaultPayload: string;
  setVaultPayload: Dispatch<SetStateAction<string>>;
  vaultStatus: string;
  draft: DraftIdea;
  setDraft: Dispatch<SetStateAction<DraftIdea>>;
  paperTicket: PaperTicketDraft;
  setPaperTicket: Dispatch<SetStateAction<PaperTicketDraft>>;
  paperTicketStatus: string;
  // derived values
  selectedIdea: TradeIntent;
  paperTicketPreview: ReturnType<typeof buildPaperOrderTicket>;
  riskDecision: ReturnType<typeof evaluateRisk>;
  launchReadiness: ReturnType<typeof buildLaunchReadinessSnapshot>;
  markedPositions: PaperPosition[];
  openPositions: PaperPosition[];
  closedPositions: PaperPosition[];
  unrealizedPnl: number;
  realizedPnl: number;
  forecastCalibration: ReturnType<typeof buildForecastCalibration>;
  projectedCost: CostUsage;
  operatorBrief: ReturnType<typeof buildOperatorBrief>;
  // handlers
  recordLaunchReadinessSnapshot: () => void;
  recordAccountDiagnosticsSnapshot: () => void;
  syncPaperTicketFromSelectedIdea: () => void;
  executeSelectedIdeaAsPaperTrade: () => void;
  submitPaperTicket: () => void;
  closeFirstOpenPosition: () => void;
  submitDraftIdea: () => void;
  runAgent: () => Promise<void>;
  runExchangeReconciliation: () => Promise<void>;
  probeLiveExecution: () => Promise<void>;
  addManualNote: () => void;
  resetLocalDesk: () => void;
  enableEncryptedAutosave: () => Promise<void>;
  unlockEncryptedAutosave: () => Promise<void>;
  lockEncryptedAutosave: () => void;
  disableEncryptedAutosave: () => void;
  createEncryptedVault: () => Promise<void>;
  importEncryptedVault: () => Promise<void>;
  downloadEncryptedVault: () => Promise<void>;
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
  const router = useRouter();
  // One URL per view: in-app shortcuts navigate to the route rather than
  // swapping a local view, so the address bar and back button stay correct.
  const navigate = useCallback(
    (view: CommandView) => {
      router.push(`/${view}`);
    },
    [router],
  );
  const [activeView] = useState<CommandView>(initialView);
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
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentBlocked, setAgentBlocked] = useState<string | null>(null);
  const [reconciliation, setReconciliation] =
    useState<OrderReconciliationSummary | null>(null);
  const [liveOrders, setLiveOrders] = useState<LocalOrderRecord[]>([]);
  const [positionReconciliation, setPositionReconciliation] =
    useState<PositionReconciliationSummary | null>(null);
  const [walletReconciliation, setWalletReconciliation] =
    useState<WalletReconciliationSummary | null>(null);
  const [reconciliationMessage, setReconciliationMessage] = useState(
    "Run reconciliation to compare local paper orders with exchange-style order status snapshots.",
  );
  const [liveProbe, setLiveProbe] = useState<LiveOrderProbeResult | null>(null);
  const [liveProbeLoading, setLiveProbeLoading] = useState(false);
  const [liveProbeError, setLiveProbeError] = useState<string | null>(null);
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
    navigate("risk");
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
    // Disable duplicate submissions while a call is in flight.
    if (agentLoading) {
      return;
    }

    setAgentLoading(true);
    setAgentError(null);
    setAgentBlocked(null);

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            reasoning?: AgentReasoning;
            workbench?: AgentWorkbenchResult;
            mode?: string;
            message?: string;
          }
        | null;

      // Cost control returns 429 (or a blocked mode) — surface it as its own
      // state, never as a successful reasoning result.
      if (response.status === 429 || payload?.mode === "blocked") {
        setAgentBlocked(
          payload?.message ??
            "Cost control blocked this agent call because the projected spend exceeds a configured limit.",
        );
        return;
      }

      if (!response.ok || !payload?.reasoning) {
        setAgentError(
          "The agent service returned an error. The previous reasoning is preserved.",
        );
        return;
      }

      const nextAgent = payload.reasoning;
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
    } catch {
      // Network/transport failure: keep the last safe reasoning visible.
      setAgentError(
        "The agent request failed before a safe result was produced. Check your connection and try again.",
      );
    } finally {
      setAgentLoading(false);
    }
  }

  // Reconciliation runs through the shared async-action machine so it gets the
  // same loading / retryable-error lifecycle as the agent and live-order flows.
  // The last good report is preserved when a refresh fails.
  const reconcileAction = useAsyncAction(async () => {
    let response: Response;
    try {
      response = await fetch("/api/reconciliation", {
        body: JSON.stringify({
          liveOrders,
          positions: markedPositions,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    } catch {
      throw new AsyncActionError(
        "Reconciliation failed before reaching the server. The previous report is preserved.",
        true,
      );
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          pollingMessage?: string;
          positionReconciliation?: PositionReconciliationSummary;
          reconciliation?: OrderReconciliationSummary;
          walletReconciliation?: WalletReconciliationSummary;
        }
      | null;

    if (!response.ok || !payload?.reconciliation) {
      throw new AsyncActionError(
        "Reconciliation did not return a safe report. The previous report is preserved.",
        true,
      );
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

    return { kind: "success", data: payload.reconciliation };
  });
  const runExchangeReconciliation = reconcileAction.run;
  const reconciliationLoading = reconcileAction.isLoading;
  const reconciliationError =
    reconcileAction.state.status === "error"
      ? reconcileAction.state.message ?? null
      : null;

  async function probeLiveExecution() {
    // Disable duplicate submissions while a live request is in flight.
    if (liveProbeLoading) {
      return;
    }

    setExecutionMode("live");
    setLiveProbeLoading(true);
    setLiveProbeError(null);

    let payload: LiveOrderProbeResult | null = null;

    try {
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
      const parsed = (await response.json().catch(() => null)) as
        | (Partial<LiveOrderProbeResult> & { reasons?: string[] })
        | null;

      // A 403 is the expected "guards rejected" response and still carries the
      // full reasons list. Any other non-OK status (401/503/5xx) or an
      // unparseable body is a transport/auth failure, not a guard verdict.
      if (!parsed || (!response.ok && response.status !== 403) || !Array.isArray(parsed.reasons)) {
        setLiveProbeError(
          "The live-order request did not reach the server guard chain. No order was sent. Resolve the connection or session and try again.",
        );
        return;
      }

      // Shape is guaranteed by the API on 200/403; reasons verified above.
      payload = parsed as LiveOrderProbeResult;
      setLiveProbe(payload);

      if (payload.submitted && (payload.order?.orderLinkId || payload.order?.orderId)) {
        setLiveOrders((current) => [
          {
            clientOrderId: payload?.order?.orderLinkId ?? payload?.order?.orderId ?? selectedIdea.id,
            expectedStatus: "expected-filled",
            id: payload?.order?.orderId ?? payload?.order?.orderLinkId ?? selectedIdea.id,
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
    } catch {
      setLiveProbeError(
        "The live-order request failed before reaching the server guard chain. No order was sent.",
      );
      return;
    } finally {
      setLiveProbeLoading(false);
    }

    // Reached only when the guard chain returned a parseable verdict.
    if (!payload) {
      return;
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
    setLiveProbeError(null);
    setAgent(null);
    setAgentError(null);
    setAgentBlocked(null);
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

  const content = {
    dashboard: () => <DashboardView />,
    watchlist: () => <WatchlistView marketData={marketData} />,
    agents: () => <AgentConsole />,
    "trade-ideas": () => <TradeIdeasView />,
    risk: () => <RiskView />,
    "paper-trading": () => <PaperTradingView />,
    journal: () => <JournalView />,
    reports: () => <ReportsView />,
    settings: () => <SettingsView />,
    "system-health": () => <SystemHealthView />,
    "cost-control": () => <CostControlView />,
  } satisfies Record<CommandView, () => React.ReactNode>;

  const desk: DeskController = {
    accountDiagnostics,
    marketData,
    config,
    exchangeStatus,
    costUsage,
    healthChecks,
    sessionRole,
    activeView,
    navigate,
    ideas,
    setSelectedIdeaId,
    positions,
    journal,
    readinessHistory,
    diagnosticsHistory,
    persistenceMode,
    storageStatus,
    storageHydrated,
    agent,
    agentWorkbench,
    agentLoading,
    agentError,
    agentBlocked,
    reconciliation,
    positionReconciliation,
    walletReconciliation,
    reconciliationLoading,
    reconciliationError,
    reconciliationMessage,
    liveProbe,
    liveProbeLoading,
    liveProbeError,
    executionMode,
    setExecutionMode,
    manualConfirmation,
    setManualConfirmation,
    note,
    setNote,
    projectedCalls,
    setProjectedCalls,
    vaultPassphrase,
    setVaultPassphrase,
    vaultPayload,
    setVaultPayload,
    vaultStatus,
    draft,
    setDraft,
    paperTicket,
    setPaperTicket,
    paperTicketStatus,
    selectedIdea,
    paperTicketPreview,
    riskDecision,
    launchReadiness,
    markedPositions,
    openPositions,
    closedPositions,
    unrealizedPnl,
    realizedPnl,
    forecastCalibration,
    projectedCost,
    operatorBrief,
    recordLaunchReadinessSnapshot,
    recordAccountDiagnosticsSnapshot,
    syncPaperTicketFromSelectedIdea,
    executeSelectedIdeaAsPaperTrade,
    submitPaperTicket,
    closeFirstOpenPosition,
    submitDraftIdea,
    runAgent,
    runExchangeReconciliation,
    probeLiveExecution,
    addManualNote,
    resetLocalDesk,
    enableEncryptedAutosave,
    unlockEncryptedAutosave,
    lockEncryptedAutosave,
    disableEncryptedAutosave,
    createEncryptedVault,
    importEncryptedVault,
    downloadEncryptedVault,
  };

  return (
    <DeskProvider value={desk}>
      <div className="min-w-0 space-y-3">
        <OperatorBrief />
        {content[activeView]()}
      </div>
    </DeskProvider>
  );
}
