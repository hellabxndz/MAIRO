// Native <details> rather than a JavaScript accordion: it is keyboard
// accessible and searchable in-page for free, and ships no client bundle.
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="border-t border-white/10">
      {items.map((item) => (
        <details key={item.q} className="group border-b border-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg text-white transition hover:text-neutral-300 [&::-webkit-details-marker]:hidden">
            {item.q}
            <span className="shrink-0 text-neutral-600 transition duration-300 group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="max-w-2xl pb-6 text-sm leading-relaxed text-neutral-400">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
