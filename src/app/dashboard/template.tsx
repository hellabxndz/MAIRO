// Every move between the app's screens: a short rise in (globals.css
// .mairo-page-in), never a wait and never under reduced motion.

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="mairo-page-in">{children}</div>;
}
