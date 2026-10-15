import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import type { HelpArticle, HelpBlock } from "@/lib/help/articles";

// One help article, drawn the same way on the public site (/help/…) and
// inside the dashboard (/dashboard/guide/…). `signedIn` decides how links to
// dashboard pages read: inside the app they're ordinary links; on the public
// site they say they need an account.

export function HelpArticleView({ article, related, basePath, signedIn }: { article: HelpArticle; related: HelpArticle[]; basePath: string; signedIn: boolean }) {
  return (
    <article className="max-w-[720px]">
      <Link href={basePath} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-white">
        <span aria-hidden>←</span> All help
      </Link>
      <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-bright">{article.category}</p>
      <h1 className="mt-2 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] text-white sm:text-[34px]">{article.title}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">{article.summary}</p>

      <div className="mt-8 space-y-4 text-[15px] leading-[1.7] text-white/80">
        {article.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>

      {article.links.length > 0 && (
        <nav aria-label="Where to do this" className="mt-10 rounded-2xl border border-[color:var(--mairo-line)] bg-white/[0.03] p-5">
          <p className="text-[13px] font-semibold text-white">Where to do this</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {article.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[color:var(--mairo-line)] px-4 text-[13.5px] text-white/90 transition hover:border-violet/50 hover:text-white">
                  {l.label}
                  {l.app && !signedIn && <span className="text-[11.5px] text-faint">· sign in</span>}
                  <span aria-hidden className="text-violet-bright">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {related.length > 0 && (
        <section aria-labelledby="help-related" className="mt-10">
          <h2 id="help-related" className="text-[13px] font-semibold text-white">
            Related
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`${basePath}/${r.slug}`} className="block rounded-xl border border-[color:var(--mairo-line)] px-4 py-3 text-[14px] text-white/90 transition hover:border-violet/45 hover:text-white">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <HelpContact signedIn={signedIn} />
    </article>
  );
}

function Block({ block: b }: { block: HelpBlock }) {
  switch (b.kind) {
    case "h":
      return <h2 className="!mt-9 text-[19px] font-semibold tracking-[-0.015em] text-white">{b.text}</h2>;
    case "p":
      return <p>{b.text}</p>;
    case "note":
      return <p className="rounded-xl border-l-2 border-violet/60 bg-violet/[0.06] px-4 py-3 text-[14px] text-white/80">{b.text}</p>;
    case "list":
      return (
        <ul className="space-y-2 pl-1">
          {b.items.map((t) => (
            <li key={t} className="flex gap-3">
              <span aria-hidden className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-violet-bright" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="list-decimal space-y-2 pl-6 marker:text-violet-bright">
          {b.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      );
    case "terms":
      return (
        <dl className="divide-y divide-[color:var(--mairo-line)] rounded-2xl border border-[color:var(--mairo-line)]">
          {b.items.map((t) => (
            <div key={t.term} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] sm:gap-4">
              <dt className="break-words text-[14px] font-semibold text-white">{t.term}</dt>
              <dd className="text-[14px] leading-relaxed text-white/75">{t.text}</dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-2xl border border-[color:var(--mairo-line)]">
          <table className="w-full min-w-[520px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-[color:var(--mairo-line)]">
                {b.head.map((h, i) => (
                  <th key={i} scope="col" className="px-4 py-3 font-semibold text-white">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--mairo-line)]">
              {b.rows.map((r) => (
                <tr key={r[0]}>
                  <th scope="row" className="px-4 py-3 font-medium text-white">
                    {r[0]}
                  </th>
                  {r.slice(1).map((c, i) => (
                    <td key={i} className="px-4 py-3 text-white/75">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Where to go when the answer isn't here: the support address the legal pages use, and, signed in, the in-app routes. */
export function HelpContact({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="help-contact" className="mt-12 rounded-2xl border border-[color:var(--mairo-line)] bg-gradient-to-br from-[#4f7dff]/[0.07] to-[#2fa4ff]/[0.09] p-6">
      <h2 id="help-contact" className="text-[17px] font-semibold text-white">
        Didn&rsquo;t find the answer?
      </h2>
      {signedIn ? (
        <p className="mt-2 text-[14px] leading-relaxed text-white/75">
          Ask your AI team — it can see your account and explain what&rsquo;s happening in it. For anything about MAIRO itself, use <strong className="font-medium text-white">Feedback</strong> in the sidebar: it goes to the MAIRO team. Or email{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="text-violet-bright underline underline-offset-4 hover:text-white">
            {LEGAL.contactEmail}
          </a>
          .
        </p>
      ) : (
        <p className="mt-2 text-[14px] leading-relaxed text-white/75">
          Email{" "}
          <a href={`mailto:${LEGAL.contactEmail}`} className="text-violet-bright underline underline-offset-4 hover:text-white">
            {LEGAL.contactEmail}
          </a>
          {" "}— it goes to the MAIRO team. If you have an account, sign in and use Feedback in the sidebar.
        </p>
      )}
      {signedIn && (
        <Link href="/dashboard/agents" className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-5 text-[13.5px] font-semibold text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110">
          Ask your AI team <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  );
}
