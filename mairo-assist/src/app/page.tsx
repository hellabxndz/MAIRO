import { InteractiveDemo } from "@/components/marketing/demo";
import { Hero } from "@/components/marketing/hero";
import { Faq, Features, FinalCta, HowItWorks, Pricing, WhatIs } from "@/components/marketing/sections";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export default function HomePage() {
  return (
    <div className="galaxy-bg">
      <SiteHeader />
      <main>
        <Hero />
        <WhatIs />
        <Features />
        <HowItWorks />
        <InteractiveDemo />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
