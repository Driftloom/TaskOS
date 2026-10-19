import { LandingHeader } from './components/LandingHeader';
import { LandingHero } from './components/LandingHero';
import { LandingBentoGrid } from './components/LandingBentoGrid';
import { LandingPhilosophy } from './components/LandingPhilosophy';
import { LandingFooter } from './components/LandingFooter';
import { AmbientCosmicStream3D } from './components/AmbientCosmicStream3D';

export function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-background text-foreground noise overflow-x-hidden selection:bg-primary/20 selection:text-primary-text">
      {/* Persistent End-to-End Ambient 3D Cosmic Particle Stream */}
      <AmbientCosmicStream3D />
      {/* Background Ambience Glows */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[600px] rounded-full bg-primary/[0.06] blur-[140px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-[40%] right-[-100px] size-[400px] rounded-full bg-primary/[0.04] blur-[120px]"
        aria-hidden="true"
      />

      {/* Floating Glass Navigation Header */}
      <LandingHeader />

      {/* Main Content Sections */}
      <main id="main-content" role="main" className="flex-1 flex flex-col">
        <LandingHero />
        <LandingBentoGrid />
        <LandingPhilosophy />
      </main>

      {/* Footer & Final Call to Action */}
      <LandingFooter />
    </div>
  );
}
