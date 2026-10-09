// The signed-in backdrop: white, with a faint wash of MAIRO's violet and blue
// at the edges so the screen still feels like MAIRO and not a blank page.
//
// The restraint is the whole point. A dashboard is somewhere you work, and a
// backdrop that moves or carries contrast competes with the numbers someone
// is trying to read. So this is two still gradients — one paint on mount, no
// JavaScript, no compositing work for as long as the screen is open — and the
// middle of the screen, where the work is, stays flat white.

export function AmbientSky() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[20] bg-paper"
      style={{
        backgroundImage:
          "radial-gradient(ellipse 60% 45% at 0% 0%, rgba(124,92,255,0.09), transparent 70%)," +
          "radial-gradient(ellipse 55% 40% at 100% 0%, rgba(59,107,255,0.07), transparent 70%)," +
          "radial-gradient(ellipse 70% 40% at 50% 110%, rgba(124,92,255,0.05), transparent 70%)",
      }}
    />
  );
}
