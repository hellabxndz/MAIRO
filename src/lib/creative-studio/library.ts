import { db } from "@/lib/db";

// Reading the Creative Studio library.
//
// A plain async function rather than a server action — nothing here writes,
// so it belongs where every other read-only query in this codebase lives,
// called straight from a server component. Every query is scoped by
// organizationId in the WHERE clause rather than checked after loading, which
// is what actually stops one business from ever being able to load another's
// creative by guessing an id.

export type LibraryItem = {
  assetId: string;
  source: "PROMPT" | "PRODUCT_UPLOAD" | "OWN_UPLOAD";
  preset: string | null;
  format: string;
  variationGroupId: string | null;
  linkedCreativeRequestId: string | null;
  latestVersion: {
    id: string;
    version: number;
    kind: string;
    status: string;
    instruction: string | null;
    imageUrl: string | null;
    errorMessage: string | null;
    creditsSpent: number;
  } | null;
  versionCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function libraryFor(organizationId: string, limit = 60): Promise<LibraryItem[]> {
  const assets = await db.creativeStudioAsset.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
      _count: { select: { versions: true } },
    },
  });

  return assets.map((a) => ({
    assetId: a.id,
    source: a.source,
    preset: a.preset,
    format: a.format,
    variationGroupId: a.variationGroupId,
    linkedCreativeRequestId: a.linkedCreativeRequestId,
    latestVersion: a.versions[0]
      ? {
          id: a.versions[0].id,
          version: a.versions[0].version,
          kind: a.versions[0].kind,
          status: a.versions[0].status,
          instruction: a.versions[0].instruction,
          imageUrl: a.versions[0].imageUrl,
          errorMessage: a.versions[0].errorMessage,
          creditsSpent: a.versions[0].creditsSpent,
        }
      : null,
    versionCount: a._count.versions,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}

export type AssetDetail = {
  id: string;
  source: string;
  preset: string | null;
  format: string;
  sourceImageUrl: string | null;
  linkedCreativeRequestId: string | null;
  versions: {
    id: string;
    version: number;
    kind: string;
    status: string;
    instruction: string | null;
    imageUrl: string | null;
    rawImageUrl: string | null;
    errorMessage: string | null;
    creditsSpent: number;
    createdAt: Date;
  }[];
};

/** One asset with its full version history — the version-history / editing view. */
export async function assetDetail(organizationId: string, assetId: string): Promise<AssetDetail | null> {
  const asset = await db.creativeStudioAsset.findFirst({
    where: { id: assetId, organizationId },
    include: { versions: { orderBy: { version: "asc" } } },
  });
  if (!asset) return null;

  return {
    id: asset.id,
    source: asset.source,
    preset: asset.preset,
    format: asset.format,
    sourceImageUrl: asset.sourceImageUrl,
    linkedCreativeRequestId: asset.linkedCreativeRequestId,
    versions: asset.versions.map((v) => ({
      id: v.id,
      version: v.version,
      kind: v.kind,
      status: v.status,
      instruction: v.instruction,
      imageUrl: v.imageUrl,
      rawImageUrl: v.rawImageUrl,
      errorMessage: v.errorMessage,
      creditsSpent: v.creditsSpent,
      createdAt: v.createdAt,
    })),
  };
}

/** Sibling assets from one "generate N variations" batch, for the grid. */
export async function variationGroup(organizationId: string, groupId: string): Promise<LibraryItem[]> {
  const assets = await db.creativeStudioAsset.findMany({
    where: { organizationId, variationGroupId: groupId },
    orderBy: { createdAt: "asc" },
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, _count: { select: { versions: true } } },
  });
  return assets.map((a) => ({
    assetId: a.id,
    source: a.source,
    preset: a.preset,
    format: a.format,
    variationGroupId: a.variationGroupId,
    linkedCreativeRequestId: a.linkedCreativeRequestId,
    latestVersion: a.versions[0]
      ? {
          id: a.versions[0].id,
          version: a.versions[0].version,
          kind: a.versions[0].kind,
          status: a.versions[0].status,
          instruction: a.versions[0].instruction,
          imageUrl: a.versions[0].imageUrl,
          errorMessage: a.versions[0].errorMessage,
          creditsSpent: a.versions[0].creditsSpent,
        }
      : null,
    versionCount: a._count.versions,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
}
