import { describe, expect, it } from "vitest";
import { advance, COMPLETED_STEP, resolveStep, TOTAL_STEPS } from "./steps";

describe("onboarding progress", () => {
  it("has the eight steps", () => expect(TOTAL_STEPS).toBe(8));

  it("resumes at the saved step", () => {
    expect(resolveStep(4, undefined)).toBe(4);
    expect(resolveStep(COMPLETED_STEP, undefined)).toBe(8);
  });

  it("lets users revisit earlier steps but never skip ahead", () => {
    expect(resolveStep(5, "2")).toBe(2);
    expect(resolveStep(5, "7")).toBe(5);
    expect(resolveStep(5, "-1")).toBe(5);
    expect(resolveStep(5, "abc")).toBe(5);
    expect(resolveStep(0, undefined)).toBe(1);
  });

  it("never moves progress backwards", () => {
    expect(advance(5, 2)).toBe(5);
    expect(advance(3, 3)).toBe(4);
    expect(advance(8, 8)).toBe(COMPLETED_STEP);
    expect(advance(COMPLETED_STEP, 1)).toBe(COMPLETED_STEP);
  });
});
