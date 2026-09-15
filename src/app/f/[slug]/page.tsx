import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { parseFields } from "@/lib/leads/forms";
import { LeadFormView } from "./lead-form-view";

// The page a stranger lands on after tapping an ad.
//
// Public, unauthenticated, and deliberately plain. Everything else in MAIRO is
// a dark dashboard for a customer; this is a form for somebody who has never
// heard of MAIRO, is on a phone, and will leave if it looks like work. The
// business's name is the loudest thing on it, because that is who they think
// they are talking to.

export const dynamic = "force-dynamic";

async function load(slug: string) {
  return db.leadForm.findUnique({
    where: { slug },
    include: { organization: { select: { name: true } } },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const form = await load(slug);
  if (!form) return { title: "Form not found" };
  return {
    title: form.headline,
    description: form.description,
    // Not indexable. This page exists for people arriving from one specific
    // ad, and a business's enquiry form turning up in search results is a
    // surprise nobody asked for.
    robots: { index: false, follow: false },
  };
}

export default async function PublicLeadFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const form = await load(slug);
  if (!form) notFound();

  const fields = parseFields(form.fieldsJson);
  if (fields.length === 0) notFound();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <LeadFormView
        slug={form.slug}
        businessName={form.organization.name}
        headline={form.headline}
        description={form.description}
        fields={fields}
      />
    </main>
  );
}
