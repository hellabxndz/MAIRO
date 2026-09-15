// Does the AI key actually work, rather than merely exist.
//
// The setup page used to answer this by testing whether the environment
// variable was a non-empty string, which is a different question with the same
// shape. A key that was revoked, mistyped, or belongs to an account that has
// run out of credit is present and useless, and every screen would report it
// green while nothing that needs a model worked at all.
//
// That gap is not theoretical here. It is exactly the state that leaves
// creative requests sitting at IN_REVIEW: the safety reviewer cannot be
// reached, so nothing is approved unchecked, and the only visible symptom is a
// queue building up somewhere nobody thinks to connect to a credential.
//
// So this asks. One token, the cheapest call the API takes, and it reports
// what came back.

export type KeyCheck =
  | { state: "not_set" }
  | { state: "ok"; model: string }
  /** The key was rejected. Wrong, revoked, or from another account. */
  | { state: "unauthorized"; detail: string }
  /** The key is valid but the account cannot pay for the call. */
  | { state: "no_credit"; detail: string }
  /** Valid, just being throttled right now — not a configuration problem. */
  | { state: "rate_limited" }
  /** The model name is wrong, so every call fails whatever the key is. */
  | { state: "no_such_model"; detail: string }
  /** Could not get an answer at all: network, DNS, a proxy in the way. */
  | { state: "unreachable"; detail: string };

/** Kept in step with agentModel in src/lib/ai/model.ts. */
const MODEL = "claude-sonnet-5";

export async function checkAnthropicKey(): Promise<KeyCheck> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return { state: "not_set" };

  let response: Response;
  try {
    response = await fetch(
      `${process.env.ANTHROPIC_BASE_URL?.trim() || "https://api.anthropic.com"}/v1/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        // One token. Enough to prove the key is accepted and the account can
        // be charged, cheap enough to run on every load of a page one person
        // opens.
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );
  } catch (error) {
    return {
      state: "unreachable",
      detail: error instanceof Error ? error.message : "No answer from the API.",
    };
  }

  if (response.ok) return { state: "ok", model: MODEL };
  if (response.status === 429) return { state: "rate_limited" };

  // The body carries the useful part. A 400 that says "credit balance is too
  // low" and a 400 that says the model does not exist are the same status code
  // and completely different problems, so the message is read, not guessed at
  // from the number.
  let detail = `HTTP ${response.status}`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body?.error?.message) detail = body.error.message;
  } catch {
    // A non-JSON error body is rare and not worth failing the check over.
  }

  const lower = detail.toLowerCase();
  if (response.status === 401 || response.status === 403 || lower.includes("invalid x-api-key")) {
    return { state: "unauthorized", detail };
  }
  if (lower.includes("credit") || lower.includes("billing") || lower.includes("quota")) {
    return { state: "no_credit", detail };
  }
  if (lower.includes("model")) {
    return { state: "no_such_model", detail };
  }
  return { state: "unreachable", detail };
}
