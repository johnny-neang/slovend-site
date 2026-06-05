"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCtx, machineLabel } from "@/lib/dashboard";
import { runAssistant, assistantConfigured } from "@/lib/assistant";
import {
  createThread,
  ownThread,
  getMessages,
  addMessage,
  setTitleIfNew,
  deleteThread,
} from "@/lib/threads";

async function requireKey(): Promise<string> {
  const session = await auth();
  const key = session?.user?.email?.toLowerCase();
  if (!key) redirect("/login");
  return key;
}

export async function newThreadAction(): Promise<{ id: string; title: string }> {
  const key = await requireKey();
  const ctx = await getCtx();
  const id = await createThread(key, ctx.machineId || "");
  return { id, title: "New chat" };
}

export async function deleteThreadAction(threadId: string): Promise<void> {
  const key = await requireKey();
  await deleteThread(key, threadId);
}

export async function getThreadMessagesAction(
  threadId: string,
): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const key = await requireKey();
  const thread = await ownThread(key, threadId);
  if (!thread) return [];
  const msgs = await getMessages(threadId);
  return msgs.map((m) => ({ role: m.role, text: m.content }));
}

export async function sendMessageAction(
  threadId: string,
  text: string,
): Promise<{ text: string }> {
  const key = await requireKey();
  const clean = text.trim();
  if (!clean) return { text: "" };
  if (!assistantConfigured()) {
    return { text: "The assistant isn't configured yet (missing API key)." };
  }
  const ctx = await getCtx();
  if (!ctx.conn || !ctx.machine) {
    return { text: "Connect your Nayax account on the dashboard first." };
  }
  const thread = await ownThread(key, threadId);
  if (!thread) return { text: "That conversation couldn't be found." };

  const history = await getMessages(threadId);
  await addMessage(threadId, "user", clean);
  await setTitleIfNew(threadId, clean.slice(0, 60));

  let answer: string;
  try {
    answer = await runAssistant(
      ctx.conn,
      { id: ctx.machineId, name: machineLabel(ctx.machine) },
      history.map((m) => ({ role: m.role, text: m.content })),
      clean,
      key,
    );
  } catch (e) {
    answer = `Sorry — I hit an error reaching the model: ${
      e instanceof Error ? e.message : "unknown"
    }`;
  }
  if (!answer) answer = "(no response)";
  await addMessage(threadId, "assistant", answer);
  return { text: answer };
}
