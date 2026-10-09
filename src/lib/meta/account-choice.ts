// Choosing which Meta ad account MAIRO works in — the rules, kept pure so they
// can be checked without Meta or a database.
//
// The one that matters: campaigns MAIRO built live in the ad account they were
// built in. Pointing MAIRO at a different account while any of them is still
// running would leave them spending with nothing in MAIRO able to see or pause
// them. So switching waits until they're paused and removed (deleting a
// campaign in MAIRO pauses it in Meta first) — and a reconnect with a login
// that can no longer reach that account is refused for the same reason.

/** Meta's account_status, in words a business owner would use. */
export function accountStatusLabel(status: number | null | undefined): string {
  switch (status) {
    case 1:
      return "Active";
    case 2:
      return "Disabled by Meta";
    case 3:
      return "Unpaid balance";
    case 101:
      return "Closed";
    case 100:
      return "Closing";
    case 7:
    case 8:
    case 9:
      return "Meta is reviewing it";
    default:
      return "Can't run ads right now";
  }
}

export type ManagedCampaigns = { count: number; names: string[] };

function listed(names: string[], count: number): string {
  const shown = names.slice(0, 3).map((n) => `“${n}”`).join(", ");
  return count > names.slice(0, 3).length ? `${shown} and ${count - 3} more` : shown;
}

/** Why the ad account can't be changed to `next` right now, or null when it can. */
export function switchRefusal(input: { current: string | null; next: string; managed: ManagedCampaigns }): string | null {
  if (!input.current || input.current === input.next) return null;
  if (input.managed.count === 0) return null;
  const which = input.managed.count === 1 ? "a campaign" : `${input.managed.count} campaigns`;
  return (
    `MAIRO is managing ${which} in ad account ${input.current} (${listed(input.managed.names, input.managed.count)}). ` +
    `Switching now would leave ${input.managed.count === 1 ? "it" : "them"} running there with nothing in MAIRO able to pause ${input.managed.count === 1 ? "it" : "them"}. ` +
    `Delete ${input.managed.count === 1 ? "it" : "them"} in Campaigns first — that pauses ${input.managed.count === 1 ? "it" : "them"} in Meta — then switch.`
  );
}
