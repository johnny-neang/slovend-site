"use client";

import { signIn } from "next-auth/react";

export default function SignInButton({
  callbackUrl = "/dashboard",
}: {
  callbackUrl?: string;
}) {
  return (
    <button className="gbtn" onClick={() => signIn("google", { callbackUrl })}>
      <span className="g">G</span> Continue with Google
    </button>
  );
}
