export { auth as middleware } from "@/auth";

export const config = {
  // Protect the Vendai dashboard. Unauthenticated users are redirected to /login.
  matcher: ["/dashboard/:path*"],
};
