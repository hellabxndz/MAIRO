"use client";

import { useState } from "react";
import type { DecisionView } from "@/lib/decisions/store";
import { MairoDecisionCard } from "./decision-card";

/**
 * The list of decision cards, held in the browser.
 *
 * Approving a decision refreshes the page's data, and without this the card
 * being approved would vanish mid-way — taking the "Mairo made 2 changes"
 * result with it. The list keeps the cards it was first given; each card shows
 * its own outcome, and the next visit shows the fresh list.
 */
export function DecisionList({ decisions, advanced }: { decisions: DecisionView[]; advanced: boolean }) {
  const [items] = useState(decisions);
  return (
    <div className="space-y-4">
      {items.map((d) => (
        <MairoDecisionCard key={d.id} decision={d} advanced={advanced} />
      ))}
    </div>
  );
}
