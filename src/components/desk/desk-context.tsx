"use client";

import { createContext, useContext, type ReactNode } from "react";
// Type-only import — erased at build time, so this does NOT create a runtime
// import cycle with command-center.tsx (which imports DeskProvider from here).
import type { DeskController } from "../command-center";

const DeskContext = createContext<DeskController | null>(null);

export function DeskProvider({
  value,
  children,
}: {
  value: DeskController;
  children: ReactNode;
}) {
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

// Shared accessor for every extracted command-center view. Throws if used
// outside the provider so a misplaced view fails loudly instead of rendering
// with undefined desk state.
export function useDesk(): DeskController {
  const value = useContext(DeskContext);

  if (!value) {
    throw new Error("useDesk must be used within a DeskProvider.");
  }

  return value;
}
