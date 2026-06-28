"use client";

import { useCallback, useRef, useState } from "react";

// Mirrors the `AsyncUiState<T>` contract in contracts/api-types.ts without
// importing server-only types into client code. Every async surface in the
// command center should flow through this so the shared loading / success /
// empty / error / cost-blocked rules are enforced in one place.
export type AsyncUiStatus =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "blocked"
  | "error";

export type AsyncUiState<T> = {
  status: AsyncUiStatus;
  data?: T;
  message?: string;
  // `retryable` is only meaningful for the error state.
  retryable: boolean;
};

export type AsyncOutcome<T> =
  | { kind: "success"; data: T; message?: string }
  | { kind: "empty"; message: string; data?: T }
  | { kind: "blocked"; message: string; data?: T };

export class AsyncActionError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "AsyncActionError";
    this.retryable = retryable;
  }
}

const idleState: AsyncUiState<never> = {
  status: "idle",
  retryable: false,
};

/**
 * Drive a single async action with contract-compliant UI states.
 *
 * - Disables duplicate submissions while in flight (`isRunning` guard).
 * - Preserves the last successful `data` when a refresh fails.
 * - Distinguishes empty, cost-blocked, and sanitized error outcomes.
 * - Never turns a thrown failure into a false success.
 */
export function useAsyncAction<T, Args extends unknown[] = []>(
  action: (...args: Args) => Promise<AsyncOutcome<T>>,
) {
  const [state, setState] = useState<AsyncUiState<T>>(idleState);
  const runningRef = useRef(false);

  const run = useCallback(
    async (...args: Args) => {
      if (runningRef.current) {
        return;
      }

      runningRef.current = true;
      setState((current) => ({
        status: "loading",
        // keep last safe data visible while loading
        data: current.data,
        retryable: false,
      }));

      try {
        const outcome = await action(...args);

        if (outcome.kind === "empty") {
          setState({
            status: "empty",
            data: outcome.data,
            message: outcome.message,
            retryable: false,
          });
          return;
        }

        if (outcome.kind === "blocked") {
          setState({
            status: "blocked",
            data: outcome.data,
            message: outcome.message,
            retryable: false,
          });
          return;
        }

        setState({
          status: "success",
          data: outcome.data,
          message: outcome.message,
          retryable: false,
        });
      } catch (error) {
        const retryable =
          error instanceof AsyncActionError ? error.retryable : true;
        const message =
          error instanceof Error
            ? error.message
            : "The request failed before a safe result was produced.";

        setState((current) => ({
          status: "error",
          // preserve last safe data on failure
          data: current.data,
          message,
          retryable,
        }));
      } finally {
        runningRef.current = false;
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    setState(idleState);
  }, []);

  return {
    state,
    run,
    reset,
    isLoading: state.status === "loading",
  };
}
