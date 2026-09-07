import { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";

// The role type comes from the Prisma enum rather than being spelled out here.
// It was written as a literal union in four separate places, so adding
// FREELANCER to the database meant the session type silently disagreed with
// what was actually in it — the compiler said a comparison against the new
// role "had no overlap" and was therefore a mistake. One source of truth.

declare module "next-auth" {
  interface User {
    role: UserRole;
    organizationId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    organizationId?: string | null;
  }
}
