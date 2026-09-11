import { db } from "@/lib/db";
import { fail, ok, type PlatformResult } from "@/lib/ad-platforms/types";
import { buildContainer } from "@/lib/tracking/gtm";
import { nicheById, type Niche } from "@/lib/tracking/niches";
import {
  GtmApiError,
  createTag,
  createTrigger,
  createVariable,
  createVersion,
  createWorkspace,
  deleteEntity,
  enableBuiltInVariables,
  explainGtmApiError,
  listTags,
  listTriggers,
  listVariables,
  listWorkspaces,
  publishVersion,
} from "@/lib/tracking/gtm-api/client";
import {
  loadGtmCredentials,
  markGtmProblem,
  notePublished,
  rememberWorkspace,
} from "@/lib/tracking/gtm-connection";

// Writing MAIRO's tags into the customer's Tag Manager and publishing them.
//
// The same container this builds as a downloadable file is built here through
// the API instead, from the same buildContainer() — so the two paths cannot
// drift apart, and a fix to a tag is a fix to both.
//
// Four things shape the order of operations.
//
// Triggers before tags, always. A tag references its trigger by the id Google
// assigns on creation, which is not knowable in advance. Creating tags first
// would mean a second pass to patch them, and a failure between the two passes
// would leave tags in the container firing on nothing.
//
// Built-in variables before triggers. A trigger on {{Click URL}} in a
// container where that built-in is disabled resolves to nothing, never
// matches, and never fires — with no error at any point. This is the single
// most likely way for a "successful" provision to do nothing at all.
//
// MAIRO's own workspace, never the customer's default. Publishing a workspace
// publishes everything in it, so writing into a workspace somebody is halfway
// through editing would push their unfinished work live along with MAIRO's.
//
// And replace, don't append. Running this twice must not leave two Purchase
// tags double-counting every sale — so MAIRO's own tags are deleted first,
// identified by their "MAIRO - " name prefix. Nothing without that prefix is
// ever touched.

const WORKSPACE_NAME = "MAIRO";
const OWNED_PREFIX = "MAIRO - ";

/** GTM's well-known id for the All Pages trigger, present in every container. */
const ALL_PAGES_TRIGGER = "2147479553";

const BUILT_IN_VARIABLES = [
  "PAGE_URL",
  "PAGE_HOSTNAME",
  "PAGE_PATH",
  "CLICK_URL",
  "CLICK_ELEMENT",
  "CLICK_TEXT",
  "FORM_ELEMENT",
  "EVENT",
];

export type ProvisionResult = {
  tagsCreated: number;
  triggersCreated: number;
  variablesCreated: number;
  published: boolean;
  /** What the customer is told happened. */
  message: string;
};

/**
 * Finds MAIRO's workspace, or makes one.
 *
 * A remembered id is verified against the container rather than trusted: a
 * workspace can be deleted in Tag Manager by anyone with access, and a stale
 * id would address something that no longer exists — or, if the customer has
 * since switched containers, something that belongs to a different one.
 */
async function ensureWorkspace(
  accessToken: string,
  accountId: string,
  containerId: string,
  rememberedId: string | null
): Promise<{ path: string; workspaceId: string }> {
  const workspaces = await listWorkspaces(accessToken, accountId, containerId);

  if (rememberedId) {
    const found = workspaces.find((w) => w.workspaceId === rememberedId);
    if (found) return { path: found.path, workspaceId: found.workspaceId };
  }

  const byName = workspaces.find((w) => w.name === WORKSPACE_NAME);
  if (byName) return { path: byName.path, workspaceId: byName.workspaceId };

  const created = await createWorkspace(accessToken, accountId, containerId, WORKSPACE_NAME);
  return { path: created.path, workspaceId: created.workspaceId };
}

/**
 * Removes what MAIRO put there last time.
 *
 * Tags first, then triggers: Tag Manager refuses to delete a trigger a tag
 * still fires on, so the reverse order fails halfway and leaves the container
 * with orphaned triggers and no tags.
 */
async function clearPreviousRun(accessToken: string, workspacePath: string): Promise<void> {
  const tags = await listTags(accessToken, workspacePath);
  for (const tag of tags) {
    if (tag.name?.startsWith(OWNED_PREFIX) && tag.path) {
      await deleteEntity(accessToken, tag.path);
    }
  }

  const triggers = await listTriggers(accessToken, workspacePath);
  for (const trigger of triggers) {
    if (trigger.name?.startsWith(OWNED_PREFIX) && trigger.path) {
      await deleteEntity(accessToken, trigger.path);
    }
  }

  const variables = await listVariables(accessToken, workspacePath);
  for (const variable of variables) {
    if (variable.name?.startsWith(OWNED_PREFIX) && variable.path) {
      await deleteEntity(accessToken, variable.path);
    }
  }
}

type BuiltContainer = {
  containerVersion: {
    tag: { name: string; type: string; parameter: unknown[]; firingTriggerId: string[] }[];
    trigger: (Record<string, unknown> & { triggerId: string; name: string })[];
    variable: (Record<string, unknown> & { variableId: string; name: string })[];
  };
};

/**
 * Builds and publishes the customer's tags.
 *
 * Never throws. Every failure a customer can hit — no connection, no container
 * chosen, a Google account without publish rights, Tag Manager rate-limiting —
 * comes back as a typed result with something they can act on.
 */
export async function provisionContainer(
  organizationId: string
): Promise<PlatformResult<ProvisionResult>> {
  const creds = await loadGtmCredentials(organizationId);
  if (!creds) {
    return fail("not_connected", "Connect Tag Manager first.");
  }
  if (!creds.accountId || !creds.containerId) {
    return fail("rejected", "Choose which Tag Manager container to use first.");
  }
  if (!creds.canEdit) {
    return fail(
      "insufficient_scope",
      "MAIRO wasn't granted permission to edit your containers. Reconnect Tag Manager and approve every box."
    );
  }

  const [organization, profile, pixels] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.trackingProfile.findUnique({ where: { organizationId } }),
    db.trackingPixel.findMany({ where: { organizationId } }),
  ]);

  const meta = pixels.find((p) => p.platform === "META")?.externalPixelId ?? null;
  const tiktok = pixels.find((p) => p.platform === "TIKTOK")?.externalPixelId ?? null;
  if (!meta && !tiktok) {
    return fail("rejected", "Set up a pixel first — there is nothing for the tags to fire.");
  }

  const niche: Niche = nicheById(profile?.nicheId ?? "general");
  const blueprint = buildContainer({
    businessName: organization?.name ?? "Your business",
    niche,
    metaPixelId: meta,
    tiktokPixelId: tiktok,
  }) as unknown as BuiltContainer;

  try {
    const workspace = await ensureWorkspace(
      creds.accessToken,
      creds.accountId,
      creds.containerId,
      creds.workspaceId
    );
    await rememberWorkspace(organizationId, workspace.workspaceId);

    // Before anything that depends on them.
    await enableBuiltInVariables(creds.accessToken, workspace.path, BUILT_IN_VARIABLES);

    await clearPreviousRun(creds.accessToken, workspace.path);

    let variablesCreated = 0;
    for (const variable of blueprint.containerVersion.variable) {
      await createVariable(
        creds.accessToken,
        workspace.path,
        omit(variable, ["variableId", "accountId", "containerId"])
      );
      variablesCreated++;
    }

    // Triggers first, keeping a map from the blueprint's local id to the real
    // one Google just assigned. The tags below are rewritten through it.
    const triggerIdMap = new Map<string, string>();
    for (const trigger of blueprint.containerVersion.trigger) {
      const created = await createTrigger(
        creds.accessToken,
        workspace.path,
        omit(trigger, ["triggerId", "accountId", "containerId"])
      );
      triggerIdMap.set(trigger.triggerId, created.triggerId);
    }

    let tagsCreated = 0;
    for (const tag of blueprint.containerVersion.tag) {
      const { firingTriggerId, ...rest } = tag;
      const mapped = firingTriggerId.map((id) =>
        // All Pages is Google's own id and is the same in every container, so
        // it passes through rather than being looked up.
        id === ALL_PAGES_TRIGGER ? id : (triggerIdMap.get(id) ?? id)
      );
      // A tag whose trigger did not resolve would import and fire on nothing.
      // Better to stop than to publish something that silently does not work.
      if (mapped.some((id) => id !== ALL_PAGES_TRIGGER && !isRealId(id, triggerIdMap))) {
        return fail(
          "rejected",
          "MAIRO couldn't match a tag to its trigger, so nothing was published. Try again."
        );
      }
      await createTag(creds.accessToken, workspace.path, {
        ...omit(rest as Record<string, unknown>, [
          "accountId",
          "containerId",
          "tagId",
          "fingerprint",
        ]),
        firingTriggerId: mapped,
      });
      tagsCreated++;
    }

    if (!creds.canPublish) {
      // The tags exist but change nothing until a human publishes them. Said
      // plainly, because "installed" would be a lie the customer only
      // discovers weeks later from an empty conversion column.
      return ok({
        tagsCreated,
        triggersCreated: triggerIdMap.size,
        variablesCreated,
        published: false,
        message:
          `${tagsCreated} tags are ready in a workspace called "${WORKSPACE_NAME}" in your Tag Manager, ` +
          "but MAIRO wasn't given permission to publish them — so they aren't live yet. " +
          "Open Tag Manager and press Submit, or reconnect and approve the publish permission.",
      });
    }

    const version = await createVersion(
      creds.accessToken,
      workspace.path,
      `MAIRO — ${niche.label}`,
      `Conversion tracking for a ${niche.label.toLowerCase()}: ${niche.actions
        .map((a) => a.label.toLowerCase())
        .join(", ")}.`
    );

    const versionPath = version.containerVersion?.path;
    if (!versionPath) {
      // No version means the workspace had no changes — which after creating
      // tags means something is wrong, not that everything is fine.
      return fail(
        "rejected",
        "Tag Manager made no version from these changes, so nothing was published. Check the MAIRO workspace in Tag Manager."
      );
    }
    if (version.compilerError) {
      return fail(
        "rejected",
        "Tag Manager could not compile the tags, so nothing was published. Nothing on your site changed."
      );
    }

    await publishVersion(creds.accessToken, versionPath);
    await notePublished(organizationId, tagsCreated);

    return ok({
      tagsCreated,
      triggersCreated: triggerIdMap.size,
      variablesCreated,
      published: true,
      message:
        `Live. ${tagsCreated} tags published to ${creds.containerPublic ?? "your container"} — ` +
        `${niche.actions.map((a) => a.label.toLowerCase()).join(", ")}.`,
    });
  } catch (error) {
    if (error instanceof GtmApiError && error.isAuthProblem) {
      await markGtmProblem(
        organizationId,
        "TOKEN_EXPIRED",
        "Google's permission for MAIRO has expired or been revoked. Reconnect Tag Manager."
      );
      return fail("not_connected", explainGtmApiError(error), error.body);
    }
    if (error instanceof GtmApiError && error.isTransient) {
      return fail("unavailable", explainGtmApiError(error), error.body);
    }
    return fail("rejected", explainGtmApiError(error), error);
  }
}

/**
 * Strips the fields that belong to the exported file rather than to a create
 * call. Sending the blueprint's own ids would have Google either reject them
 * or, worse, accept them as a hint and assign something else.
 */
function omit<T extends Record<string, unknown>>(source: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) if (!keys.includes(k)) out[k] = v;
  return out;
}

/** True when this id came back from Google rather than being a local one. */
function isRealId(id: string, map: Map<string, string>): boolean {
  for (const value of map.values()) if (value === id) return true;
  return false;
}
