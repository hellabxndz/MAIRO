"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { RenderedMedia } from "@/lib/demo/media";

// Loads the walkthrough player only as it nears the screen, so the landing
// page's first load carries none of it. Until then: the same box, with the
// rendered poster when there is one.

const Player = dynamic(() => import("./walkthrough-player").then((m) => m.WalkthroughPlayer), { ssr: false, loading: () => null });

export function LazyWalkthrough({ media }: { media: Pick<RenderedMedia, "walkthrough" | "captions"> }) {
  const [load, setLoad] = useState(false);
  const spot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = spot.current;
    if (!el || load) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLoad(true), { rootMargin: "400px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [load]);
  if (load) return <Player media={media} />;
  const poster = media.walkthrough.wide?.poster;
  const narrowPoster = media.walkthrough.narrow?.poster ?? poster;
  return (
    <div ref={spot} data-palette="classic" className="relative aspect-[760/560] w-full overflow-hidden rounded-[22px] border border-white/10 bg-[#05060d] max-[591px]:aspect-[360/600]">
      {poster && (
        <picture>
          {narrowPoster && <source media="(max-width: 591px)" srcSet={narrowPoster} />}
          <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" loading="lazy" decoding="async" />
        </picture>
      )}
      <button type="button" onClick={() => setLoad(true)} className="absolute inset-0 m-auto h-12 w-fit rounded-full bg-white px-5 text-[14px] font-semibold text-[#0b0b18] shadow-lg">
        ▶ Play the walkthrough
      </button>
    </div>
  );
}
