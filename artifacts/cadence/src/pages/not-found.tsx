import { Link } from 'wouter';
import { Compass, ArrowRight } from 'lucide-react';

export default function NotFound() {
  return (
    <main
      id="main-content"
      role="main"
      className="min-h-screen w-full flex items-center justify-center bg-background px-4 text-foreground"
    >
      <div className="w-full max-w-md rounded-lg border border-border-control bg-card p-7 shadow-2xl space-y-5 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/15 text-primary-text border border-primary/25">
          <Compass className="size-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-title3 font-bold tracking-tight text-foreground">
            Page Not Found
          </h1>
          <p className="text-caption leading-relaxed text-muted-foreground">
            This screen does not exist or may have been moved. Return to your daily dashboard to keep your momentum.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/today"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-caption font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] shadow-md shadow-primary/20"
          >
            <span>Return to Today</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </main>
  );
}
