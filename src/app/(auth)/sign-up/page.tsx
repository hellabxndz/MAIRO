import { googleSignInEnabled } from "@/lib/google-sign-in";
import { signInErrorMessage } from "@/lib/google-sign-in-rules";
import { SignUpForm } from "./sign-up-form";

// The form is a client component; this server half decides whether Google is
// configured, which only the server can see, and reads any ?error= a Google
// login was sent back with (e.g. no account yet, so one is created here).
export default async function Page({ searchParams }: PageProps<"/sign-up">) {
  const { error } = await searchParams;
  return (
    <SignUpForm
      googleEnabled={googleSignInEnabled()}
      initialError={signInErrorMessage(typeof error === "string" ? error : null)}
    />
  );
}
