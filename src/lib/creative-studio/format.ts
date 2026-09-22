import sharp from "sharp";
import type { CreativeFormat } from "@/generated/prisma/enums";
import { FORMAT_RATIO } from "@/lib/creative-studio/format-info";

// Turning what the model can actually produce into the shape an ad needs.
//
// This is the sharp-dependent half of what used to be one file; see
// format-info.ts for the client-safe names and ratios every component
// actually needs — nothing that runs in a browser should import this one.
// There is no explicit guard against a client component pulling this back in
// by mistake (this codebase does not use the `server-only` package anywhere
// else, and adding it here alone also breaks every check script's plain
// `tsx` execution, which is not sandboxed the way Next's bundler is). The
// discipline that actually prevents it: every component that only needs a
// name or a ratio imports format-info.ts, never this file.
//
// gpt-image models generate three canvases: square, and two tall/wide 2:3
// rectangles. None of those is exactly 4:5, 9:16 or 16:9 — the shapes
// advertising placements actually use — and the wrong response to that gap is
// either of the two things this module refuses to do: stretch the native
// output to fit (distorts the product — the one thing the truth rule in
// openai-image.ts exists to protect) or ask the model for a size it does not
// support (fails outright). The right response, and the only one this module
// implements, is to generate the native canvas whose ratio is closest without
// being narrower than the target in the dimension that matters, then crop.
//
// Cropping is centred and never upscales. A 1024×1536 generation cropped to
// 9:16 loses a little off each side and keeps every pixel the model actually
// drew; nothing here invents detail that was not there.

export type CroppedImage = { bytes: Buffer; width: number; height: number };

/**
 * Centre-crops raw model output down to a format's exact ratio. Never
 * upscales — the crop only ever removes pixels from the longer dimension.
 */
export async function cropToFormat(raw: Buffer, format: CreativeFormat): Promise<CroppedImage> {
  const image = sharp(raw);
  const meta = await image.metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) {
    throw new Error("That image couldn't be read to resize it.");
  }

  const targetRatio = FORMAT_RATIO[format];
  const currentRatio = width / height;

  let cropWidth = width;
  let cropHeight = height;

  // Wider than the target: crop the sides in.
  if (currentRatio > targetRatio) {
    cropWidth = Math.round(height * targetRatio);
  } else if (currentRatio < targetRatio) {
    // Taller than the target: crop the top and bottom in.
    cropHeight = Math.round(width / targetRatio);
  }

  const left = Math.max(0, Math.round((width - cropWidth) / 2));
  const top = Math.max(0, Math.round((height - cropHeight) / 2));

  const cropped = await image
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  const finalMeta = await sharp(cropped).metadata();
  return {
    bytes: cropped,
    width: finalMeta.width ?? cropWidth,
    height: finalMeta.height ?? cropHeight,
  };
}

/** A quick, low-cost square thumbnail for grid views — the library and the variations grid. */
export async function thumbnail(raw: Buffer, edge = 320): Promise<Buffer> {
  return sharp(raw)
    .resize(edge, edge, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
}
