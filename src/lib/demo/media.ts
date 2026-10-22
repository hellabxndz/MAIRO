// Video files rendered from the product clips, the landing story and the
// walkthrough. Written by video/render.mjs after each render — it lists only
// files that exist, so a page can offer a video only when there is one. Edit
// by re-rendering, not by hand.

import type { ClipId } from "@/lib/demo/clip";

export type RenderedClip = { mp4: string; poster: string; width: number; height: number; ms: number; bytes: number; /** The file carries the recorded narration. */ audio?: boolean };
/** A product clip as rendered: its 16:9 and 9:16 files, its WebVTT captions, and the same captions as text for a transcript. */
export type ClipMedia = { wide?: RenderedClip; narrow?: RenderedClip; vtt: string; cues: { start: number; end: number; text: string }[] };
export type RenderedMedia = {
  renderedAt: string | null;
  clips?: Partial<Record<ClipId, ClipMedia>>;
  story: Partial<Record<"shop" | "service" | "appointments" | "brands", Partial<Record<"wide" | "narrow", RenderedClip>>>>;
  walkthrough: Partial<Record<"wide" | "narrow", RenderedClip>>;
  captions: { story?: string; walkthrough?: string };
};

export const RENDERED_MEDIA: RenderedMedia = {
  "renderedAt": "2026-10-22T19:09:47.873Z",
  "clips": {
    "film": {
      "vtt": "/demo/film.vtt",
      "cues": [
        {
          "start": 0,
          "end": 4500,
          "text": "Advertising your business shouldn't mean learning a complicated ad manager."
        },
        {
          "start": 4500,
          "end": 11300,
          "text": "Start with your website. MAIRO reads your public pages, and ticks each step only when it's done."
        },
        {
          "start": 11300,
          "end": 15500,
          "text": "It shows what it understood — facts kept apart from its suggestions."
        },
        {
          "start": 15500,
          "end": 24000,
          "text": "Your free plan: more online sales, with $1,000 a month divided across your campaign. A plan, not a forecast."
        },
        {
          "start": 24000,
          "end": 29400,
          "text": "Ad concepts are free, and every word is yours to change."
        },
        {
          "start": 29400,
          "end": 35600,
          "text": "With a subscription, MAIRO makes the finished picture — one credit, used only if it's made."
        },
        {
          "start": 35600,
          "end": 39200,
          "text": "Subscribe, and connect your own Meta ad account. Ad spend goes to Meta, separately."
        },
        {
          "start": 39200,
          "end": 43300,
          "text": "MAIRO builds the campaign as a draft, starting from your plan."
        },
        {
          "start": 43300,
          "end": 50200,
          "text": "Nothing runs until you approve it — and it's shown live only once Meta confirms."
        },
        {
          "start": 50200,
          "end": 56100,
          "text": "Your results in one place. Sample data shown."
        },
        {
          "start": 56100,
          "end": 66100,
          "text": "Your AI team recommends what's next, with the evidence — and waits for your yes."
        },
        {
          "start": 66100,
          "end": 74000,
          "text": "Your AI advertising team is ready. Build your free ad plan."
        }
      ],
      "wide": {
        "mp4": "/demo/film-wide.mp4",
        "poster": "/demo/film-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 74000,
        "bytes": 3824457
      },
      "narrow": {
        "mp4": "/demo/film-narrow.mp4",
        "poster": "/demo/film-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 74000,
        "bytes": 3064115
      }
    },
    "creative": {
      "vtt": "/demo/creative.vtt",
      "cues": [
        {
          "start": 0,
          "end": 4300,
          "text": "MAIRO suggests angles for your ads, built from what your business actually says."
        },
        {
          "start": 4300,
          "end": 7800,
          "text": "Every word is yours to change."
        },
        {
          "start": 7800,
          "end": 11600,
          "text": "With a subscription, MAIRO makes the finished picture — one credit, used only if it's made."
        },
        {
          "start": 11600,
          "end": 14500,
          "text": "Preview it where it will run: the Facebook and Instagram feeds."
        },
        {
          "start": 14500,
          "end": 17500,
          "text": "Nothing is used until you approve it."
        },
        {
          "start": 17500,
          "end": 22500,
          "text": "Ideas built around your brand, whatever you sell."
        }
      ],
      "wide": {
        "mp4": "/demo/creative-wide.mp4",
        "poster": "/demo/creative-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 22500,
        "bytes": 1299410
      },
      "narrow": {
        "mp4": "/demo/creative-narrow.mp4",
        "poster": "/demo/creative-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 22500,
        "bytes": 727329
      }
    },
    "understand": {
      "vtt": "/demo/understand.vtt",
      "cues": [
        {
          "start": 0,
          "end": 3500,
          "text": "MAIRO reads your public website pages — nothing private, nothing posted."
        },
        {
          "start": 3500,
          "end": 7000,
          "text": "Each step is ticked only when its work is really done."
        },
        {
          "start": 7000,
          "end": 11600,
          "text": "Then it shows what it understood, and where each fact came from."
        },
        {
          "start": 11600,
          "end": 17000,
          "text": "Its own ideas are labelled as suggestions — never presented as facts about you."
        }
      ],
      "wide": {
        "mp4": "/demo/understand-wide.mp4",
        "poster": "/demo/understand-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 17000,
        "bytes": 823177
      },
      "narrow": {
        "mp4": "/demo/understand-narrow.mp4",
        "poster": "/demo/understand-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 17000,
        "bytes": 675160
      }
    },
    "campaign": {
      "vtt": "/demo/campaign.vtt",
      "cues": [
        {
          "start": 0,
          "end": 3800,
          "text": "With a subscription, connect your own Meta ad account. Ad spend is paid to Meta, separately."
        },
        {
          "start": 3800,
          "end": 8000,
          "text": "The campaign builder starts from your plan: a Sales campaign, sending people to your shop."
        },
        {
          "start": 8000,
          "end": 11800,
          "text": "MAIRO suggests who to reach, and Meta refines it as results come in."
        },
        {
          "start": 11800,
          "end": 15800,
          "text": "You set the budget. Meta charges it to your own ad account."
        },
        {
          "start": 15800,
          "end": 19600,
          "text": "Your approved creative, previewed where it will run."
        },
        {
          "start": 19600,
          "end": 23000,
          "text": "Nothing runs until you agree to the spend and approve it."
        },
        {
          "start": 23000,
          "end": 26500,
          "text": "And it's shown as live only once Meta confirms it."
        }
      ],
      "wide": {
        "mp4": "/demo/campaign-wide.mp4",
        "poster": "/demo/campaign-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 26500,
        "bytes": 1240694
      },
      "narrow": {
        "mp4": "/demo/campaign-narrow.mp4",
        "poster": "/demo/campaign-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 26500,
        "bytes": 1146334
      }
    },
    "team": {
      "vtt": "/demo/team.vtt",
      "cues": [
        {
          "start": 0,
          "end": 3300,
          "text": "Eight AI specialties of one system, each with one job."
        },
        {
          "start": 3300,
          "end": 7300,
          "text": "Every morning they review your results — and every step is on record."
        },
        {
          "start": 7300,
          "end": 12400,
          "text": "When something is worth trying, they prepare it and check it against your limits."
        },
        {
          "start": 12400,
          "end": 15200,
          "text": "Then it waits for your approval."
        },
        {
          "start": 15200,
          "end": 18500,
          "text": "When there's nothing to do, they say so. No pretend activity."
        }
      ],
      "wide": {
        "mp4": "/demo/team-wide.mp4",
        "poster": "/demo/team-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 18500,
        "bytes": 917764
      },
      "narrow": {
        "mp4": "/demo/team-narrow.mp4",
        "poster": "/demo/team-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 18500,
        "bytes": 644082
      }
    },
    "dashboard": {
      "vtt": "/demo/dashboard.vtt",
      "cues": [
        {
          "start": 0,
          "end": 3200,
          "text": "Your business at a glance: what you spent, and what came back."
        },
        {
          "start": 3200,
          "end": 6000,
          "text": "Every campaign, with the status Meta reports."
        },
        {
          "start": 6000,
          "end": 8800,
          "text": "Your ads, from AI recommendation to running."
        },
        {
          "start": 8800,
          "end": 11600,
          "text": "Performance over time — and where every figure comes from."
        },
        {
          "start": 11600,
          "end": 14400,
          "text": "Your AI team, and what each specialty has really done."
        },
        {
          "start": 14400,
          "end": 17200,
          "text": "Recommendations, each with its reason."
        },
        {
          "start": 17200,
          "end": 20000,
          "text": "Approvals: nothing changes in your ad account until you say so."
        },
        {
          "start": 20000,
          "end": 23500,
          "text": "And your results, from Meta's figures to your store's orders. Sample data throughout."
        }
      ],
      "wide": {
        "mp4": "/demo/dashboard-wide.mp4",
        "poster": "/demo/dashboard-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 23500,
        "bytes": 761861
      },
      "narrow": {
        "mp4": "/demo/dashboard-narrow.mp4",
        "poster": "/demo/dashboard-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 23500,
        "bytes": 690646
      }
    },
    "optimize": {
      "vtt": "/demo/optimize.vtt",
      "cues": [
        {
          "start": 0,
          "end": 5600,
          "text": "MAIRO reads your results every day — what Meta reports, and the orders you confirm."
        },
        {
          "start": 5600,
          "end": 10000,
          "text": "When something is worth testing, it says what it noticed and why."
        },
        {
          "start": 10000,
          "end": 14200,
          "text": "With the evidence, the effect on your budget, and the risk."
        },
        {
          "start": 14200,
          "end": 17000,
          "text": "You decide. Approved — and nothing about your spend changed."
        },
        {
          "start": 17000,
          "end": 21700,
          "text": "Small, reversible changes can run on their own only if you allow it. The big ones always wait for you."
        }
      ],
      "wide": {
        "mp4": "/demo/optimize-wide.mp4",
        "poster": "/demo/optimize-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 21700,
        "bytes": 722604
      },
      "narrow": {
        "mp4": "/demo/optimize-narrow.mp4",
        "poster": "/demo/optimize-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 21700,
        "bytes": 479595
      }
    },
    "results": {
      "vtt": "/demo/results.vtt",
      "cues": [
        {
          "start": 0,
          "end": 3400,
          "text": "What your ads cost, and what they brought back."
        },
        {
          "start": 3400,
          "end": 6600,
          "text": "Every figure says where it came from: Meta, or your own store."
        },
        {
          "start": 6600,
          "end": 10800,
          "text": "A weekly summary in plain words — and what MAIRO suggests next."
        },
        {
          "start": 10800,
          "end": 17500,
          "text": "For a service business, results follow leads to booked jobs — the ones you mark. Sample data throughout."
        }
      ],
      "wide": {
        "mp4": "/demo/results-wide.mp4",
        "poster": "/demo/results-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 17500,
        "bytes": 495188
      },
      "narrow": {
        "mp4": "/demo/results-narrow.mp4",
        "poster": "/demo/results-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 17500,
        "bytes": 396396
      }
    },
    "plan": {
      "vtt": "/demo/plan.vtt",
      "cues": [
        {
          "start": 0,
          "end": 4200,
          "text": "From what it understood, MAIRO plans your first Meta campaign: the objective, who to reach, and where."
        },
        {
          "start": 4200,
          "end": 8600,
          "text": "It says what the ads should say and how the campaign is structured — each with its reason."
        },
        {
          "start": 8600,
          "end": 12800,
          "text": "Your monthly budget, divided for your goal — paid to Meta from your own ad account."
        },
        {
          "start": 12800,
          "end": 16500,
          "text": "A recommendation, not a forecast. Nothing is spent until you approve a campaign."
        }
      ],
      "wide": {
        "mp4": "/demo/plan-wide.mp4",
        "poster": "/demo/plan-wide-poster.webp",
        "width": 1440,
        "height": 810,
        "ms": 16500,
        "bytes": 704327
      },
      "narrow": {
        "mp4": "/demo/plan-narrow.mp4",
        "poster": "/demo/plan-narrow-poster.webp",
        "width": 540,
        "height": 960,
        "ms": 16500,
        "bytes": 630050
      }
    }
  },
  "story": {
    "shop": {
      "wide": {
        "mp4": "/walkthrough/story-shop-wide.mp4",
        "poster": "/walkthrough/story-shop-wide-poster.webp",
        "width": 1520,
        "height": 1120,
        "ms": 24000,
        "bytes": 1147863
      },
      "narrow": {
        "mp4": "/walkthrough/story-shop-narrow.mp4",
        "poster": "/walkthrough/story-shop-narrow-poster.webp",
        "width": 720,
        "height": 1200,
        "ms": 24000,
        "bytes": 812201
      }
    },
    "service": {
      "wide": {
        "mp4": "/walkthrough/story-service-wide.mp4",
        "poster": "/walkthrough/story-service-wide-poster.webp",
        "width": 1520,
        "height": 1120,
        "ms": 24000,
        "bytes": 1196800
      },
      "narrow": {
        "mp4": "/walkthrough/story-service-narrow.mp4",
        "poster": "/walkthrough/story-service-narrow-poster.webp",
        "width": 720,
        "height": 1200,
        "ms": 24000,
        "bytes": 822086
      }
    },
    "brands": {
      "wide": {
        "mp4": "/walkthrough/story-brands-wide.mp4",
        "poster": "/walkthrough/story-brands-wide-poster.webp",
        "width": 1520,
        "height": 1120,
        "ms": 24000,
        "bytes": 1185932
      },
      "narrow": {
        "mp4": "/walkthrough/story-brands-narrow.mp4",
        "poster": "/walkthrough/story-brands-narrow-poster.webp",
        "width": 720,
        "height": 1200,
        "ms": 24000,
        "bytes": 829401
      }
    }
  },
  "walkthrough": {
    "wide": {
      "mp4": "/walkthrough/walkthrough-wide.mp4",
      "poster": "/walkthrough/walkthrough-wide-poster.webp",
      "width": 1920,
      "height": 1080,
      "ms": 73000,
      "bytes": 7614940
    },
    "narrow": {
      "mp4": "/walkthrough/walkthrough-narrow.mp4",
      "poster": "/walkthrough/walkthrough-narrow-poster.webp",
      "width": 720,
      "height": 1280,
      "ms": 73000,
      "bytes": 4864151
    }
  },
  "captions": {
    "story": "/walkthrough/story.vtt",
    "walkthrough": "/walkthrough/walkthrough.vtt"
  }
};
