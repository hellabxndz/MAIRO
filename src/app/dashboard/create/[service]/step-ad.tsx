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
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
  studio: StudioProps;
}) {
  const [posts, setPosts] = useState<Partial<Record<"FACEBOOK_POST" | "INSTAGRAM_POST", PagePost[]>>>({});
  const [postError, setPostError] = useState<string | null>(null);
  const [accountAds, setAccountAds] = useState<AccountAd[] | null>(null);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [menu, setMenu] = useState<"main" | "posts" | "upload">("main");
  const usesMeta = plan.service !== "tiktok";
  // Videos and existing ads are Meta ads; a two-network campaign can't run
  // them on TikTok, so they're offered on Meta campaigns only.
  const metaOnly = plan.service === "meta";

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
      ) : plan.adChoice === "video" ? (
        <div className="space-y-4">
          <VideoUpload
            organizationId={studio.organizationId}
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
      ) : menu === "posts" ? (
        <div className="space-y-4">
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
            {studio.configured && (
              <Choice selected={false} onClick={() => update({ adChoice: "upload", ...RESET_WORDS })} label="A picture" sub="JPG or PNG — Mairo sizes it for each placement" />
            )}
            {metaOnly && studio.storageReady && (
              <Choice selected={false} onClick={() => update({ adChoice: "video", video: null, ...RESET_WORDS })} label="A video" sub="MP4 or MOV, checked against Meta's rules before it uploads" />
            )}
          </div>
          <BackLink onClick={() => setMenu("main")} />
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {studio.configured && (
            <Choice selected={false} onClick={() => update({ adChoice: "generate", ...RESET_WORDS })}
              label="Create an Ad With AI" sub="Let Mairo create a professional advertisement for your business" />
          )}
          {(studio.configured || (metaOnly && studio.storageReady)) && (
            <Choice selected={false} onClick={() => setMenu("upload")}
              label="Upload My Own Advertisement" sub="A picture or a video you already have" />
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

      {hasOwnWords(plan) && (plan.adChoice !== "video" || plan.video) && (
        <CopyEditor plan={plan} update={update} assistantName={studio.assistantName} />
      )}

      {!studio.configured && plan.adChoice === "none" && menu === "main" && (
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
