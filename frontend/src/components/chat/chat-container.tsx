"use client";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatContainerProps {
  conversationId?: number;
  onConversationCreated?: (id: number) => void;
}

export function ChatContainer({ conversationId, onConversationCreated }: ChatContainerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    let activeConvId = convId;
    if (!activeConvId) {
      const conv = await api.post<{ id: number }>("/chat/conversations", {
        title: text.slice(0, 50),
      });
      activeConvId = conv.id;
      setConvId(activeConvId);
      onConversationCreated?.(activeConvId);
    }

    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/v1/chat/conversations/${activeConvId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.text) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    updated[updated.length - 1] = { ...last, content: last.content + data.text };
                    return updated;
                  });
                }
              } catch {}
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
        return updated;
      });
    }
    setStreaming(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center mt-20" style={{ color: "var(--text-muted)" }}>
            <p className="text-4xl mb-4">🧠</p>
            <p className="text-xl font-semibold">Ask me anything about the job market</p>
            <p className="text-sm mt-2">Try: &quot;Which companies are scaling fastest in Silicon Valley?&quot;</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[80%] rounded-2xl px-4 py-3"
              style={
                msg.role === "user"
                  ? { backgroundColor: "var(--cyan)", color: "var(--bg-void)" }
                  : { backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }
              }
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {/* Input */}
      <div className="pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask about jobs, salaries, companies, hiring trends..."
            className="flex-1 rounded-xl px-4 py-3 outline-none transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="disabled:opacity-50 px-6 py-3 rounded-xl font-medium transition-colors"
            style={{ backgroundColor: "var(--cyan)", color: "var(--bg-void)" }}
          >
            {streaming ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
