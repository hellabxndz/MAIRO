import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="ma-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="1" stopColor="#3aa0ff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#ma-g)" opacity="0.18" />
      <rect x="1" y="1" width="30" height="30" rx="9" fill="none" stroke="url(#ma-g)" strokeOpacity="0.6" />
      <circle cx="16" cy="16" r="5.5" fill="url(#ma-g)" />
      <ellipse cx="16" cy="16" rx="11" ry="4" fill="none" stroke="#c9bcff" strokeOpacity="0.7" transform="rotate(-24 16 16)" />
      <circle cx="25.2" cy="12" r="1.3" fill="#36d6f0" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)} aria-label="Mairo Assist home">
      <LogoMark />
      <span className="text-[15px]">
        MAIRO <span className="text-gradient">ASSIST</span>
      </span>
    </Link>
  );
}
