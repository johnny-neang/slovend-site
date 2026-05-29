import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowed } from "@/lib/allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    // Gate sign-in by the email allowlist. Returning false sends the user back
    // to /login?error=AccessDenied.
    signIn({ profile }) {
      return isAllowed(profile?.email);
    },
    // Used by the middleware wrapper to protect routes.
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
});
