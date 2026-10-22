"use client";

import { createRef } from "react";
import { PlanView } from "@/components/preview/plan-view";
import { DemoContext, SampleLabel } from "@/components/console/kit";
import { ScaledFrame } from "@/components/console/demo";
import { buildPreview } from "@/lib/preview/build";
import { exampleFacts } from "@/lib/preview/example";
import { EXAMPLES, type ExampleType } from "@/lib/demo/examples";

// The free plan MAIRO builds for this kind of business, drawn by the plan's
// own component — run on one of the invented example businesses, inert, and
// labelled as an example. The top of it; the whole plan is one click away.

const HEADING = createRef<HTMLHeadingElement>();
const noop = () => {};

export function ExamplePlan({ example }: { example: Exclude<ExampleType, "brands"> }) {
  const facts = exampleFacts(example);
  const preview = buildPreview(facts);
  if (!preview) return null;
  const ex = EXAMPLES[example];
  return (
    <div role="img" aria-label={`Example: the free plan MAIRO builds for ${ex.name}, a fictional ${ex.label.toLowerCase()}. Sample data.`} className="relative rounded-[24px] border border-[color:var(--mairo-line)] bg-[#121212] p-4 sm:p-6">
      <div className="mb-4">
        <SampleLabel>Example · {ex.name} is a fictional business · sample plan</SampleLabel>
      </div>
      <DemoContext.Provider value={true}>
        <div inert>
          <ScaledFrame width={1100} minScale={0.62} minWidth={560} maxHeight={1150}>
            <PlanView preview={preview} facts={facts} findings={[]} isExample exampleType={example} headingRef={HEADING} onEdit={noop} onRefine={noop} onSave={noop} onStartOver={noop} signUpHref="/sign-up" />
          </ScaledFrame>
        </div>
      </DemoContext.Provider>
    </div>
  );
}
