"use client";

import { useEffect, useRef } from "react";
import { reportActivity, type Activity } from "./activity";

/**
 * Reports `state` while `active` is true — an operation in flight, as the
 * component already knows it (a pending action, a running review) — and how
 * it ended once it stops. Never reports anything the component didn't see.
 */
export function useReportWhile(active: boolean, state: Activity, label?: string, outcome: () => Activity = () => "success") {
  const was = useRef(false);
  const end = useRef(outcome);
  useEffect(() => {
    end.current = outcome;
  });
  useEffect(() => {
    if (active && !was.current) reportActivity(state, label);
    if (!active && was.current) reportActivity(end.current());
    was.current = active;
  }, [active, state, label]);
  // Leaving the page mid-operation leaves nothing spinning.
  useEffect(
    () => () => {
      if (was.current) reportActivity("idle");
    },
    [],
  );
}
