import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx, machineLabel } from "@/lib/dashboard";
import DashError from "@/components/DashError";
import ChatClient from "@/components/ChatClient";
import { listThreads } from "@/lib/threads";

export const metadata: Metadata = { title: "Chat · Vendai" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const ctx = await getCtx();
  if (!ctx.conn) redirect("/dashboard");
  if (ctx.error || !ctx.machine)
    return (
      <DashError
        title={ctx.error ? "Couldn't reach Nayax" : "No machines found"}
        message={ctx.error ?? "No machines returned for this account."}
      />
    );

  const threads = ctx.email ? await listThreads(ctx.email) : [];

  return (
    <ChatClient
      machine={{ id: ctx.machineId, name: machineLabel(ctx.machine) }}
      initialThreads={threads.map((t) => ({ id: t.id, title: t.title }))}
    />
  );
}
