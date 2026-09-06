// The "WHY MAIRO?" film, as data.
//
// Everything about pacing and wording lives here so it can be edited without
// going near the rendering code. Times are seconds from the first frame.
//
// There is no video file and no recorded voiceover. The whole thing is drawn at
// runtime — a canvas for the sky and the planet, DOM and CSS for the type. That
// keeps it to a few kilobytes instead of a download, lets it render sharp at any
// size, and sidesteps the autoplay problem entirely: there is no <video> element
// for a browser to block.
//
// Because of that, every spoken line is also a caption. Sound is optional and
// synthesised on request; the film has to make sense with the volume off, which
// is the normal case on the web.

export type Scene = {
  id: string;
  /** Seconds from the start. */
  from: number;
  to: number;
};

/**
 * The film runs a little over sixty seconds. The extra time is the Milky Way
 * and the descent to Earth, which needs room to breathe or it reads as a jump
 * cut rather than a journey.
 */
export const SCENES: Scene[] = [
  { id: "enter", from: 0, to: 6.5 },     // black, a point of light, the galaxy
  { id: "earth", from: 6.5, to: 13 },    // into the Milky Way, down to Earth
  { id: "why", from: 13, to: 19 },       // WHY MAIRO?
  { id: "old", from: 19, to: 29 },       // the traditional way
  { id: "intro", from: 29, to: 40 },     // introducing MAIRO
  { id: "build", from: 40, to: 51 },     // the AI builds the campaign
  { id: "whyai", from: 51, to: 59 },     // why AI
  { id: "final", from: 59, to: 64.5 },   // the reveal, then two seconds to hold
];

export const RUNTIME = SCENES[SCENES.length - 1].to;

export type Caption = {
  from: number;
  to: number;
  text: string;
  /**
   * Shown as full-size type in the middle of the frame rather than as a caption
   * along the bottom. For the one or two lines that are the point of a scene
   * rather than narration over it.
   */
  hero?: boolean;
};

/**
 * The spoken lines.
 *
 * Two claims are deliberately not made anywhere in here. Nothing suggests that
 * freelancers or agencies are dishonest — the point is that going through
 * anyone adds cost and turnaround, which is true and provable. And nothing
 * promises a result. MAIRO is described as faster, simpler and able to test
 * more, never as something that will make a business money.
 */
export const CAPTIONS: Caption[] = [
  // The windows are not guesses. Each line was synthesised, measured, and the
  // window widened (or the line shortened) until the speech fits inside it —
  // otherwise the narration runs on over the next caption, saying one thing
  // while the screen says another.
  { from: 4.2, to: 6.4, text: "Advertising is changing." },
  { from: 9.4, to: 12.8, text: "So what's stopping you from letting AI run your ads?", hero: true },
  { from: 13.6, to: 16.3, text: "Running your business is already your job." },
  { from: 16.5, to: 18.9, text: "Running your ads shouldn't have to be another one." },

  // Short sentences, spoken order. This was one clause with five commas in it,
  // which reads fine on a page and sounds exactly like someone reading a page.
  { from: 19.5, to: 22.6, text: "Right now? You find someone. You explain everything." },
  { from: 22.8, to: 25.9, text: "You wait for creatives. Ask for changes. Wait again." },
  { from: 26.1, to: 29.2, text: "Then you pay management fees. Before your budget does anything." },

  { from: 29.6, to: 31.6, text: "MAIRO changes that." },
  { from: 35.0, to: 39.4, text: "You just tell it what you sell, what you want, and what you can spend." },

  { from: 41.0, to: 44.6, text: "It turns that into a strategy. The creative. Who to show it to." },
  { from: 44.8, to: 48.6, text: "Where every dollar goes. All of it, in one place." },

  { from: 51.4, to: 54.6, text: "AI doesn't need a week to see what's already in the numbers." },
  { from: 54.8, to: 59.0, text: "So instead of paying for every step by hand, it's faster. And simpler." },

  { from: 59.4, to: 61.3, text: "Your business knows where it wants to go." },
  { from: 61.7, to: 63.8, text: "Give it the intelligence to get there." },
];

/** Drifting behind the WHY MAIRO? type. Deliberately faint. */
export const AD_TERMS = [
  "Campaigns",
  "Creatives",
  "Audiences",
  "Budgets",
  "Analytics",
  "Performance",
];

/** The traditional process, shown as fragments that never line up. */
export const OLD_WAY = [
  "Find a freelancer",
  "Wait for a response",
  "Send your assets",
  "Explain your business",
  "Wait for creatives",
  "Request changes",
  "Wait again",
  "Pay management fees",
];

/** Where the money goes before it reaches an auction. */
export const BUDGET_SPLIT = ["Your ad budget", "Management fees", "Creative fees", "Ad spend"];

/** The three questions MAIRO actually asks, with the answers typed in. */
export const ONBOARDING = [
  { q: "What does your business sell?", a: "Premium streetwear." },
  { q: "What is your goal?", a: "Increase purchases." },
  { q: "Monthly advertising budget", a: "$2,500" },
];

/** What MAIRO works through. Recognisable steps, not sci-fi telemetry. */
export const PIPELINE = [
  "Business",
  "Customer",
  "Goal",
  "Creative strategy",
  "Campaign structure",
  "Budget allocation",
];

/** Orbiting the intelligence in the "why AI" scene. */
export const SIGNALS = [
  "Creative performance",
  "Cost per purchase",
  "Conversions",
  "Audience performance",
  "Campaign spend",
];

export const AI_ADVANTAGES = [
  "Faster iteration",
  "More creative testing",
  "Data-driven decisions",
  "One platform",
];
