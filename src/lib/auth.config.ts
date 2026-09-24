import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

// Edge-safe auth config: no providers here, since Credentials + bcrypt + the
// Prisma client depend on Node.js APIs the Edge middleware runtime doesn't
// support. Middleware only needs to read the session, not authenticate one,
// so this config (used by proxy.ts) intentionally has an empty providers
// list. The full config with providers — Credentials and Google — and the
// Google-specific signIn/jwt callbacks, which need the database, lives in
// auth.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
    // Failed or cancelled OAuth logins land here with ?error=, where the form
    // turns the code into a sentence, instead of on Auth.js's own error page.
    error: "/sign-in",
  },
  providers: [],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as UserRole;
        session.user.organizationId = (token.organizationId as string | null) ?? null;
      }
      return session;
    },
  },
};
