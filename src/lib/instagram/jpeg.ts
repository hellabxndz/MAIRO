import sharp from "sharp";
import { feedCanvas } from "./social-logic";

/**
 * A picture as Instagram's feed accepts it: JPEG, 4:5 to 1.91:1, at most
 * 1440px wide. Nothing is cropped — a picture outside that range is centred
 * on a dark canvas of the nearest allowed shape.
 */
export async function toInstagramJpeg(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const c = feedCanvas(meta.width ?? 1080, meta.height ?? 1080);
  const resized = await image.resize(c.imageWidth, c.imageHeight, { fit: "fill" }).toBuffer();
  const padX = c.width - c.imageWidth;
  const padY = c.height - c.imageHeight;
  return sharp(resized)
    .extend({
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      background: { r: 11, g: 12, b: 20 },
    })
    .flatten({ background: { r: 11, g: 12, b: 20 } })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
