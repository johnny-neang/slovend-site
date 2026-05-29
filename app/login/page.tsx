import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import PageRays from "@/components/PageRays";
import SiteHeader from "@/components/SiteHeader";
import SignInButton from "@/components/SignInButton";

export const metadata: Metadata = { title: "Sign in · Slovend" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const sp = await searchParams;
  const denied = sp?.error === "AccessDenied";
  const callbackUrl = sp?.callbackUrl ?? "/dashboard";

  return (
    <>
      <PageRays />
      <SiteHeader />
      <section className="auth-wrap">
        <div className="auth-card">
          <div className="corner tl" />
          <div className="corner tr" />
          <div className="corner bl" />
          <div className="corner br" />

          <div className="kicker center">Vendai</div>
          <h1>Sign in to Vendai</h1>
          <p>
            Operator access is in private beta. Sign in with your Google account
            to reach your fleet dashboard.
          </p>

          {denied ? (
            <div className="auth-error">
              That account isn&apos;t on the beta list yet. If you think it
              should be, reach out and we&apos;ll get you added.
            </div>
          ) : null}

          <SignInButton callbackUrl={callbackUrl} />

          <div className="auth-fine">Private beta · Slovend × FutureNow</div>
        </div>
      </section>
    </>
  );
}
