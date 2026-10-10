import { LEGAL } from "@/lib/legal";
import { absoluteUrl } from "@/lib/site";

// security.txt (RFC 9116): where to report a security problem with this site.
// Scanners and the security companies that rate new domains look for it, and
// it's the honest answer to "who runs this?". The contact is the same address
// the legal pages use, so it follows NEXT_PUBLIC_SUPPORT_EMAIL.

export const dynamic = "force-dynamic";

export function GET() {
  // RFC 9116 asks for an expiry under a year away; renewed on every request.
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:${LEGAL.contactEmail}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    `Canonical: ${absoluteUrl("/.well-known/security.txt")}`,
    `Policy: ${absoluteUrl("/privacy")}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
