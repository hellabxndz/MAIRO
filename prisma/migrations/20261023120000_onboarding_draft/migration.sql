-- Setup answers saved before the intake is finished, so leaving halfway loses nothing.
ALTER TABLE "Organization" ADD COLUMN     "onboardingDraft" JSONB;
