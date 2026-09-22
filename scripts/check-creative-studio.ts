// Checks the parts of AI Creative Studio that do not need a database or a
// live OpenAI key — the format-cropping math, the preset prompt builder, and
// the model configuration — which is deliberately most of what can go subtly
// wrong here without ever throwing.
//
// Two things matter most and get the most attention:
//
//   Cropping never invents pixels. A crop that came out larger than what went
//   in, or that stopped landing on the exact target ratio, would be this
//   module quietly doing the thing its own comments say it refuses to do —
//   stretching or distorting a customer's product photo.
//
//   A preset never speaks for a blank prompt, and a custom prompt is never
//   silently dropped. Presets fold into the customer's own words; they do not
//   replace them, and CUSTOM must produce nothing but whatever the customer
//   actually typed.
//
// Run with: npm run check:creative-studio

import sharp from "sharp";
import { FORMAT_RATIO, FORMAT_LABEL, nativeSizeFor } from "@/lib/creative-studio/format-info";
import { cropToFormat } from "@/lib/creative-studio/format";
import { buildPrompt, presetInfo, PRESETS } from "@/lib/creative-studio/presets";
import { currentImageModel } from "@/lib/ai/openai-image";
import type { CreativeFormat } from "@/generated/prisma/enums";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) {
    failures++;
    console.log(`  FAIL  ${name} ${extra}`);
  } else console.log(`  ok    ${name}`);
}

const FORMATS: CreativeFormat[] = ["SQUARE", "PORTRAIT", "STORY", "LANDSCAPE"];

console.log("\n— every format has a ratio and a label —");
check("all four formats have a ratio", FORMATS.every((f) => typeof FORMAT_RATIO[f] === "number"));
check("all four formats have a label", FORMATS.every((f) => FORMAT_LABEL[f]?.name && FORMAT_LABEL[f]?.ratio));
check("square is exactly 1:1", FORMAT_RATIO.SQUARE === 1);
check("story is taller than portrait", FORMAT_RATIO.STORY < FORMAT_RATIO.PORTRAIT);
check("landscape is the only ratio above 1", FORMAT_RATIO.LANDSCAPE > 1 && FORMATS.filter((f) => FORMAT_RATIO[f] > 1).length === 1);

console.log("\n— the chosen native canvas matches what's documented —");
// cropToFormat can reach any target ratio from any native canvas by cropping
// exactly one axis — it never NEEDS a particular native size to avoid
// upscaling (see the crop tests below, which exercise this directly).
// nativeSizeFor exists for a quality reason instead: pick the native canvas
// that wastes the least of what the model drew, and that choice is worth
// pinning to the exact values this module documents, so a typo here is
// caught even though the app would keep working with a less efficient one.
check("square uses the square canvas, no crop needed", nativeSizeFor("SQUARE") === "1024x1024");
check("portrait uses the tall canvas", nativeSizeFor("PORTRAIT") === "1024x1536");
check("story uses the same tall canvas as portrait", nativeSizeFor("STORY") === "1024x1536");
check("landscape uses the wide canvas", nativeSizeFor("LANDSCAPE") === "1536x1024");

console.log("\n— cropping hits the exact ratio and never upscales —");
async function testCrop(nativeW: number, nativeH: number, format: CreativeFormat) {
  const raw = await sharp({
    create: { width: nativeW, height: nativeH, channels: 3, background: { r: 100, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
  const result = await cropToFormat(raw, format);
  const resultRatio = result.width / result.height;
  const target = FORMAT_RATIO[format];
  check(
    `${format}: crop lands on ${target.toFixed(3)}`,
    Math.abs(resultRatio - target) < 0.01,
    `got ${resultRatio.toFixed(3)} (${result.width}x${result.height})`,
  );
  check(`${format}: never wider than the source`, result.width <= nativeW);
  check(`${format}: never taller than the source`, result.height <= nativeH);
}

async function main() {
  await testCrop(1024, 1024, "SQUARE");
  await testCrop(1024, 1536, "PORTRAIT");
  await testCrop(1024, 1536, "STORY");
  await testCrop(1536, 1024, "LANDSCAPE");
  // Cropping a canvas to its OWN ratio should return it unchanged in size —
  // the "no crop needed" case must not shave pixels off for no reason.
  const square = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  const noCrop = await cropToFormat(square, "SQUARE");
  check("cropping to your own ratio changes nothing", noCrop.width === 1024 && noCrop.height === 1024);

  console.log("\n— presets fold in, they never speak alone —");
  check("every preset has a direction, except CUSTOM", PRESETS.filter((p) => p.key !== "CUSTOM").every((p) => p.direction.trim().length > 0));
  check("CUSTOM has no direction of its own", presetInfo("CUSTOM").direction === "");
  check("no preset's direction is the empty string by accident", PRESETS.filter((p) => p.key !== "CUSTOM").every((p) => p.direction.length > 20));

  const custom = buildPrompt(null, "a red sports car");
  check("no preset: the prompt is exactly the customer's words", custom === "a red sports car");

  const presetOnly = buildPrompt("LUXURY_STUDIO", "");
  check("a preset with no custom text is just the preset's direction", presetOnly === presetInfo("LUXURY_STUDIO").direction);

  const combined = buildPrompt("STREETWEAR", "a black hoodie");
  check("combining a preset and words keeps both", combined.includes(presetInfo("STREETWEAR").direction) && combined.includes("a black hoodie"));
  check("the customer's own words are marked as specific instructions, not blended in unlabeled", /Specifically:/.test(combined));

  check("an unknown preset key falls back to CUSTOM rather than throwing", presetInfo("NOT_A_REAL_PRESET" as never).key === "CUSTOM");
  check("every preset in the list is reachable by its own key", PRESETS.every((p) => presetInfo(p.key).key === p.key));

  console.log("\n— the model is configurable, not hard-coded to a deprecating one —");
  check(
    "the default model is not gpt-image-1, which deprecates 23 Oct 2026",
    currentImageModel() !== "gpt-image-1",
    currentImageModel(),
  );
  check("a model name was actually chosen, not left blank", currentImageModel().trim().length > 0);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
