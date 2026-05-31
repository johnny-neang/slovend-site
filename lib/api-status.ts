import "server-only";
import { type NayaxConn, listMachines, probeEndpoint } from "@/lib/nayax";

export type Access = "ok" | "forbidden" | "unauthorized" | "missing" | "error" | "untested";

export type EndpointRow = {
  key: string;
  label: string;
  method: string;
  type: "read" | "write";
  access: Access;
  code: number | null;
  note?: string;
};

function classify(code: number): Access {
  if (code >= 200 && code < 300) return "ok";
  if (code === 403) return "forbidden";
  if (code === 401) return "unauthorized";
  if (code === 404) return "missing";
  return "error";
}

/** Live-probe the read endpoints Vendai uses against the operator's token. */
export async function probeReadEndpoints(conn: NayaxConn): Promise<EndpointRow[]> {
  let mid = conn.machineId;
  if (!mid) {
    try {
      const ms = await listMachines(conn);
      mid = ms[0]?.MachineID != null ? String(ms[0].MachineID) : "";
    } catch {
      mid = "";
    }
  }

  const reads: { key: string; label: string; path: string }[] = [
    { key: "machines", label: "List machines", path: "/operational/v1/machines" },
    { key: "machine", label: "Machine details", path: `/operational/v1/machines/${mid}` },
    { key: "sales", label: "Recent sales", path: `/operational/v1/machines/${mid}/lastSales` },
    { key: "alerts", label: "Alerts & events", path: `/operational/v1/machines/${mid}/lastAlerts` },
    { key: "products", label: "Planogram / inventory", path: `/operational/v1/machines/${mid}/machineProducts` },
    { key: "status", label: "Machine health", path: `/operational/v1/machines/${mid}/status` },
  ];

  return Promise.all(
    reads.map(async (r): Promise<EndpointRow> => {
      if (r.key !== "machines" && !mid) {
        return { ...r, method: "GET", type: "read", access: "untested", code: null, note: "no machine to test" };
      }
      const code = await probeEndpoint(conn, r.path);
      return { ...r, method: "GET", type: "read", access: code ? classify(code) : "error", code: code || null };
    }),
  );
}

/** Write capabilities are governed entirely by the operator's Nayax role. Vendai
 * is read-only and never calls these — listed so users know they exist + are gated. */
export const WRITE_CAPABILITIES: EndpointRow[] = [
  { key: "planogram", label: "Update planogram & prices", method: "PUT/POST", type: "write", access: "untested", code: null },
  { key: "catalog", label: "Create / update catalog products", method: "POST/PUT", type: "write", access: "untested", code: null },
  { key: "routes", label: "Assign machines to routes", method: "POST", type: "write", access: "untested", code: null },
  { key: "groups", label: "Manage product groups & tax", method: "POST/PUT/DELETE", type: "write", access: "untested", code: null },
];
