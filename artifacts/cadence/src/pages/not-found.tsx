import { Link } from 'wouter';
import { Compass, ArrowRight } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-black px-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#1C1C1E] p-7 shadow-2xl space-y-5 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/15 text-primary border border-primary/25">
          <Compass className="size-6" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Page Not Found
          </h1>
          <p className="text-xs leading-relaxed text-zinc-400">
            This screen does not exist or may have been moved. Return to your daily dashboard to keep your momentum.
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/today"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xs font-semibold text-black transition-all hover:bg-primary/90 active:scale-[0.98] shadow-md shadow-primary/20"
          >
            <span>Return to Today</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
