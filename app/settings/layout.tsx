import { redirect } from "next/navigation";
import PageRays from "@/components/PageRays";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SettingsNav from "@/components/SettingsNav";
import { auth } from "@/auth";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <PageRays />
      <SiteHeader />
      <div className="dash-bar">
        <div className="wrap dash-bar-in">
          <SettingsNav />
        </div>
      </div>
      {children}
      <SiteFooter />
    </>
  );
}
