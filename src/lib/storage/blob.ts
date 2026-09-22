import { put, del } from "@vercel/blob";

// Where a generated or uploaded image actually lives.
//
// Every picture in the app before this — CreativeRequest.referenceImage,
// CreativeImage.imageData — is a base64 data URL sitting in a Postgres text
// column, because there was nothing else configured yet. That was flagged as
// a stopgap where it was written and it is exactly right for a handful of
// small images; it stops being right at Creative Studio volume, where one
// business can produce dozens of full-resolution images a month and every one
// of them would otherwise inflate the database's own backup and replication
// traffic forever.
//
// Vercel Blob rather than S3 or GCS: this deployment already assumes Vercel
// (see src/lib/site.ts reading VERCEL_PROJECT_PRODUCTION_URL), it needs
// exactly one credential, and `put`/`del` are the entire API surface this
// module needs. If a future deployment target needs a different backend, this
// file is the one place that has to change — nothing above it knows blob
// storage exists, only that it gets a URL back.

export function storageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export type StoredImage = {
  url: string;
  /** Bytes, for logging and for the credit/cost math — never shown to a customer. */
  size: number;
  contentType: string;
};

/**
 * Saves image bytes and returns the URL they now live at.
 *
 * `pathname` should already be namespaced by organization — see the callers
 * in creative-studio/pipeline.ts — because Vercel Blob URLs are guessable
 * (there is no per-object ACL) and an unguessable path is the only thing
 * standing between one business's ad creative and another's.
 */
export async function storeImage(
  pathname: string,
  bytes: Buffer,
  contentType: string,
): Promise<StoredImage> {
  if (!storageConfigured()) {
    throw new Error(
      "Image storage isn't configured on this deployment. Add BLOB_READ_WRITE_TOKEN in your hosting environment variables and redeploy.",
    );
  }

  const result = await put(pathname, bytes, {
    access: "public",
    contentType,
    // Vercel Blob refuses a second write to the same pathname unless told
    // this is expected. Every pathname this module writes already carries a
    // cuid, so a collision would mean a real bug, not a legitimate re-save —
    // surfacing it as an error is more useful than silently overwriting.
    addRandomSuffix: false,
  });

  return { url: result.url, size: bytes.byteLength, contentType };
}

/**
 * Deletes a stored image. Failures are swallowed and logged rather than
 * thrown — an orphaned blob costs pennies of storage a month; a database row
 * that fails to delete because its image couldn't be removed first would cost
 * a customer their whole library.
 */
export async function deleteImage(url: string): Promise<void> {
  if (!storageConfigured()) return;
  try {
    await del(url);
  } catch (error) {
    console.error("Blob delete failed (orphaned, non-fatal):", url, error);
  }
}

/** A base64 payload (as the OpenAI Images API returns) into storage. */
export async function storeBase64Image(
  pathname: string,
  base64: string,
  contentType = "image/png",
): Promise<StoredImage> {
  return storeImage(pathname, Buffer.from(base64, "base64"), contentType);
}

/** Fetches a stored (or any https) image's bytes back, for edits and cropping. */
export async function fetchImageBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Couldn't read that image (HTTP ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
