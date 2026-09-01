"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { primaryButtonClass, inputClass } from "@/components/ui";
import type { AgentType } from "@/generated/prisma/enums";

export function ChatClient({
  threadId,
  agentType,
  initialMessages,
  agentLabel,
}: {
  threadId: string;
  agentType: AgentType;
  initialMessages: UIMessage[];
  agentLabel: string;
}) {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/agents/chat",
      body: { threadId, agentType },
    }),
  });

  const pending = status === "submitted" || status === "streaming";

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col rounded-2xl border border-white/10">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Say hello to your {agentLabel} agent to get started.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                message.role === "user"
                  ? "max-w-[80%] rounded-2xl bg-white px-4 py-2 text-sm text-black"
                  : "max-w-[80%] rounded-2xl bg-white/10 px-4 py-2 text-sm text-white"
              }
            >
              {message.parts
                .filter((p): p is { type: "text"; text: string } => p.type === "text")
                .map((p, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {p.text}
                  </p>
                ))}
            </div>
          </div>
        ))}
        {pending && <p className="text-xs text-neutral-500">Thinking...</p>}

        {/* A failed request used to just swallow the message, which reads as
            the agent ignoring you. Say what actually went wrong instead. */}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3">
            <p className="text-sm text-red-200">
              {error.message || "Something went wrong reaching the agent."}
            </p>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
        className="flex gap-3 border-t border-white/10 p-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Message the ${agentLabel} agent...`}
          className={inputClass}
        />
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          Send
        </button>
      </form>
    </div>
  );
}
