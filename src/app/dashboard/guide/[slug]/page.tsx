import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { HelpArticleView } from "@/components/help/help-article";
import { helpArticle } from "@/lib/help/articles";

// A help article inside the dashboard — the same one /help/<slug> shows.

export async function generateMetadata({ params }: PageProps<"/dashboard/guide/[slug]">) {
  const a = helpArticle((await params).slug);
  return { title: a ? `${a.title} — Help — MAIRO` : "Help — MAIRO" };
}

export default async function HelpArticleInApp({ params }: PageProps<"/dashboard/guide/[slug]">) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const article = helpArticle((await params).slug);
  if (!article) notFound();
  const related = article.related.map(helpArticle).filter((a) => a !== null);
  return <HelpArticleView article={article} related={related} basePath="/dashboard/guide" signedIn />;
}
