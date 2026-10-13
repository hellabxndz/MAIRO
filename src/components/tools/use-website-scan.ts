"use client";

import { useCallback, useRef, useState } from "react";
import type { ScanProgress, ScanResult } from "@/lib/website/scan";

// Runs a website reading through /api/tools/scan and follows its real
// progress, line by line, as the server reads each page and link.

export type ScanState =
  | { phase: "idle" }
  | { phase: "running"; progress: ScanProgress | null }
  | { phase: "done"; result: ScanResult; cached: boolean; scanId?: string }
  | { phase: "error"; message: string; limit?: string };

export function useWebsiteScan() {
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const busy = useRef(false);
  const run = useCallback(async (input: { url: string; adMessage?: string; account?: boolean; recheck?: boolean }): Promise<ScanResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    setState({ phase: "running", progress: null });
    let final: ScanResult | null = null;
    try {
      const res = await fetch("/api/tools/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (!res.body) throw new Error("No response");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as { type: string } & Record<string, unknown>;
          if (msg.type === "progress") setState({ phase: "running", progress: msg as unknown as ScanProgress });
          else if (msg.type === "result") {
            final = msg.result as ScanResult;
            setState({ phase: "done", result: final, cached: Boolean(msg.cached), scanId: msg.scanId as string | undefined });
          } else if (msg.type === "error") setState({ phase: "error", message: String(msg.message), limit: msg.limit as string | undefined });
        }
      }
      if (!final) setState((s) => (s.phase === "error" ? s : { phase: "error", message: "The check didn't finish. Try again." }));
    } catch {
      setState({ phase: "error", message: "Couldn't reach MAIRO. Check your connection and try again." });
    } finally {
      busy.current = false;
    }
    return final;
  }, []);
  return { state, run };
}
