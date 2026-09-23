import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { storageConfigured } from "@/lib/storage/blob";
import { MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/campaigns/media-rules";

// Hands the browser a short-lived token to upload an ad video (and its
// thumbnail) straight to storage. A video is far too large to pass through a
// server action, so the bytes go browser → storage, and this route only
// decides whether that's allowed: signed in, the right kind of file, under the
// size limit, and only into this business's own folder.

export async function POST(request: Request): Promise<NextResponse> {
  if (!storageConfigured()) {
    return NextResponse.json({ error: "Uploads aren't switched on for this deployment yet." }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`ad-media/${organizationId}/`) || pathname.includes("..")) {
          throw new Error("That upload location isn't allowed.");
        }
        return {
          allowedContentTypes: [...VIDEO_TYPES, "image/jpeg"],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 30 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload refused." },
      { status: 400 },
    );
  }
}
