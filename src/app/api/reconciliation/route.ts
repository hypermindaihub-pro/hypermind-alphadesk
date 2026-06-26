import { NextResponse } from "next/server";
import {
  fetchMexcOrderHistorySnapshots,
  fetchMexcOrderSnapshots,
  fetchMexcWalletBalances,
} from "@/lib/mexc";
import { getMexcAdapterStatus } from "@/lib/mexc-status";
import {
  createSimulatedExchangeSnapshots,
  type LocalOrderRecord,
  mergeOrderSnapshotsByKey,
  paperPositionsToLocalOrders,
  reconcileOrders,
} from "@/lib/order-reconciliation";
import {
  createSimulatedPositionSnapshots,
  paperPositionsToLocalExposure,
  reconcilePositions,
} from "@/lib/position-reconciliation";
import type { PaperPosition } from "@/lib/types";
import {
  createSimulatedWalletBalances,
  paperPositionsToLocalSpotInventory,
  reconcileWalletBalances,
} from "@/lib/wallet-reconciliation";

export const dynamic = "force-dynamic";

type ReconciliationRequest = {
  liveOrders?: unknown;
  positions?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizePositions(value: unknown): PaperPosition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): PaperPosition | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const id = readString(entry.id);
      const symbol = readString(entry.symbol);
      const side = entry.side === "long" || entry.side === "short" ? entry.side : null;
      const product =
        entry.product === "spot" || entry.product === "derivatives"
          ? entry.product
          : side === "short"
            ? "derivatives"
            : "spot";
      const quantity = readNumber(entry.quantity);
      const entryPrice = readNumber(entry.entryPrice);
      const markPrice = readNumber(entry.markPrice);
      const openedAt = readString(entry.openedAt);
      const unrealizedPnlUsd = readNumber(entry.unrealizedPnlUsd);

      if (
        !id ||
        !symbol ||
        !side ||
        quantity === null ||
        entryPrice === null ||
        markPrice === null ||
        !openedAt ||
        unrealizedPnlUsd === null
      ) {
        return null;
      }

      return {
        closedAt: readString(entry.closedAt) ?? undefined,
        entryPrice,
        id,
        markPrice,
        openedAt,
        product,
        quantity,
        realizedPnlUsd: readNumber(entry.realizedPnlUsd) ?? undefined,
        side,
        symbol: symbol.toUpperCase(),
        unrealizedPnlUsd,
      };
    })
    .filter((position): position is PaperPosition => Boolean(position))
    .slice(0, 120);
}

function sanitizeLiveOrders(value: unknown): LocalOrderRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): LocalOrderRecord | null => {
      if (!isRecord(entry)) {
        return null;
      }

      const id = readString(entry.id);
      const clientOrderId = readString(entry.clientOrderId);
      const symbol = readString(entry.symbol);
      const side = entry.side === "long" || entry.side === "short" ? entry.side : null;
      const product =
        entry.product === "spot" || entry.product === "derivatives" ? entry.product : null;
      const quantity = readNumber(entry.quantity);
      const updatedAt = readString(entry.updatedAt);

      if (
        !id ||
        !clientOrderId ||
        !symbol ||
        !side ||
        !product ||
        quantity === null ||
        !updatedAt
      ) {
        return null;
      }

      return {
        clientOrderId,
        expectedStatus: "expected-filled",
        id,
        product,
        quantity,
        side,
        source: "live",
        symbol: symbol.toUpperCase(),
        updatedAt,
      };
    })
    .filter((order): order is LocalOrderRecord => Boolean(order))
    .slice(0, 50);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ReconciliationRequest;
  const positions = sanitizePositions(body.positions);
  const paperOrders = paperPositionsToLocalOrders(positions);
  const liveOrders = sanitizeLiveOrders(body.liveOrders);
  const localOrders = liveOrders.length ? liveOrders : paperOrders;
  const localExposure = paperPositionsToLocalExposure(positions);
  const localSpotInventory = paperPositionsToLocalSpotInventory(positions);
  const exchangeStatus = getMexcAdapterStatus();
  const symbols = localOrders.map((order) => order.symbol);
  let exchangeOrders = createSimulatedExchangeSnapshots(localOrders);
  let exchangePositions = createSimulatedPositionSnapshots(localExposure);
  let walletBalances = createSimulatedWalletBalances(localSpotInventory);
  let mode: "simulated" | "mexc" = "simulated";
  let pollingMessage =
    "MEXC credentials are missing, so AlphaDesk used a simulated exchange snapshot from local paper orders.";

  if (exchangeStatus.credentialsReady && localOrders.length > 0) {
    try {
      const derivativeExposure = localExposure.filter(
        (exposure) => exposure.product === "derivatives",
      );
      const spotExposure = localExposure.filter((exposure) => exposure.product === "spot");
      const [realtimeOrders, historyOrders] = await Promise.all([
        fetchMexcOrderSnapshots({
          symbols,
        }),
        fetchMexcOrderHistorySnapshots({
          symbols,
        }),
      ]);

      exchangeOrders = mergeOrderSnapshotsByKey(realtimeOrders, historyOrders);
      exchangePositions = [
        ...createSimulatedPositionSnapshots(spotExposure),
        ...createSimulatedPositionSnapshots(derivativeExposure),
      ];
      walletBalances = await fetchMexcWalletBalances({
        coins: localSpotInventory.map((inventory) => inventory.coin),
      });
      mode = "mexc";
      pollingMessage =
        "MEXC read-only open-order, order-history, and spot wallet polling completed using server-side credentials. Derivatives exposure remains simulated because this adapter uses MEXC Spot V3.";
    } catch (error) {
      exchangeOrders = [];
      exchangePositions = [];
      walletBalances = [];
      mode = "mexc";
      pollingMessage =
        error instanceof Error
          ? error.message
          : "MEXC order status polling failed.";
    }
  }

  const reconciliation = reconcileOrders(localOrders, exchangeOrders, mode);
  const positionReconciliation = reconcilePositions(localExposure, exchangePositions, mode);
  const walletReconciliation = reconcileWalletBalances(
    localSpotInventory,
    walletBalances,
    mode,
  );

  return NextResponse.json({
    exchange: {
      credentialsReady: exchangeStatus.credentialsReady,
      provider: exchangeStatus.provider,
      testnet: exchangeStatus.testnet,
    },
    localOrderCount: localOrders.length,
    localPositionCount: localExposure.length,
    localSpotInventoryCount: localSpotInventory.length,
    pollingMessage,
    positionReconciliation,
    reconciliation,
    walletReconciliation,
  });
}
