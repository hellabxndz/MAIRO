"use client";

import { useState, useTransition } from "react";
import { StudioWorkspace } from "@/components/creative-studio/studio-workspace";
import { loadInstagramPostsAction, loadPagePostsAction } from "@/lib/actions/sales-setup-actions";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import type { PagePost } from "@/lib/campaigns/sales-source";
import type { CreditBalance } from "@/lib/creative-studio/credits";
import type { CreditCosts } from "@/lib/creative-studio/pricing";
import { PostPicker } from "./post-picker";
import { Choice, Note, Question } from "./wizard-parts";

export type StudioProps = {
  assistantName: string;
  configured: boolean;
  creditBalance: CreditBalance;
  costs: CreditCosts;
  mode: "simple" | "advanced";
};

/** Step 5 — the ad itself: made with AI, uploaded, or a post they already have. */
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
  const [loading, startLoading] = useTransition();
  const [choosingPostSource, setChoosingPostSource] = useState(false);
  const usesMeta = plan.service !== "tiktok";
  const back = () => {
    setChoosingPostSource(false);
    update({ adChoice: "none" });
  };

  function choosePosts(source: "FACEBOOK_POST" | "INSTAGRAM_POST") {
    update({ adChoice: source, selectedPost: plan.adChoice === source ? plan.selectedPost : null });
    setPostError(null);
    if (posts[source]) return;
    startLoading(async () => {
      const result = source === "FACEBOOK_POST" ? await loadPagePostsAction() : await loadInstagramPostsAction();
      if (result.ok) setPosts((prev) => ({ ...prev, [source]: result.posts }));
      else setPostError(result.error);
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
        onAttached={(_assetId, imageUrl) => update({ adChoice: "attached", attachedPreview: imageUrl })}
      />
      <BackLink onClick={back} />
    </div>
  );

  return (
    <Question
      title="How would you like to create your advertisement?"
      sub={`Whichever you choose, ${studio.assistantName} writes ad copy from what you told it about the business — never invented discounts or reviews.`}
    >
      {plan.adChoice === "attached" && plan.attachedPreview ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote blob URL, see studio-workspace.tsx */}
          <img src={plan.attachedPreview} alt="Your advertisement" className="max-w-xs rounded-xl border" style={{ borderColor: "var(--mairo-line)" }} />
          <p className="text-[13px] text-live">Ready — {studio.assistantName} wrote the ad copy for it too.</p>
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
      ) : choosingPostSource ? (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice selected={false} onClick={() => choosePosts("FACEBOOK_POST")} label="A Facebook post" sub="From your Facebook Page" />
            <Choice selected={false} onClick={() => choosePosts("INSTAGRAM_POST")} label="An Instagram post" sub="From the Instagram account linked to your Page" />
          </div>
          <BackLink onClick={back} />
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {studio.configured && (
            <Choice selected={false} onClick={() => update({ adChoice: "generate" })}
              label="Create an Ad With AI" sub="Let Mairo create a professional advertisement for your business" />
          )}
          {studio.configured && (
            <Choice selected={false} onClick={() => update({ adChoice: "upload" })}
              label="Upload My Own Advertisement" sub="Already have a picture? Upload it and Mairo turns it into an ad" />
          )}
          {usesMeta && (
            <Choice selected={false} onClick={() => setChoosingPostSource(true)}
              label="Use an Existing Instagram or Facebook Post" sub="Promote something you've already posted" />
          )}
          <Choice selected={plan.adChoice === "later"} onClick={() => update({ adChoice: "later" })}
            label={`Let ${studio.assistantName} handle it later`} sub="Build the campaign now and approve an ad afterwards" />
        </div>
      )}
      {!studio.configured && plan.adChoice === "none" && (
        <p className="mt-4 text-[12px] text-faint">Making or uploading an ad needs AI Creative Studio, which isn&rsquo;t switched on for this deployment yet.</p>
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
