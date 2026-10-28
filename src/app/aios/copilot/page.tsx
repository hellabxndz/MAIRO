import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { findOrCreateThread, loadThreadMessages } from "@/lib/ai/threads";
import { Jarvis } from "./jarvis";

// JARVIS, the AIOS assistant (URL kept as /aios/copilot). Staff only — the
// layout checks, this page checks, and the chat route checks the thread's
// type and the role again on every message.

export const metadata = { title: "JARVIS" };

export default async function CopilotPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") redirect("/sign-in");

  const thread = await findOrCreateThread(session.user.id, null, "OWNER_COPILOT");
  const initialMessages = await loadThreadMessages(thread.id);

  return (
    <div className="mx-auto max-w-[980px]">
      <Jarvis threadId={thread.id} initialMessages={initialMessages} />
    </div>
  );
}
