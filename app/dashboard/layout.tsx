import { redirect } from "next/navigation";
import { auth } from "@/auth";
import PageRays from "@/components/PageRays";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already gates /dashboard; this is a defense-in-depth check that
  // also gives us the session for the shell.
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <>
      <PageRays />
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
