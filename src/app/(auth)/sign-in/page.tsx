import { Suspense } from "react";
import { googleSignInEnabled } from "@/lib/google-sign-in";
import { AuthCard } from "@/components/auth-card";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <AuthCard>
      <Suspense>
        <SignInForm googleEnabled={googleSignInEnabled()} />
      </Suspense>
    </AuthCard>
  );
}
