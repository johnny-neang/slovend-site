"use client";

import { useState, useRef, useEffect } from "react";
import {
  newThreadAction,
  deleteThreadAction,
  getThreadMessagesAction,
  sendMessageAction,
} from "@/app/dashboard/chat/actions";

type Thread = { id: string; title: string };
type Msg = { role: "user" | "assistant"; text: string };

export default function ChatClient({
  machine,
  initialThreads,
}: {
  machine: { id: string; name: string };
  initialThreads: Thread[];
}) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [active, setActive] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) void loadThread(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, busy]);

  async function loadThread(id: string) {
    setActive(id);
    setLoading(true);
    try {
      setMessages(await getThreadMessagesAction(id));
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    const t = await newThreadAction();
    setThreads((p) => [{ id: t.id, title: t.title }, ...p]);
    setActive(t.id);
    setMessages([]);
  }

  async function removeThread(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteThreadAction(id);
    setThreads((p) => p.filter((t) => t.id !== id));
    if (active === id) {
      setActive(null);
      setMessages([]);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    let threadId = active;
    if (!threadId) {
      const t = await newThreadAction();
      threadId = t.id;
      setThreads((p) => [{ id: t.id, title: text.slice(0, 60) }, ...p]);
      setActive(t.id);
    } else {
      setThreads((p) =>
        p.map((t) =>
          t.id === threadId && t.title === "New chat"
            ? { ...t, title: text.slice(0, 60) }
            : t,
        ),
      );
    }

    setInput("");
    setMessages((p) => [...p, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await sendMessageAction(threadId, text);
      setMessages((p) => [...p, { role: "assistant", text: res.text }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", text: "Something went wrong." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section dash-page">
      <div className="wrap">
        <div className="dash-head">
          <div>
            <div className="kicker">{machine.name}</div>
            <h1 className="serif-display">Chat</h1>
          </div>
          <button className="btn-mini dark" onClick={newChat}>
            + New chat
          </button>
        </div>

        <div className="chat-layout">
          <aside className="thread-list">
            {threads.length ? (
              threads.map((t) => (
                <div
                  key={t.id}
                  className={`thread-item${active === t.id ? " active" : ""}`}
                  onClick={() => loadThread(t.id)}
                >
                  <span className="tt">{t.title || "New chat"}</span>
                  <button
                    className="tx"
                    onClick={(e) => removeThread(t.id, e)}
                    aria-label="Delete conversation"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="muted" style={{ padding: "12px 14px" }}>
                No conversations yet.
              </div>
            )}
          </aside>

          <div className="chat chat-live">
            <div className="chat-head">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
              <span className="name">Vendai · {machine.name}</span>
              <span className="on">Haiku</span>
            </div>
            <div className="chat-body" ref={bodyRef}>
              {loading ? (
                <div className="msg bot">Loading…</div>
              ) : messages.length ? (
                messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role === "user" ? "user" : "bot"}`}>
                    {m.text.split("\n").map((line, j, arr) => (
                      <span key={j}>
                        {line}
                        {j < arr.length - 1 ? <br /> : null}
                      </span>
                    ))}
                  </div>
                ))
              ) : (
                <div className="chat-empty">
                  Ask about sales, stock, faults, or connectivity for{" "}
                  <b>{machine.name}</b>. Try: &quot;How did it do recently?&quot; or
                  &quot;What needs restocking?&quot;
                </div>
              )}
              {busy ? (
                <div className="msg bot typing">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
            </div>
            <form className="chat-input" onSubmit={send}>
              <input
                className="box-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about your fleet"
                disabled={busy}
              />
              <button className="send" type="submit" disabled={busy || !input.trim()}>
                ↑
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
