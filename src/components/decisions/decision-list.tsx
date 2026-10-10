"use client";

import { useState, type ReactNode } from "react";
import type { DecisionView } from "@/lib/decisions/store";
import type { ApprovalFacts } from "@/lib/decisions/approval";
import { MairoDecisionCard } from "./decision-card";

/**
 * The list of decision cards, held in the browser.
 *
 * Approving a decision refreshes the page's data, and without this the card
 * being approved would vanish mid-way — taking the "MAIRO made 2 changes"
 * result with it. The list keeps the cards it was first given; each card shows
 * its own outcome, and the next visit shows the fresh list.
 */
export function DecisionList({ decisions, advanced, facts = {}, trails = {}, timeZone }: { decisions: DecisionView[]; advanced: boolean; facts?: Record<string, ApprovalFacts>; trails?: Record<string, ReactNode>; timeZone?: string }) {
  const [items] = useState(decisions);
  return (
    <div className="space-y-4">
      {items.map((d) => (
        <MairoDecisionCard key={d.id} decision={d} advanced={advanced} facts={facts[d.id]} trail={trails[d.id]} timeZone={timeZone} />
      ))}
    </div>
  );
}
