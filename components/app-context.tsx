"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Snapshot } from "@/lib/analytics";
import type { TaskRow } from "@/lib/state";

export type SnapshotResponse = Snapshot & { tasks: TaskRow[] };

export const HISTORY_START = "2025-01-15";
export const HISTORY_END = "2025-04-20";

interface Ctx {
  asOf: string;
  setAsOf: (d: string) => void;
  stalledDays: number;
  setStalledDays: (n: number) => void;
  copilotOpen: boolean;
  setCopilotOpen: (b: boolean) => void;
  askCopilot: (q: string) => void;
  pendingQuestion: string | null;
  clearPendingQuestion: () => void;
  refreshAll: () => Promise<void>;
}
const AppCtx = createContext<Ctx | null>(null);

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export async function send<T = unknown>(url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [asOf, setAsOf] = useState(HISTORY_END);
  const [stalledDays, setStalledDays] = useState(7);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const { mutate } = useSWRConfig();
  const refreshAll = useCallback(async () => {
    await mutate(() => true, undefined, { revalidate: true });
  }, [mutate]);
  const askCopilot = useCallback((q: string) => {
    setPendingQuestion(q);
    setCopilotOpen(true);
  }, []);
  return (
    <AppCtx.Provider
      value={{
        asOf,
        setAsOf,
        stalledDays,
        setStalledDays,
        copilotOpen,
        setCopilotOpen,
        askCopilot,
        pendingQuestion,
        clearPendingQuestion: () => setPendingQuestion(null),
        refreshAll,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function useSnapshot(extra = "") {
  const { asOf, stalledDays } = useApp();
  return useSWR<SnapshotResponse>(`/api/analytics?asOf=${asOf}&stalledDays=${stalledDays}${extra}`, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
}
