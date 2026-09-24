import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import {
  googleCredentials,
  resolveGoogleSignIn,
  sessionFactsForGoogle,
  takeGoogleIntent,
} from "@/lib/google-sign-in";

// Google is registered only when both halves of its OAuth client are set, so
// a deployment without them has no Google route at all rather than one that
// fails at Google's end. The sign-in pages check the same thing before
// showing the button.
const google = googleCredentials();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        // Someone who signed up with Google has no password, and must not be
        // let in by one. Refused before bcrypt ever sees an empty hash.
        if (!user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
    ...(google ? [Google({ clientId: google.clientId, clientSecret: google.clientSecret })] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Runs before any session exists. For Google this is where the MAIRO user
    // is found, linked or created; a string sends the person back to a page
    // that explains the refusal, and nothing is signed in.
    signIn: async ({ account, profile }) => {
      if (account?.provider !== "google") return true;
      const result = await resolveGoogleSignIn(
        {
          sub: account.providerAccountId,
          email: profile?.email,
          emailVerified: profile?.email_verified,
          name: profile?.name,
        },
        await takeGoogleIntent(),
      );
      return result.ok ? true : result.redirectTo;
    },
    // Without a database adapter, the user Auth.js hands over after a Google
    // login is built from Google's profile: its id is Google's, and it has no
    // role or organization. Swap in the MAIRO user signIn just settled on, so
    // the token carries exactly what a password login's does.
    jwt: async (params) => {
      if (params.account?.provider === "google") {
        const user = await sessionFactsForGoogle(params.account.providerAccountId);
        if (!user) return null;
        return {
          ...params.token,
          sub: user.id,
          email: user.email,
          name: user.name ?? params.token.name,
          role: user.role,
          organizationId: user.organizationId,
        };
      }
      return authConfig.callbacks!.jwt!(params);
    },
  },
});
