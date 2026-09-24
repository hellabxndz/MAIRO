import { Bot, Send, X } from "lucide-react";

/**
 * Static appearance preview of the storefront chat widget. It renders the
 * owner's real configuration but sends nothing anywhere.
 */
export function WidgetPreview({
  name,
  welcomeMessage,
  brandColor,
  businessName,
}: {
  name: string;
  welcomeMessage: string;
  brandColor: string;
  businessName: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-2xl border border-line bg-[#0b0e1c] shadow-2xl">
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}cc)` }}>
        <span className="flex size-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold text-white">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 text-white">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="flex items-center gap-1 text-[11px] text-white/80">
            <Bot className="size-3" aria-hidden /> AI assistant · {businessName}
          </p>
        </div>
        <X className="size-4 text-white/80" aria-hidden />
      </div>
      <div className="space-y-3 p-4">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/8 px-3.5 py-2.5 text-sm text-fg">{welcomeMessage}</div>
        <p className="text-[11px] text-fg-subtle">You&apos;re chatting with an AI assistant. You can ask for a person at any time.</p>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <div className="h-9 flex-1 rounded-full bg-white/5 px-3 text-sm leading-9 text-fg-subtle">Type a message…</div>
        <span className="flex size-9 items-center justify-center rounded-full text-white" style={{ background: brandColor }}>
          <Send className="size-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}
