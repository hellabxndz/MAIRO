import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  decideGoogleSignIn,
  decodeGoogleIntent,
  encodeGoogleIntent,
  type GoogleIntent,
  type GoogleProfileFacts,
} from "@/lib/google-sign-in-rules";

// The database side of "Continue with Google". The rules live in
// google-sign-in-rules.ts; this file only looks users up and carries out what
// those rules decide.

/** Both halves of the Google OAuth client, or the button stays hidden and the provider unregistered. */
export function googleSignInEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim());
}

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  if (!googleSignInEnabled()) return null;
  return {
    clientId: process.env.AUTH_GOOGLE_ID!.trim(),
    clientSecret: process.env.AUTH_GOOGLE_SECRET!.trim(),
  };
}

/**
 * Which button started the login. A cookie because the Google round trip
 * carries nothing of ours back except what Auth.js puts in `state`; ten
 * minutes is ample for someone to get through Google's screens.
 */
const INTENT_COOKIE = "mairo_google_intent";

export async function rememberGoogleIntent(intent: GoogleIntent): Promise<void> {
  const jar = await cookies();
  jar.set(INTENT_COOKIE, encodeGoogleIntent(intent), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
}

/** Reads and clears the intent cookie. Only callable inside a request. */
export async function takeGoogleIntent(): Promise<GoogleIntent | null> {
  const jar = await cookies();
  const intent = decodeGoogleIntent(jar.get(INTENT_COOKIE)?.value);
  jar.delete(INTENT_COOKIE);
  return intent;
}

export type GoogleSignInResult = { ok: true; userId: string } | { ok: false; redirectTo: string };

const USER_MATCH = { id: true, googleId: true } as const;

async function lookUp(sub: string, email: string) {
  const [byGoogleId, byEmail] = await Promise.all([
    sub ? db.user.findUnique({ where: { googleId: sub }, select: USER_MATCH }) : null,
    email
      ? db.user.findMany({
          where: { email: { equals: email, mode: "insensitive" } },
          select: USER_MATCH,
          take: 2,
        })
      : [],
  ]);
  return { byGoogleId, byEmail };
}

/**
 * Finds, links or creates the MAIRO user for a Google login. Called from the
 * signIn callback, so it runs before any session exists: a refusal here means
 * nothing is signed in and the person lands back on a page that says why.
 */
export async function resolveGoogleSignIn(
  profile: GoogleProfileFacts,
  intent: GoogleIntent | null,
): Promise<GoogleSignInResult> {
  const sub = profile.sub?.trim() ?? "";
  const email = profile.email?.trim() ?? "";

  // Twice at most: a create can lose a race to a simultaneous login for the
  // same address, and the second pass then finds the row that won.
  for (let attempt = 0; attempt < 2; attempt++) {
    const decision = decideGoogleSignIn({ profile, ...(await lookUp(sub, email)), intent });

    switch (decision.kind) {
      case "sign-in":
        return { ok: true, userId: decision.userId };

      case "refuse":
        return { ok: false, redirectTo: `${decision.page}?error=${decision.error}` };

      case "link": {
        // Conditional on still being unlinked, so two logins racing to link
        // one account to two Google accounts can't both win.
        const { count } = await db.user.updateMany({
          where: { id: decision.userId, googleId: null },
          data: { googleId: decision.googleId },
        });
        if (count === 1) return { ok: true, userId: decision.userId };
        continue;
      }

      case "create":
        try {
          const user = await db.$transaction(async (tx) => {
            const organization = await tx.organization.create({
              data: { name: decision.orgName, kind: decision.orgKind },
            });
            return tx.user.create({
              data: {
                email: decision.email,
                name: decision.name,
                googleId: decision.googleId,
                role: decision.role,
                organizationId: organization.id,
              },
              select: { id: true },
            });
          });
          return { ok: true, userId: user.id };
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
          throw error;
        }
    }
  }
  return { ok: false, redirectTo: "/sign-in?error=GoogleAccountConflict" };
}

/** What the session token needs about the user a Google login resolved to. */
export async function sessionFactsForGoogle(googleId: string) {
  return db.user.findUnique({
    where: { googleId },
    select: { id: true, email: true, name: true, role: true, organizationId: true },
  });
}
