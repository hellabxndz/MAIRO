import { redirect } from "next/navigation";

// The freelancer sign-up (Studio and Agency plans) closed in October 2026,
// when MAIRO moved to two plans, MAIRO Pro and MAIRO Scale. Existing
// freelancer workspaces keep their clients and plans and sign in as usual;
// someone running several businesses now uses MAIRO Scale, which covers up
// to three. The sign-up form is kept in this folder, unused, in case the
// freelancer plans return.
export default function Page(): never {
  redirect("/pricing");
}
