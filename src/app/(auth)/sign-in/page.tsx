import { Suspense } from "react";
import { googleSignInEnabled } from "@/lib/google-sign-in";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm googleEnabled={googleSignInEnabled()} />
    </Suspense>
  );
}
