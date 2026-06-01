export { auth as middleware } from "@/auth";

export const config = {
  // Protect the dashboard + settings. Unauthenticated users are redirected to /login.
  matcher: ["/dashboard/:path*", "/settings/:path*"],
};
