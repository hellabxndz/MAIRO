import { db } from "@/lib/db";
import type { AdPlatform, ManagedSetupStatus } from "@/generated/prisma/enums";

// "MAIRO sets your TikTok up for you", and what that can honestly mean.
//
// It is worth being exact, because the obvious reading is wrong. There is no
// API on TikTok — or on Meta, or on any other network — that creates a user
// account. Account creation is precisely where a platform runs its identity,
// age and anti-abuse checks, and it is deliberately not automatable. A phone
// number gets a code, a human agrees to terms, and both of those are the
// point rather than an oversight.
//
// So this is not an integration. It is a queue. A customer who has no TikTok
// says so, tells MAIRO what they want to be called and what the business is,
// and somebody at MAIRO does the work with them: registers the account,
// converts it to a Business account, sets up the Business Center and the
// advertiser, and hands the customer their own login. These rows are that work
// being tracked, and the customer sees the real state of it rather than a
// spinner pretending to be an API call.
//
// Nothing here ever holds the account's password. The account belongs to the
// customer; MAIRO's Terms promise it never stores a platform login, and the
// handoff happens outside this system on purpose.

export type SetupRequestInput = {
  organizationId: string;
  platform: AdPlatform;
  displayName: string;
  contactEmail: string;
  contactPhone?: string | null;
  preferredHandle?: string | null;
  alternateHandles?: string | null;
  category?: string | null;
  bio?: string | null;
  websiteUrl?: string | null;
  customerNotes?: string | null;
};

/** The states where MAIRO still owes the customer something. */
export const OPEN_STATUSES: ManagedSetupStatus[] = [
  "REQUESTED",
  "IN_PROGRESS",
  "NEEDS_CUSTOMER",
];

/** What the customer is told each state means. */
export const SETUP_STATUS_COPY: Record<
  ManagedSetupStatus,
  { label: string; detail: string; tone: "neutral" | "yellow" | "blue" | "green" | "red" }
> = {
  REQUESTED: {
    label: "Requested",
    detail:
      "We have your details. Someone at MAIRO picks this up and starts building your TikTok — " +
      "you don't need to do anything yet.",
    tone: "blue",
  },
  IN_PROGRESS: {
    label: "Being set up",
    detail:
      "MAIRO is registering your account and setting up the advertising side of it. We'll email " +
      "you if we need a verification code from your phone.",
    tone: "yellow",
  },
  NEEDS_CUSTOMER: {
    label: "Needs you",
    detail:
      "We're waiting on something only you can do — usually a code TikTok texted you, or a " +
      "decision about the handle. Check the note below and your email.",
    tone: "yellow",
  },
  READY: {
    label: "Ready",
    detail: "Your TikTok account exists and it's yours. Sign in and connect it to MAIRO.",
    tone: "green",
  },
  DECLINED: {
    label: "Not going ahead",
    detail: "This request was closed. The note below says why.",
    tone: "red",
  },
};

/** A TikTok handle, as TikTok's own rules define one. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function handleProblem(raw: string): string | null {
  const handle = normalizeHandle(raw);
  if (handle.length === 0) return null;
  if (handle.length < 2) return "A TikTok handle is at least 2 characters.";
  if (handle.length > 24) return "A TikTok handle is at most 24 characters.";
  if (!/^[a-z0-9._]+$/.test(handle)) {
    return "TikTok handles can only use letters, numbers, full stops and underscores.";
  }
  if (handle.endsWith(".")) return "A TikTok handle can't end with a full stop.";
  return null;
}

/** The request MAIRO is currently working on, if there is one. */
export async function openSetupFor(organizationId: string, platform: AdPlatform) {
  return db.managedAccountSetup.findFirst({
    where: { organizationId, platform, status: { in: OPEN_STATUSES } },
    orderBy: { requestedAt: "desc" },
  });
}

/** The most recent request whatever state it is in — including finished ones. */
export async function latestSetupFor(organizationId: string, platform: AdPlatform) {
  return db.managedAccountSetup.findFirst({
    where: { organizationId, platform },
    orderBy: { requestedAt: "desc" },
  });
}

export type RequestResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Files a request for MAIRO to build the customer's TikTok presence.
 *
 * Refuses a second open request rather than queueing one behind the other:
 * two people at MAIRO working the same account is how a business ends up with
 * two TikToks and neither of them the one they wanted.
 */
export async function requestManagedSetup(input: SetupRequestInput): Promise<RequestResult> {
  const displayName = input.displayName.trim();
  if (displayName.length < 2) {
    return { ok: false, error: "Tell us what the business should be called on TikTok." };
  }

  const email = input.contactEmail.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "We need an email address that works — that's how we reach you." };
  }

  if (input.preferredHandle) {
    const problem = handleProblem(input.preferredHandle);
    if (problem) return { ok: false, error: problem };
  }

  const existing = await openSetupFor(input.organizationId, input.platform);
  if (existing) {
    return {
      ok: false,
      error: "MAIRO is already setting up a TikTok for you. Check the status below.",
    };
  }

  const created = await db.managedAccountSetup.create({
    data: {
      organizationId: input.organizationId,
      platform: input.platform,
      displayName,
      contactEmail: email,
      contactPhone: input.contactPhone?.trim() || null,
      preferredHandle: input.preferredHandle ? normalizeHandle(input.preferredHandle) : null,
      alternateHandles: input.alternateHandles?.trim() || null,
      category: input.category?.trim() || null,
      bio: input.bio?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      customerNotes: input.customerNotes?.trim() || null,
    },
  });

  return { ok: true, id: created.id };
}

/**
 * Moves a request along. Owner-side; the customer never calls this.
 *
 * The timestamps are derived from the state rather than passed in, so the
 * record of when work started and finished cannot drift from the state it
 * describes.
 */
export async function advanceSetup(
  id: string,
  status: ManagedSetupStatus,
  fields: {
    internalNotes?: string | null;
    createdHandle?: string | null;
    handoffUrl?: string | null;
  } = {}
): Promise<void> {
  const now = new Date();
  const existing = await db.managedAccountSetup.findUnique({
    where: { id },
    select: { startedAt: true },
  });

  await db.managedAccountSetup.update({
    where: { id },
    data: {
      status,
      ...(fields.internalNotes !== undefined ? { internalNotes: fields.internalNotes } : {}),
      ...(fields.createdHandle !== undefined
        ? { createdHandle: fields.createdHandle ? normalizeHandle(fields.createdHandle) : null }
        : {}),
      ...(fields.handoffUrl !== undefined ? { handoffUrl: fields.handoffUrl } : {}),
      startedAt:
        status === "IN_PROGRESS" && !existing?.startedAt ? now : (existing?.startedAt ?? null),
      completedAt: status === "READY" || status === "DECLINED" ? now : null,
    },
  });
}

/** The owner's queue: everything still owed, oldest first. */
export async function openSetupQueue() {
  return db.managedAccountSetup.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: { requestedAt: "asc" },
    include: { organization: { select: { id: true, name: true, subscriptionTier: true } } },
  });
}
