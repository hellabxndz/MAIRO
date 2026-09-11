import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// The one place a creative picture is readable as a file.
//
// It exists because Instagram will not accept an upload for a feed post. It is
// handed a URL and goes and fetches the bytes itself, from its own servers —
// so the picture has to be reachable from the public internet, and MAIRO keeps
// creative images as data URLs in Postgres.
//
// Deliberately unauthenticated, which is worth being explicit about rather
// than leaving to be discovered:
//
// Instagram's fetcher carries no session and no token of ours, so anything
// gated behind a sign-in is invisible to it. What guards this instead is the
// id — a cuid nobody can guess or enumerate — and the fact that reaching one
// gets you a single picture and nothing else. No caption, no campaign, no
// business name, no way to list what else exists.
//
// And the picture is on its way to a public Instagram profile. The thing this
// route exposes is a thing the customer is in the middle of publishing.
//
// It stays narrow on purpose: final images only. A draft the customer has not
// chosen is not something to make fetchable, and restricting it here means a
// leaked id from an abandoned draft is not a live URL.

export const dynamic = "force-dynamic";

/** Read out of the data URL prefix, e.g. "data:image/png;base64,AAAA". */
function decodeDataUrl(value: string): { bytes: Buffer; contentType: string } | null {
  const match = /^data:([a-z0-9.+/-]+);base64,([\s\S]*)$/i.exec(value.trim());
  if (!match) return null;

  const [, contentType, base64] = match;
  // Only real image types are served. Without this the column decides the
  // Content-Type header, and a row holding "text/html" would make this route
  // serve markup from MAIRO's own origin.
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(contentType)) return null;

  try {
    return { bytes: Buffer.from(base64, "base64"), contentType };
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const { imageId } = await params;

  const image = await db.creativeImage.findFirst({
    // isFinal is part of the lookup rather than a check afterwards, so a draft
    // id simply does not resolve.
    where: { id: imageId, isFinal: true },
    select: { imageData: true },
  });
  if (!image) return new NextResponse("Not found", { status: 404 });

  const decoded = decodeDataUrl(image.imageData);
  if (!decoded) return new NextResponse("Not an image", { status: 415 });

  return new NextResponse(new Uint8Array(decoded.bytes), {
    headers: {
      "Content-Type": decoded.contentType,
      "Content-Length": String(decoded.bytes.length),
      // Instagram fetches once, but it can retry, and a CDN copy is cheaper
      // than reading a megabyte out of Postgres again. Immutable is honest
      // here: a final image is never edited in place, a new version is a new
      // row with a new id.
      "Cache-Control": "public, max-age=31536000, immutable",
      // Nothing about this response should ever be interpreted as markup.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
