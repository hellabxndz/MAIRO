import { googleSignInEnabled } from "@/lib/google-sign-in";
import { signInErrorMessage } from "@/lib/google-sign-in-rules";
import { FreelancerSignUpForm } from "./freelancer-sign-up-form";

// Server half of the studio sign-up: whether Google is configured, and any
// ?error= a Google login was sent back here with.
export default async function Page({ searchParams }: PageProps<"/for-freelancers">) {
  const { error } = await searchParams;
  return (
    <FreelancerSignUpForm
      googleEnabled={googleSignInEnabled()}
      initialError={signInErrorMessage(typeof error === "string" ? error : null)}
    />
  );
}
