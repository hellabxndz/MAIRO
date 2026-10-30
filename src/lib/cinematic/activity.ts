// What MAIRO is doing right now, in this browser — so the MAIRO core in the
// app can show it.
//
// Only real operations report here, at the moment they start and finish:
// the campaign review running, a campaign being built in Meta, an ad being
// made, a recommendation being applied, the assistant answering. Nothing
// reports on a timer and nothing pretends: when no operation is running, the
// core shows the account's resting state (what the page passed in — e.g.
// something waiting for approval), and when an operation finishes it says so
// once and settles.

export type Activity =
  | "idle" // nothing running
  | "attention" // something waits for the owner (resting state from the page)
  | "thinking" // the assistant is answering, or a request was just sent
  | "analyzing" // a review or an analysis is running
  | "generating" // an ad or a picture is being made
  | "building" // a campaign is being built, or a change applied, in Meta
  | "success" // an operation just finished
  | "error"; // an operation just failed

export const ACTIVITY_EVENT = "mairo:activity";

export type ActivityDetail = { state: Activity; label?: string };

/** Report an operation's state. Browser only; a no-op on the server. */
export function reportActivity(state: Activity, label?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ActivityDetail>(ACTIVITY_EVENT, { detail: { state, label } }));
}

/** What the core says, in the owner's words, for each state. */
export const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: "Ready",
  attention: "Waiting for you",
  thinking: "Thinking…",
  analyzing: "Reviewing…",
  generating: "Making your ad…",
  building: "Building in Meta…",
  success: "Done",
  error: "That didn't work",
};

/** How the particles move in each state. */
export const ACTIVITY_LOOK: Record<Activity, { shape: "core" | "creative" | "network"; energy: number; pulse: number; turbulence: number; gain: number; spin: number }> = {
  idle: { shape: "core", energy: 0.05, pulse: 0, turbulence: 0.3, gain: 0.85, spin: 1 },
  attention: { shape: "core", energy: 0.15, pulse: 0.55, turbulence: 0.3, gain: 0.95, spin: 1 },
  thinking: { shape: "core", energy: 0.6, pulse: 0.35, turbulence: 0.5, gain: 1.05, spin: 1.8 },
  analyzing: { shape: "core", energy: 1, pulse: 0.25, turbulence: 0.9, gain: 1.15, spin: 2.6 },
  generating: { shape: "creative", energy: 0.7, pulse: 0.2, turbulence: 0.7, gain: 1.1, spin: 0 },
  building: { shape: "network", energy: 0.7, pulse: 0.3, turbulence: 0.6, gain: 1.1, spin: 1.4 },
  success: { shape: "core", energy: 0.2, pulse: 1, turbulence: 0.3, gain: 1.35, spin: 1 },
  error: { shape: "core", energy: 0.05, pulse: 0, turbulence: 0.2, gain: 0.55, spin: 0.5 },
};

/** How long a finish is shown before the core settles back to resting. */
export const SETTLE_MS = 1800;
