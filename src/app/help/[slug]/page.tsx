import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingNav } from "@/components/landing/landing-nav";
import { SiteFooter } from "@/components/landing/site-footer";
import { HelpArticleView } from "@/components/help/help-article";
import { brandFont } from "@/lib/fonts";
import { helpArticle, helpArticles } from "@/lib/help/articles";
import { USABLE_TOOLS } from "@/lib/tools/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return helpArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const a = helpArticle((await params).slug);
  if (!a) return {};
  return { title: `${a.title} — Help`, description: a.summary, alternates: { canonical: `/help/${a.slug}` } };
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const article = helpArticle((await params).slug);
  if (!article) notFound();
  const related = article.related.map(helpArticle).filter((a) => a !== null);
  const toolsLive = USABLE_TOOLS().length > 0;
  return (
    <div className={`${brandFont.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav toolsLive={toolsLive} />
      <main className="mx-auto max-w-[960px] px-4 pb-20 pt-[110px] sm:px-8 sm:pt-[130px]">
        <HelpArticleView article={article} related={related} basePath="/help" signedIn={false} />
      </main>
      <SiteFooter toolsLive={toolsLive} />
    </div>
  );
}
