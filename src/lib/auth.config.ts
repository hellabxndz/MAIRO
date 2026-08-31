import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config: no providers here, since Credentials + bcrypt + the
// Prisma client depend on Node.js APIs the Edge middleware runtime doesn't
// support. Middleware only needs to read the session, not authenticate one,
// so this config (used by middleware.ts) intentionally has an empty
// providers list. The full config with providers lives in auth.ts.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
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
        session.user.role = token.role as "OWNER" | "CLIENT";
        session.user.organizationId = (token.organizationId as string | null) ?? null;
      }
      return session;
    },
  },
};
