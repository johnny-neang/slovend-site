import { redirect } from "next/navigation";
import PageRays from "@/components/PageRays";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import DashboardNav from "@/components/DashboardNav";
import MachineSelector from "@/components/MachineSelector";
import { getCtx, machineLabel } from "@/lib/dashboard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getCtx();
  if (!ctx.email) redirect("/login");

  const machineOpts = ctx.machines.map((m) => ({
    id: String(m.MachineID),
    name: machineLabel(m),
  }));

  return (
    <>
      <PageRays />
      <SiteHeader />
      {ctx.conn && machineOpts.length ? (
        <div className="dash-bar">
          <div className="wrap dash-bar-in">
            <DashboardNav />
            <MachineSelector machines={machineOpts} selectedId={ctx.machineId} />
          </div>
        </div>
      ) : null}
      {children}
      <SiteFooter />
    </>
  );
}
