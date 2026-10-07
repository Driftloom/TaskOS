import { useState } from 'react';
import { Link } from 'wouter';
import {
  Download,
  Smartphone,
  Globe,
  CheckCircle2,
  ShieldCheck,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { APP_VERSION_INFO } from '@/lib/version-info';

export function DownloadPage() {
  const [showSteps, setShowSteps] = useState(false);

  return (
    <main
      id="main-content"
      role="main"
      className="min-h-screen bg-background text-foreground antialiased selection:bg-accent/20"
    >
      {/* Top Navigation */}
      <header className="border-b border-border-control/60 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            onClick={() => soundFX.playClick()}
            className="flex items-center gap-2 text-caption font-semibold text-muted-foreground hover:text-foreground transition-colors tap-target-expand"
          >
            <ArrowLeft className="size-3.5" />
            <span>Back to Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-caption font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Cadence Task OS
            </span>
            <span className="text-caption font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
              v{APP_VERSION_INFO.version}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16 space-y-10">
        {/* Header Hero */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary-text text-caption font-medium">
            <Sparkles className="size-3.5 text-primary-text" />
            <span>Mobile Release Available</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Get Cadence on your devices
          </h1>
          <p className="text-sm sm:text-callout text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Fast capture, offline-capable calendar, haptic focus timers, and intelligent auto-reschedule — right in your pocket.
          </p>
        </div>

        {/* Primary Download Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Android APK Card */}
          <div className="card-enterprise rounded-2xl border-2 border-primary/40 bg-card p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary-text border border-primary/25 shadow-md">
                  <Smartphone className="size-6" />
                </div>
                <span className="font-mono text-caption px-2.5 py-1 rounded-lg bg-status-success/15 text-status-success-text border border-status-success/20 font-semibold">
                  Official APK
                </span>
              </div>

              <div>
                <h2 className="text-lg font-bold text-foreground">Android Package (APK)</h2>
                <p className="text-caption text-muted-foreground mt-1 leading-relaxed">
                  Standalone Android application with native fullscreen display, hardware back-button handling, and fast launch.
                </p>
              </div>

              <div className="space-y-2 py-2">
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Version: <strong>{APP_VERSION_INFO.version} (Build {APP_VERSION_INFO.versionCode})</strong></span>
                </div>
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Package: <code className="font-mono text-caption">app.cadence.taskos</code></span>
                </div>
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>File Size: <strong>1.21 MB</strong></span>
                </div>
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Digital Asset Links verified (No browser bar)</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-3">
              <a
                href="/cadence.apk"
                download="cadence.apk"
                onClick={() => soundFX.playCompletion()}
                data-testid="button-download-apk"
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-[0.98] tap-target-expand"
              >
                <Download className="size-4" />
                <span>Download APK (1.2 MB)</span>
              </a>

              <button
                type="button"
                onClick={() => setShowSteps(!showSteps)}
                className="w-full flex items-center justify-center gap-1.5 text-caption text-muted-foreground hover:text-foreground transition-colors py-1 tap-target-expand"
              >
                <HelpCircle className="size-3.5" />
                <span>{showSteps ? 'Hide' : 'How to install this APK?'}</span>
              </button>

              {showSteps && (
                <div className="p-3.5 rounded-xl bg-muted/60 border border-border-control text-caption space-y-2 animate-enter">
                  <p className="font-semibold text-foreground">Android Installation Steps:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground leading-relaxed pl-1">
                    <li>Tap the download button above to get <code className="font-mono text-caption">cadence.apk</code>.</li>
                    <li>Open the downloaded file from your browser downloads or Files app.</li>
                    <li>If prompted, toggle <strong>Allow from this source</strong> in Android Settings.</li>
                    <li>Tap <strong>Install</strong> and open Cadence!</li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          {/* Progressive Web App Card (iOS & Desktop) */}
          <div className="card-enterprise rounded-2xl border border-border-control bg-card p-6 shadow-xl flex flex-col justify-between relative overflow-hidden group">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="grid size-12 place-items-center rounded-2xl bg-ai/15 text-ai-text border border-ai/25 shadow-md">
                  <Globe className="size-6" />
                </div>
                <span className="font-mono text-caption px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border-control font-semibold">
                  Web & iOS
                </span>
              </div>

              <div>
                <h2 className="text-lg font-bold text-foreground">Progressive Web App</h2>
                <p className="text-caption text-muted-foreground mt-1 leading-relaxed">
                  Install instantly on iPhone, iPad, Mac, Windows, and Linux without downloading any APK file.
                </p>
              </div>

              <div className="space-y-2 py-2">
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Instant updates directly from cloud</span>
                </div>
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Works offline with Service Worker caching</span>
                </div>
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Home screen launcher icon & full screen</span>
                </div>
                <div className="flex items-center gap-2 text-caption text-foreground/90">
                  <CheckCircle2 className="size-3.5 text-status-success-text shrink-0" />
                  <span>Zero storage overhead</span>
                </div>
              </div>
            </div>

            <div className="pt-6 space-y-3">
              <Link
                href="/today"
                onClick={() => soundFX.playClick()}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-border-control bg-card/[0.04] hover:bg-card/[0.08] hover:border-border-control text-foreground font-semibold text-sm transition-all active:scale-[0.98] tap-target-expand"
              >
                <span>Launch Web Application</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>

              <div className="p-3 rounded-xl bg-muted/40 border border-border-control text-caption text-muted-foreground leading-relaxed">
                <strong>iPhone/iOS Tip:</strong> Open in Safari, tap the <strong>Share</strong> button (box with arrow), and select <strong>Add to Home Screen</strong>.
              </div>
            </div>
          </div>
        </div>

        {/* Security & Integrity Note */}
        <div className="flex items-start sm:items-center gap-3.5 p-4 rounded-2xl bg-card border border-border-control text-caption text-muted-foreground shadow-sm">
          <ShieldCheck className="size-5 text-status-success-text shrink-0 mt-0.5 sm:mt-0" />
          <div className="leading-relaxed">
            <span className="font-semibold text-foreground">Verified & Safe: </span>
            The APK is signed with Cadence's dedicated production keystore and communicates directly with our encrypted API backend.
          </div>
        </div>
      </div>
    </main>
  );
}

export default DownloadPage;
