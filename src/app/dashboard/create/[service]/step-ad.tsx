"use client";

import { useState, useTransition } from "react";
import { StudioWorkspace } from "@/components/creative-studio/studio-workspace";
import { loadInstagramPostsAction, loadPagePostsAction } from "@/lib/actions/sales-setup-actions";
import { loadAccountAdsAction } from "@/lib/actions/campaign-wizard-actions";
import { hasOwnWords, type CampaignPlan } from "@/lib/campaigns/plan";
import type { PagePost } from "@/lib/campaigns/sales-source";
import type { AccountAd } from "@/lib/meta/existing-ads";
import type { CreditBalance } from "@/lib/creative-studio/credits";
import type { CreditCosts } from "@/lib/creative-studio/pricing";
import { CopyEditor } from "./copy-editor";
import { ExistingAdPicker } from "./existing-ad-picker";
import { PostPicker } from "./post-picker";
import { ImageUpload } from "./image-upload";
import { VideoUpload } from "./video-upload";
import { Choice, Note, Question } from "./wizard-parts";

export type StudioProps = {
  assistantName: string;
  configured: boolean;
  /** Uploads (video) can be stored on this deployment. */
  storageReady: boolean;
  organizationId: string;
  creditBalance: CreditBalance;
  costs: CreditCosts;
  mode: "simple" | "advanced";
};

/** A fresh ad choice starts its words over too. */
const RESET_WORDS: Partial<CampaignPlan> = { copyOptions: [], chosenCopy: 0, testing: false, testPicks: [] };

/** Step 5 — the ad itself: made with AI, uploaded, or something they already have. */
export function StepAd({
  plan,
  update,
  studio,
  metaConnected,
  onConnectMeta,
  openPosts,
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
  studio: StudioProps;
  metaConnected: boolean;
  /** Saves the draft and connects Meta, coming back to the post choices. */
  onConnectMeta: () => void;
  openPosts: boolean;
}) {
  const [posts, setPosts] = useState<Partial<Record<"FACEBOOK_POST" | "INSTAGRAM_POST", PagePost[]>>>({});
  const [postError, setPostError] = useState<string | null>(null);
  const [accountAds, setAccountAds] = useState<AccountAd[] | null>(null);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [menu, setMenu] = useState<"main" | "posts" | "upload">(openPosts && plan.adChoice === "none" ? "posts" : "main");
  const usesMeta = plan.service !== "tiktok";
  // Videos and existing ads are Meta ads; a two-network campaign can't run
  // them on TikTok, so they're offered on Meta campaigns only.
  const metaOnly = plan.service === "meta";
  // A campaign that includes TikTok needs a video; see the menu below.
  const videoOnly = plan.service !== "meta";

  const back = () => {
    setMenu("main");
    update({ adChoice: "none", ...RESET_WORDS });
  };

  function choosePosts(source: "FACEBOOK_POST" | "INSTAGRAM_POST") {
    update({ adChoice: source, selectedPost: plan.adChoice === source ? plan.selectedPost : null, ...RESET_WORDS });
    setPostError(null);
    if (posts[source]) return;
    startLoading(async () => {
      const result = source === "FACEBOOK_POST" ? await loadPagePostsAction() : await loadInstagramPostsAction();
      if (result.ok) setPosts((prev) => ({ ...prev, [source]: result.posts }));
      else setPostError(result.error);
    });
  }

  function chooseExistingAd() {
    update({ adChoice: "EXISTING_AD", ...RESET_WORDS });
    setAdsError(null);
    if (accountAds) return;
    startLoading(async () => {
      const result = await loadAccountAdsAction();
      if (result.ok) setAccountAds(result.ads);
      else setAdsError(result.error);
    });
  }

  const studioFor = (initialTab: "generate" | "upload") => (
    <div className="space-y-4">
      <StudioWorkspace
        assistantName={studio.assistantName}
        creditBalance={studio.creditBalance}
        costs={studio.costs}
        mode={studio.mode}
        embedded
        initialTab={initialTab}
        onAttached={(assetId, imageUrl) =>
          update({ adChoice: "attached", attachedPreview: imageUrl, studioAssetId: assetId, ...RESET_WORDS })
        }
      />
      <BackLink onClick={back} />
    </div>
  );

  return (
    <Question
      title="How would you like to create your advertisement?"
      sub={`Whichever you choose, ${studio.assistantName} only ever uses what you told it about the business — never invented discounts or reviews.`}
    >
      {plan.adChoice === "attached" && plan.attachedPreview ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote blob URL, see studio-workspace.tsx */}
          <img src={plan.attachedPreview} alt="Your advertisement" className="max-w-xs rounded-xl border" style={{ borderColor: "var(--mairo-line)" }} />
          <BackLink onClick={back} />
        </div>
      ) : plan.adChoice === "video" && plan.video ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote blob URL */}
          <img src={plan.video.posterUrl} alt="Your video" className="max-w-xs rounded-xl border" style={{ borderColor: "var(--mairo-line)" }} />
          <p className="text-[12.5px] text-muted">
            {plan.video.name} · {plan.video.width}×{plan.video.height} · {plan.video.durationSec}s
          </p>
          <BackLink onClick={back} />
        </div>
      ) : plan.adChoice === "images" ? (
        <div className="space-y-4">
          <ImageUpload
            organizationId={studio.organizationId}
            images={plan.images ?? []}
            onChange={(images) => update({ images })}
          />
          <BackLink onClick={back} />
        </div>
      ) : plan.adChoice === "video" ? (
        <div className="space-y-4">
          <VideoUpload
            organizationId={studio.organizationId}
            forTikTok={plan.service !== "meta"}
            onUploaded={(video) => update({ adChoice: "video", video, ...RESET_WORDS })}
          />
          <BackLink onClick={back} />
        </div>
      ) : plan.adChoice === "generate" ? (
        studioFor("generate")
      ) : plan.adChoice === "upload" ? (
        studioFor("upload")
      ) : plan.adChoice === "FACEBOOK_POST" || plan.adChoice === "INSTAGRAM_POST" ? (
        <div className="space-y-4">
          <p className="text-[13px] text-white">
            {plan.adChoice === "FACEBOOK_POST" ? "Choose which Facebook post you'd like to advertise." : "Choose which Instagram post you'd like to advertise."}
          </p>
          <PostPicker
            posts={posts[plan.adChoice] ?? null}
            error={postError}
            loading={loading}
            selectedId={plan.selectedPost?.id ?? null}
            onSelect={(selectedPost) => update({ selectedPost })}
            emptyText={plan.adChoice === "FACEBOOK_POST" ? "There are no posts with a picture on your Page yet." : "There are no posts on your Instagram yet."}
          />
          <Note>
            The post runs exactly as it is, keeping its likes and comments. Its picture and words can&rsquo;t be edited
            in the ad — to change them, make a new ad instead.
          </Note>
          <BackLink onClick={back} />
        </div>
      ) : plan.adChoice === "EXISTING_AD" ? (
        <div className="space-y-4">
          <p className="text-[13px] text-white">Choose which of your ads to run in this campaign.</p>
          <ExistingAdPicker
            ads={accountAds}
            error={adsError}
            loading={loading}
            selectedId={plan.existingAd?.id ?? null}
            onSelect={(ad) =>
              update({ existingAd: { id: ad.id, name: ad.name, thumbnailUrl: ad.thumbnailUrl, headline: ad.headline, body: ad.body } })
            }
          />
          {!accountAds && !adsError && !loading && (
            <button type="button" onClick={chooseExistingAd} className="text-[12.5px] text-muted underline underline-offset-4 hover:text-white">
              Load my ads
            </button>
          )}
          <Note>
            It runs exactly as it was made — picture, words and button. The original ad isn&rsquo;t changed or paused.
          </Note>
          <BackLink onClick={back} />
        </div>
      ) : menu === "posts" && !metaConnected ? (
        <div className="space-y-4">
          <div className="rounded-xl border p-5" style={{ borderColor: "rgba(108,158,255,0.35)", background: "rgba(61,125,255,0.05)" }}>
            <p className="text-[14px] text-white">First, connect your Facebook &amp; Instagram</p>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
              Your posts live on your Facebook Page and Instagram account, so MAIRO needs your permission to see them. Your
              campaign so far is saved — you&rsquo;ll come straight back here to pick the post.
            </p>
            <button type="button" onClick={onConnectMeta}
              className="mt-4 rounded-full px-5 py-2.5 text-[13px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}>
              Connect Facebook &amp; Instagram →
            </button>
          </div>
          <BackLink onClick={() => setMenu("main")} />
        </div>
      ) : menu === "posts" ? (
        <div className="space-y-4">
          <p className="text-[13px] text-white">Which post would you like to use?</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice selected={false} onClick={() => choosePosts("FACEBOOK_POST")} label="A Facebook post" sub="From your Facebook Page" />
            <Choice selected={false} onClick={() => choosePosts("INSTAGRAM_POST")} label="An Instagram post" sub="From the Instagram account linked to your Page" />
            {metaOnly && (
              <Choice selected={false} onClick={chooseExistingAd} label="An ad I've run before" sub="From your Meta ad account" />
            )}
          </div>
          <BackLink onClick={() => setMenu("main")} />
        </div>
      ) : menu === "upload" ? (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {studio.storageReady && (
              <Choice selected={false} onClick={() => update({ adChoice: "images", images: [], ...RESET_WORDS })}
                label="Pictures" sub="JPG or PNG, up to 5 — each runs as its own ad. No credits used." />
            )}
            {metaOnly && studio.storageReady && (
              <Choice selected={false} onClick={() => update({ adChoice: "video", video: null, ...RESET_WORDS })} label="A video" sub="MP4 or MOV, checked against Meta's rules before it uploads" />
            )}
          </div>
          <BackLink onClick={() => setMenu("main")} />
        </div>
      ) : videoOnly ? (
        // TikTok is a video platform: its ads are videos, so a campaign that
        // runs there needs one. The same video runs on Meta too.
        <div className="space-y-4">
          <Note>
            TikTok only runs video ads, so this campaign needs a video{plan.service === "multi" ? " — the same one runs on Facebook and Instagram too" : ""}.
            Vertical (9:16), 9–30 seconds, with the point in the first three seconds works best.
          </Note>
          {studio.storageReady ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Choice selected={false} onClick={() => update({ adChoice: "video", video: null, ...RESET_WORDS })}
                label="Upload a video" sub="MP4 or MOV, checked against TikTok's and Meta's rules before it uploads" />
            </div>
          ) : (
            <p className="text-[12.5px] text-faint">Video uploads need file storage, which isn&rsquo;t switched on for this deployment yet.</p>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {studio.configured && (
            <Choice selected={false} onClick={() => update({ adChoice: "generate", ...RESET_WORDS })}
              label="Create an Ad With AI" sub="Let Mairo create a professional advertisement for your business" />
          )}
          {studio.storageReady && (
            <Choice selected={false} onClick={() => setMenu("upload")}
              label="Upload My Own Advertisement" sub="Pictures or a video you already have — MAIRO suggests the words" />
          )}
          {usesMeta && (
            <Choice selected={false} onClick={() => setMenu("posts")}
              label={metaOnly ? "Use an Existing Post or Ad" : "Use an Existing Instagram or Facebook Post"}
              sub={metaOnly ? "Promote a post, or run an ad you've made before" : "Promote something you've already posted"} />
          )}
          <Choice selected={plan.adChoice === "later"} onClick={() => update({ adChoice: "later", ...RESET_WORDS })}
            label={`Let ${studio.assistantName} handle it later`} sub="Build the campaign now and approve an ad afterwards" />
        </div>
      )}

      {hasOwnWords(plan) && (plan.adChoice !== "video" || plan.video) && (plan.adChoice !== "images" || (plan.images ?? []).length > 0) && (
        <CopyEditor plan={plan} update={update} assistantName={studio.assistantName} />
      )}

      {!studio.configured && !videoOnly && plan.adChoice === "none" && menu === "main" && (
        <p className="mt-4 text-[12px] text-faint">Making an ad with AI needs AI Creative Studio, which isn&rsquo;t switched on for this deployment yet.</p>
      )}
    </Question>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[12.5px] text-muted underline underline-offset-4 hover:text-white">
      Choose a different kind of ad
    </button>
  );
}
