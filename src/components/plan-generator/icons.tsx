import type { ReactNode } from "react";
import type { PreviewGoal } from "@/lib/preview/build";

// Line icons for the free AI ad plan generator — one weight, one size, so the
// form reads at a glance.

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export const IconLink = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Icon>
);
export const IconTag = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.4-7.4a1 1 0 0 1-.3-.7Z" />
    <circle cx="8.2" cy="8.2" r="1.4" />
  </Icon>
);
export const IconStore = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M4 9.5V20h16V9.5" />
    <path d="M3 9.5 5 4h14l2 5.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z" />
    <path d="M10 20v-5h4v5" />
  </Icon>
);
export const IconSparkle = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15a2 2 0 0 0-1.2-1.2L3.5 12 9 10.2A2 2 0 0 0 10.2 9Z" />
  </Icon>
);
export const IconShield = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);
export const IconCard = (p: { className?: string }) => (
  <Icon {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <path d="M3 10h18M7 15h3" />
  </Icon>
);
export const IconPause = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 9v6M14 9v6" />
  </Icon>
);
export const IconSearch = (p: { className?: string }) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.3-4.3" />
  </Icon>
);
export const IconDoc = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M6.5 3.5h7l4 4v13h-11Z" />
    <path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" />
  </Icon>
);
export const IconRocket = (p: { className?: string }) => (
  <Icon {...p}>
    <path d="M14 4.5c2.8-.9 5.2-.9 5.5-.5.4.3.4 2.7-.5 5.5a11 11 0 0 1-6.5 6.5L9 12.5A11 11 0 0 1 14 4.5Z" />
    <path d="M9 12.5 6 12l2-3.5h3.5M11.5 15l.5 3 3.5-2V12.5" />
    <circle cx="15.2" cy="8.8" r="1.2" />
  </Icon>
);

const GOAL_PATHS: Record<PreviewGoal, ReactNode> = {
  sales: (
    <>
      <path d="M3 4h2.2l2.1 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L19.8 8H6.1" />
      <circle cx="9.5" cy="19" r="1.3" />
      <circle cx="16.5" cy="19" r="1.3" />
    </>
  ),
  leads: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.3a5.5 5.5 0 0 1 3 5.2" />
    </>
  ),
  bookings: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  traffic: (
    <>
      <path d="M3.5 19.5h17" />
      <path d="m5 15 4.5-4.5 3.5 3 6-6.5" />
      <path d="M15 7h4v4" />
    </>
  ),
  awareness: (
    <>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
};

export function GoalIcon({ goal, className = "h-6 w-6" }: { goal: PreviewGoal; className?: string }) {
  return <Icon className={className}>{GOAL_PATHS[goal]}</Icon>;
}
