// What a dashboard screen looks like while it is being read.
//
// Every page here is rendered on the server from live data — the database,
// and for results, Meta's API — and before these existed a click showed
// nothing at all until all of that had come back. The sidebar sat still, the
// old page stayed on screen, and a second felt like the click hadn't
// registered. These are the loading.tsx fallbacks: shown the instant a link is
// clicked (Next prefetches them), replaced the moment the real page arrives.
//
// Shapes, not words. A skeleton that says "Loading your campaigns…" is one
// more thing to read; one shaped like the page it is about to become is
// something the eye has already settled on by the time the content lands.
// Pulses only for people who haven't asked for less motion.

type Variant = "overview" | "list" | "detail" | "grid" | "form";

const bar = "rounded-md bg-white/[0.06] motion-safe:animate-pulse";

function Panel({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={`rounded-[var(--radius-panel)] border p-6 ${className}`}
      style={{ backgroundImage: "var(--mairo-glass)", borderColor: "var(--mairo-line)" }}
    >
      {children}
    </div>
  );
}

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="space-y-2.5">
      {widths.map((w, i) => (
        <div key={i} className={`h-3 ${bar}`} style={{ width: w }} />
      ))}
    </div>
  );
}

function Header() {
  return (
    <div className="mb-8">
      <div className={`h-7 w-56 ${bar}`} />
      <div className={`mt-3 h-3.5 w-80 max-w-full ${bar}`} />
    </div>
  );
}

export function PageSkeleton({ variant = "list" }: { variant?: Variant }) {
  return (
    <div role="status" aria-label="Loading" data-page-skeleton>
      <Header />
      {variant === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="lg:col-span-2">
            <Lines widths={["30%", "60%", "45%"]} />
          </Panel>
          {[0, 1, 2, 3].map((i) => (
            <Panel key={i}>
              <Lines widths={["40%", "85%", "70%", "55%"]} />
            </Panel>
          ))}
        </div>
      )}
      {variant === "list" && (
        <Panel>
          <div className={`mb-6 h-8 w-64 max-w-full ${bar}`} />
          <div className="space-y-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={`h-10 w-10 shrink-0 rounded-xl ${bar}`} />
                <div className="flex-1">
                  <Lines widths={["45%", "70%"]} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {variant === "detail" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Panel key={i}>
                <Lines widths={["50%", "80%"]} />
              </Panel>
            ))}
          </div>
          <Panel>
            <div className={`h-48 w-full ${bar}`} />
          </Panel>
          <Panel>
            <Lines widths={["35%", "90%", "75%", "60%"]} />
          </Panel>
        </div>
      )}
      {variant === "grid" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Panel key={i} className="!p-3">
              <div className={`aspect-[4/5] w-full rounded-xl ${bar}`} />
              <div className={`mt-3 h-3 w-2/3 ${bar}`} />
            </Panel>
          ))}
        </div>
      )}
      {variant === "form" && (
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <Panel key={i}>
              <div className={`mb-5 h-4 w-40 ${bar}`} />
              <div className="space-y-4">
                <div className={`h-10 w-full rounded-xl ${bar}`} />
                <div className={`h-10 w-full rounded-xl ${bar}`} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

/** A part of a page still being read, under a header that has already arrived. */
export function SectionSkeleton({ panels = 2 }: { panels?: number }) {
  return (
    <div role="status" aria-label="Loading" className="mt-6 space-y-5">
      {Array.from({ length: panels }, (_, i) => (
        <Panel key={i}>
          <Lines widths={["35%", "80%", "65%"]} />
        </Panel>
      ))}
    </div>
  );
}
