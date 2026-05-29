import PageRays from "@/components/PageRays";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageRays />
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
