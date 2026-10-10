import { metaGraphRequest } from "@/lib/meta/client";

// The Page's own access token, for the calls Meta only answers when asked as
// the Page: reading its posts (/{page}/published_posts) and creating an
// instant form on it (/{page}/leadgen_forms). Asked with the person's token
// instead, Meta refuses with code 210, "A page access token is required".
//
// Meta hands it over in exchange for the person's token, when that person
// manages the Page and picked it when they connected. Fetched on demand rather
// than stored: it inherits the person's token's lifetime, so storing it would
// mean a second token to encrypt, expire and refresh for no gain.

export type PageToken = { ok: true; token: string } | { ok: false; error: string };

export const PAGE_TOKEN_REFUSED =
  "Facebook didn't let MAIRO act as your Page. Check that you manage the Page and that it was ticked when you connected Meta, then connect again.";

export async function pageAccessToken(pageId: string, userToken: string): Promise<PageToken> {
  try {
    const res = await metaGraphRequest<{ access_token?: string }>(`/${pageId}`, {
      accessToken: userToken,
      params: { fields: "access_token" },
    });
    return res.access_token ? { ok: true, token: res.access_token } : { ok: false, error: PAGE_TOKEN_REFUSED };
  } catch {
    return { ok: false, error: PAGE_TOKEN_REFUSED };
  }
}
