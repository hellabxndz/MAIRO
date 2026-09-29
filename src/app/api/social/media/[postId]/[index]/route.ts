import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { imageBytes } from "@/lib/instagram/library";
import { toInstagramJpeg } from "@/lib/instagram/jpeg";

// Where Instagram fetches a scheduled post's pictures from. Instagram only
// takes a public https address, only JPEG for feed pictures, and only
// 4:5–1.91:1 shapes — so each picture is converted here on the way out.
// Only pictures of approved posts are served, by the post's unguessable id.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ postId: string; index: string }> }) {
  const { postId, index } = await params;
  const i = Number.parseInt(index, 10);
  if (!Number.isInteger(i) || i < 0 || i > 9) return new NextResponse("Not found", { status: 404 });

  const post = await db.instagramPost.findUnique({ where: { id: postId }, select: { status: true, approvedAt: true, mediaRefs: true } });
  if (!post || !post.approvedAt || !["SCHEDULED", "CREATED", "PUBLISHED"].includes(post.status)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const ref = post.mediaRefs[i];
  const bytes = ref ? await imageBytes(ref) : null;
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  try {
    const jpeg = await toInstagramJpeg(bytes);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not an image", { status: 415 });
  }
}
