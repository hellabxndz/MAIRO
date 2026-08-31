import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: "OWNER" | "CLIENT";
    organizationId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: "OWNER" | "CLIENT";
      organizationId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "OWNER" | "CLIENT";
    organizationId?: string | null;
  }
}
