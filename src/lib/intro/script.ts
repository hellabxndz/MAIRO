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
 * Just under seventy seconds. It grew twice for good reasons: the Milky Way and
 * the descent to Earth need room or they read as a jump cut rather than a
 * journey, and the narration is now near-continuous, which takes the time it
 * takes. Scene lengths are set by how long the lines spoken over them actually
 * are — see CAPTIONS.
 */
export const SCENES: Scene[] = [
  { id: "enter", from: 0, to: 6.5 },       // black, a point of light, the galaxy
  { id: "earth", from: 6.5, to: 13.2 },    // into the Milky Way, down to Earth
  { id: "why", from: 13.2, to: 19.4 },     // WHY MAIRO?
  { id: "old", from: 19.4, to: 30.2 },     // the traditional way
  { id: "intro", from: 30.2, to: 41.6 },   // introducing MAIRO
  { id: "build", from: 41.6, to: 53.4 },   // the AI builds the campaign
  { id: "whyai", from: 53.4, to: 61.8 },   // why AI
  { id: "final", from: 61.8, to: 68.5 },   // the reveal, then a hold on ENTER MAIRO
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
  // GENERATED, not authored. Every line is synthesised, warmed, measured, and
  // the schedule packed so each starts at its scene anchor or just after the
  // previous line ends. Change a line's wording and these have to be
  // regenerated with it.
  //
  // Two things stay out of the copy however warm it gets: nothing suggests
  // anyone in the traditional process is dishonest — only that going through
  // them costs money and time, which is true — and nothing promises a result.
  { from: 2.6, to: 5.14, text: "Something is changing in advertising." },
  { from: 5.6, to: 8.25, text: "And for small businesses, it's about time." },
  { from: 8.8, to: 10.55, text: "So let me ask you something." },
  { from: 10.8, to: 13.35, text: "What's stopping you from letting AI run your ads?", hero: true },
  { from: 13.59, to: 17.07, text: "Look — running your business is already a full-time job." },
  { from: 17.31, to: 19.75, text: "Running your ads shouldn't have to be another one." },
  { from: 19.99, to: 23.48, text: "Right now, here's how it goes. You find someone." },
  { from: 23.72, to: 27.3, text: "You explain your whole business. You wait for creatives." },
  { from: 27.54, to: 32.58, text: "You ask for changes. You wait again. And you're paying management fees the whole time." },
  { from: 32.82, to: 34.09, text: "MAIRO changes that." },
  { from: 34.33, to: 36.27, text: "And here's how simple it gets." },
  { from: 36.51, to: 40.18, text: "You tell it what you sell, what you want, and what you can spend." },
  { from: 40.42, to: 42.63, text: "That's your part. That's the whole thing." },
  { from: 42.87, to: 48.11, text: "From there, it builds the strategy. Writes the creative. Recommends who to show it to." },
  { from: 48.37, to: 52.59, text: "It plans where every dollar goes, and shows you before anything runs." },
  { from: 53.7, to: 58.46, text: "Now — why AI? Because AI doesn't need a week to read your numbers." },
  { from: 58.7, to: 62.76, text: "It reads them in seconds. So you move faster, and you test more." },
  { from: 63.0, to: 65.75, text: "Your business already knows where it wants to go." },
  { from: 65.99, to: 68.07, text: "Give it the intelligence to get there." },
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
