import { currentOperationHealth } from "@/lib/meta-intelligence/operations";
import { pausedMessage } from "@/lib/meta-intelligence/operations/rules";

// Shown to a customer only when it changes what they can do: Meta is failing
// one kind of action for everyone right now, and MAIRO has paused it. Drawn
// from the last hour of MAIRO's own requests to Meta — nothing is shown when
// there's nothing they need to know. A failure that keeps this from loading
// shows nothing rather than a guess.

export async function MetaStatusNotice() {
  const health = await currentOperationHealth().catch(() => []);
  const paused = health.filter((h) => h.state === "paused" && (h.operation === "build" || h.operation === "change"));
  if (paused.length === 0) return null;
  return (
    <div role="status" className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <p className="text-sm font-medium text-amber-100">Meta is having trouble right now</p>
      {paused.map((p) => (
        <p key={p.operation} className="mt-1 text-sm text-amber-200">{pausedMessage(p.operation, p.reason ?? "")}</p>
      ))}
    </div>
  );
}
