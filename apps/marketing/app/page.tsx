import { Nav } from "./sections/Nav";
import { Hero } from "./sections/Hero";
import { TrustStrip } from "./sections/TrustStrip";
import { OneSurface } from "./sections/OneSurface";
import { Loop } from "./sections/Loop";
import { Features } from "./sections/Features";
import { ForestBand } from "./sections/ForestBand";
import { Triad } from "./sections/Triad";
import { EverythingElse } from "./sections/EverythingElse";
import { Integrations } from "./sections/Integrations";
import { OpenSource } from "./sections/OpenSource";
import { Comparison } from "./sections/Comparison";
import { FAQ } from "./sections/FAQ";
import { FinalCTA } from "./sections/FinalCTA";
import { Footer } from "./sections/Footer";

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <OneSurface />
        <Loop />
        <Features />
        <ForestBand />
        <Triad />
        <EverythingElse />
        <Integrations />
        <OpenSource />
        <Comparison />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

