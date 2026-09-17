import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MairoCard } from "@/components/mairo";

// Create: the one question the whole product turns on.
//
// The old interface had no such screen — making a campaign and making a
// creative lived on two different pages you had to already know about. This is
// the hub the brief asks for: "what would you like Mairo to create?", and every
// answer routes into a flow that already exists and already works. Nothing here
// reimplements campaign or creative generation; it is a signpost.

export const dynamic = "force-dynamic";

const OPTIONS = [
  {
    href: "/dashboard/campaigns",
    title: "A campaign",
    body: "Answer a few questions about what you sell and what you want to happen. Mairo builds the campaign and waits for you to approve it.",
    tag: "Most people start here",
    lit: true,
  },
  {
    href: "/dashboard/creatives",
    title: "Ad creatives",
    body: "Give Mairo a product and it writes the concepts, headlines, hooks and calls to action — for Meta, for TikTok, or both.",
    tag: "Images and copy",
  },
  {
    href: "/dashboard/creatives",
    title: "Variations of an ad",
    body: "Take something that is already running and make more of it: a different hook, a shorter version, a platform-specific cut.",
    tag: "From what you have",
  },
  {
    href: "/dashboard/agents",
    title: "Something else",
    body: "Ask Mairo. It knows your business, your campaigns and your creatives, and can draft whatever you describe.",
    tag: "Mairo AI",
  },
];

export default async function CreatePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
        What would you like Mairo to create?
      </h1>
      <p className="mt-2 text-sm text-muted">
        Nothing here spends money. Everything Mairo builds comes back for your approval first.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <MairoCard key={o.title} href={o.href} className="p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-bright/80">
              {o.tag}
            </p>
            <h2 className="mt-3 text-[17px] font-medium text-white">{o.title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{o.body}</p>
            <span className="mt-4 inline-flex items-center gap-2 text-[12px] text-blue-bright">
              Start
              <span aria-hidden>→</span>
            </span>
          </MairoCard>
        ))}
      </div>

      <p className="mt-8 text-[12px] leading-relaxed text-faint">
        Mairo uses your business details and available campaign data to make recommendations.
        Advertising results vary and cannot be guaranteed.
      </p>
    </div>
  );
}
