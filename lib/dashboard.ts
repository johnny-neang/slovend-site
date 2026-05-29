import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { getConnection } from "@/lib/connections";
import { listMachines, type Machine, type NayaxConn } from "@/lib/nayax";
import { getSelectedMachineId } from "@/lib/selection";

export type DashCtx = {
  email: string | null;
  conn: NayaxConn | null;
  machines: Machine[];
  machine: Machine | null;
  machineId: string;
  error: string | null;
};

/** Per-request shared dashboard context (deduped via React cache). */
export const getCtx = cache(async (): Promise<DashCtx> => {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? null;
  const conn = email ? await getConnection(email) : null;
  if (!conn) {
    return { email, conn: null, machines: [], machine: null, machineId: "", error: null };
  }
  try {
    const machines = await listMachines(conn);
    const machineId = await getSelectedMachineId(machines, conn.machineId);
    const machine =
      machines.find((m) => String(m.MachineID) === machineId) ?? machines[0] ?? null;
    return {
      email,
      conn,
      machines,
      machine,
      machineId: machine ? String(machine.MachineID) : machineId,
      error: null,
    };
  } catch (e) {
    return {
      email,
      conn,
      machines: [],
      machine: null,
      machineId: "",
      error: e instanceof Error ? e.message : "Could not reach Nayax",
    };
  }
});

export function machineLabel(m: Machine): string {
  return (
    (m.MachineName as string) ||
    (m.MachineNumber as string) ||
    `Machine ${m.MachineID ?? ""}`.trim()
  );
}
