import { useEffect, useState } from 'react';
import {
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Send,
  Eye,
  EyeOff,
  QrCode,
  Check,
  Bell,
  Mail,
  Sparkles,
  ArrowUpRight,
  Clock,
  Radio,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { soundFX } from '@/lib/sound-fx';
import {
  ChannelStatus,
  type ChannelState,
} from '@/components/settings/SettingsPrimitives';
import {
  useGetIntegrationsStatus,
  useConnectTelegram,
  useSendTelegramTestMessage,
  useTestHealthcheckPing,
  useSaveHealthcheckSettings,
  getTelegramPairingToken,
  getTelegramPairingStatus,
  type PairingToken,
} from '@workspace/api-client-react';

type ActiveChannel = 'telegram' | 'healthchecks' | 'webpush' | 'email';

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message) || fallback;
  }
  return fallback;
}

/**
 * P11.1 ChannelStatus replaces the hand-rolled status pills and the colour-only
 * status dots this view used to declare inline. Every state is now icon + text
 * label + semantic colour (P6.3), and the Telegram link-code (QR) flow is the
 * ChannelStatus action so it sits beside the state it changes.
 */
function telegramState(configured: boolean | undefined, lastError: string | null): ChannelState {
  if (lastError) return 'failed';
  if (!configured) return 'unverified';
  return 'connected';
}

function healthchecksState(configured: boolean | undefined): ChannelState {
  return configured ? 'connected' : 'unverified';
}

export function MessagingIntegrationsView() {
  const [activeChannel, setActiveChannel] = useState<ActiveChannel>('telegram');
  const [dispatchLatency, setDispatchLatency] = useState<number | null>(null);
  const [rescheduleLatency, setRescheduleLatency] = useState<number | null>(null);

  // Form states
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [dispatchPingUrl, setDispatchPingUrl] = useState('');
  const [reschedulePingUrl, setReschedulePingUrl] = useState('');

  // All of this used to be hand-rolled `fetch` with locally re-declared
  // response interfaces, so the client contract could drift from the server
  // silently. It now uses the generated hooks.
  const { data: status, isLoading: loading, refetch: fetchStatus } = useGetIntegrationsStatus();
  const connectTelegram = useConnectTelegram();
  const sendTestNudge = useSendTelegramTestMessage();
  const testPing = useTestHealthcheckPing();
  const saveHealthchecks = useSaveHealthcheckSettings();

  // Seed the form from the server once it arrives.
  useEffect(() => {
    if (!status) return;
    if (status.telegram.chatId) setTelegramChatId(status.telegram.chatId);
    if (status.healthchecks.dispatchPingUrl) {
      setDispatchPingUrl(status.healthchecks.dispatchPingUrl);
    }
    if (status.healthchecks.reschedulePingUrl) {
      setReschedulePingUrl(status.healthchecks.reschedulePingUrl);
    }
  }, [status]);

  // QR Pairing Modal state (Hermes Flow)
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrData, setQrData] = useState<PairingToken | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrConfirmed, setQrConfirmed] = useState(false);
  const [qrChatId, setQrChatId] = useState<string | null>(null);

  const handleOpenQrModal = () => {
    soundFX.playClick();
    setQrModalOpen(true);
    setQrLoading(true);
    setQrConfirmed(false);
    setQrChatId(null);
    setQrError(null);

    // The pairing token is minted on demand, so it is a command rather than a
    // query. It is called through the generated client so the response shape
    // stays tied to the contract.
    getTelegramPairingToken()
      .then((data) => setQrData(data))
      .catch((err) => setQrError(errorMessage(err, 'Could not create a pairing link')))
      .finally(() => setQrLoading(false));
  };

  // Poll for QR scan & confirmation in Telegram.
  useEffect(() => {
    if (!qrModalOpen || !qrData?.token || qrConfirmed) return;

    const interval = setInterval(async () => {
      try {
        const data = await getTelegramPairingStatus({ token: qrData.token });
        if (data.status === 'confirmed') {
          setQrConfirmed(true);
          setQrChatId(data.chatId ?? null);
          soundFX.playCompletion();
          toast.success(`Linked to Telegram chat ID ${data.chatId}`);
          fetchStatus();
          setTimeout(() => setQrModalOpen(false), 2500);
        }
      } catch {
        // Polling is best-effort; the next tick retries.
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [qrModalOpen, qrData?.token, qrConfirmed, fetchStatus]);

  const handleConnectTelegram = () => {
    if (!botToken.trim()) {
      toast.error('Please enter your Telegram Bot Token from @BotFather.');
      return;
    }
    soundFX.playClick();
    connectTelegram.mutate(
      {
        data: {
          botToken: botToken.trim(),
          telegramChatId: telegramChatId.trim() || null,
        },
      },
      {
        onSuccess: (data) => {
          soundFX.playCompletion();
          toast.success(data.message || 'Telegram bot connected and webhook registered!');
          setBotToken('');
          fetchStatus();
        },
        onError: (err) =>
          toast.error(errorMessage(err, 'Error connecting to Telegram.')),
      },
    );
  };

  const handleSendTestNudge = () => {
    soundFX.playClick();
    sendTestNudge.mutate(undefined, {
      onSuccess: () => {
        soundFX.playCompletion();
        toast.success('Test message sent to Telegram! Check your phone.');
      },
      onError: (err) =>
        toast.error(errorMessage(err, 'Failed to send test nudge.')),
    });
  };

  const handleTestPing = (url: string, type: 'dispatch' | 'reschedule') => {
    if (!url.trim()) {
      toast.error('Please enter a valid ping URL first.');
      return;
    }
    soundFX.playClick();
    testPing.mutate(
      { data: { url: url.trim() } },
      {
        onSuccess: (data) => {
          if (type === 'dispatch') setDispatchLatency(data.latencyMs);
          else setRescheduleLatency(data.latencyMs);
          soundFX.playCompletion();
          toast.success(`Ping verified! Response in ${data.latencyMs}ms`);
        },
        onError: (err) => toast.error(errorMessage(err, 'Ping failed.')),
      },
    );
  };

  const handleSaveHealthchecks = () => {
    soundFX.playClick();
    saveHealthchecks.mutate(
      {
        data: {
          dispatchPingUrl: dispatchPingUrl.trim() || null,
          reschedulePingUrl: reschedulePingUrl.trim() || null,
        },
      },
      {
        onSuccess: () => {
          soundFX.playCompletion();
          toast.success('Healthchecks watchdog URLs saved!');
          fetchStatus();
        },
        onError: (err) =>
          toast.error(errorMessage(err, 'Failed to save healthchecks.')),
      },
    );
  };

  const connecting = connectTelegram.isPending;
  const testingMessage = sendTestNudge.isPending;
  const testingDispatch = testPing.isPending;
  const testingReschedule = testPing.isPending;
  const savingHealthchecks = saveHealthchecks.isPending;

  const isTgConnected = status?.telegram.configured;
  const tgState = telegramState(status?.telegram.configured, status?.telegram.lastErrorMessage ?? null);
  const hcState = healthchecksState(status?.healthchecks.configured);

  return (
    <div className="rounded-2xl border border-border-control bg-muted overflow-hidden shadow-2xl">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border-control px-6 py-5 bg-card/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-surface text-on-accent shadow-e2">
            <Radio size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              Messaging & Gateways
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded-full bg-card/10 text-muted-foreground font-semibold">
                Hermes Engine
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Configure two-way mobile capture, conversational commands, and automated cron watchdogs.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchStatus()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-border-control bg-card/[0.04] px-3 py-1.5 text-xs text-muted-foreground hover:bg-card/10 hover:text-foreground transition-all"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
        {/* Left Sidebar (Channels) */}
        <div className="lg:col-span-4 border-r border-border-control bg-card/50 p-4 space-y-1.5">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground px-3 py-2 font-bold">
            Active Gateways
          </p>

          {/* Telegram Channel Item */}
          <button
            onClick={() => setActiveChannel('telegram')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'telegram'
                ? 'bg-muted text-foreground border border-border-control2] shadow-md'
                : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <MessageSquare size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Telegram
                  <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-accent/20 text-accent font-normal">
                    Primary
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">Two-way Nudges & Commands</div>
              </div>
            </div>

            <ChannelStatus kind="telegram" state={tgState} compact />
          </button>

          {/* Healthchecks.io Watchdog Item */}
          <button
            onClick={() => setActiveChannel('healthchecks')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'healthchecks'
                ? 'bg-muted text-foreground border border-border-control2] shadow-md'
                : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-success/15 text-status-success-text">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Healthchecks.io
                  <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-success/20 text-status-success-text font-normal">
                    Watchdog
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">pg_cron Dead-Man's Switch</div>
              </div>
            </div>

            <ChannelStatus kind="watchdog" state={hcState} compact />
          </button>

          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground px-3 pt-5 pb-2 font-bold">
            Secondary & Fallbacks
          </p>

          {/* Web Push */}
          <button
            onClick={() => setActiveChannel('webpush')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'webpush'
                ? 'bg-muted text-foreground border border-border-control2] shadow-md'
                : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-ai/15 text-ai-text">
                <Bell size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground">Web Push (VAPID)</div>
                <div className="text-xs text-muted-foreground">Desktop & PWA Banner Alerts</div>
              </div>
            </div>
            <ChannelStatus kind="push" state="unavailable" compact className="px-2 py-0.5" />
          </button>

          {/* Email Digest */}
          <button
            onClick={() => setActiveChannel('email')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'email'
                ? 'bg-muted text-foreground border border-border-control2] shadow-md'
                : 'text-muted-foreground hover:bg-card/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary-text">
                <Mail size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground">Email Digest</div>
                <div className="text-xs text-muted-foreground">Nightly Catch-Up & Summary</div>
              </div>
            </div>
            <ChannelStatus kind="email" state="unavailable" compact />
          </button>

          {/* Coming Soon Hermes channels */}
          <div className="pt-3 px-3">
            <p className="text-xs text-muted-foreground font-mono">
              Planned Hermes Gateways:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Discord', 'Slack', 'WhatsApp', 'Matrix', 'Signal', 'iMessage'].map((name) => (
                <span
                  key={name}
                  className="text-xs px-2 py-0.5 rounded-lg bg-card/[0.03] text-muted-foreground border border-border-control"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="lg:col-span-8 p-6 lg:p-8 space-y-6">
          {activeChannel === 'telegram' && (
            <div className="space-y-6 animate-enter">
              {/* Channel status + the link-code flow that changes it (P11.1:
                  "Icon + text; the link-code flow lives here"). */}
              <ChannelStatus
                kind="telegram"
                state={tgState}
                announce
                detail={
                  status?.telegram.lastErrorMessage
                    ? `Last webhook error: ${status.telegram.lastErrorMessage}`
                    : 'Send commands to Cadence from Telegram: done <id>, snooze <id> 1h, undo, list.'
                }
                action={{ label: 'Link with QR', onClick: handleOpenQrModal, busy: qrLoading }}
                secondaryAction={
                  isTgConnected
                    ? { label: 'Send test nudge', onClick: handleSendTestNudge, busy: testingMessage }
                    : undefined
                }
              />

              {status?.telegram.source && status.telegram.source !== 'none' ? (
                <p className="-mt-4 font-mono text-caption text-muted-foreground">
                  Credentials source: {status.telegram.source}
                </p>
              ) : null}

              {/* QUICK SETUP (Hermes Style) */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-status-success-text" aria-hidden="true" />
                    <h4 className="text-caption font-bold uppercase tracking-wider text-foreground">
                      Quick setup
                    </h4>
                    <span className="rounded bg-success/20 px-1.5 py-0.2 font-mono text-caption font-semibold uppercase text-status-success-text">
                      Recommended
                    </span>
                  </div>
                </div>

                <p className="text-caption leading-relaxed text-muted-foreground">
                  Scan a QR code and confirm in Telegram. Cadence pairs with the bot and detects your
                  Telegram user ID automatically.
                </p>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleOpenQrModal}
                    data-testid="button-open-telegram-pairing"
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-control bg-card px-4 text-caption font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    <QrCode size={16} aria-hidden="true" />
                    <span>Create pairing code</span>
                  </button>
                </div>
              </div>

              {/* GET YOUR CREDENTIALS */}
              <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground font-bold">
                  Get Your Credentials
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  In Telegram, talk to <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-semibold">@BotFather</a>, run <code className="text-foreground font-mono">/newbot</code>, and copy the token it gives you. Then grab your numeric user ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline font-semibold">@userinfobot</a>.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border-control bg-card/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-card/10 transition-all"
                  >
                    <span>Open @BotFather</span>
                    <ArrowUpRight size={12} />
                  </a>

                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border-control bg-card/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-card/10 transition-all"
                  >
                    <span>Open @userinfobot</span>
                    <ExternalLink size={12} />
                  </a>

                  {status?.telegram.botUsername && (
                    <a
                      href={`https://t.me/${status.telegram.botUsername}?start=cadence`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-bold text-status-success-text hover:bg-success/20 transition-all"
                    >
                      <span>Open Bot (@{status.telegram.botUsername})</span>
                      <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              </div>

              {/* Bot Credentials Form */}
              <div className="space-y-4 rounded-2xl border border-border-control bg-card p-5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
                  Credentials & Linking
                </h4>

                {/* Bot Token Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      Telegram Bot Token
                      <span className="text-xs text-destructive font-mono">*REQUIRED</span>
                    </label>
                    <span className="text-xs text-muted-foreground">From @BotFather</span>
                  </div>

                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder={
                        isTgConnected
                          ? '••••••••••••••••••••••••••••••••••••••••••••••••'
                          : 'Paste Telegram bot token (e.g. 7123456789:AAFn...)'
                      }
                      className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] pl-3.5 pr-10 text-sm font-mono outline-none focus:border-accent text-foreground transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Entering a new token and clicking Save will <strong className="text-foreground">automatically register the webhook</strong> via Telegram's API without running any curl commands.
                  </p>
                </div>

                {/* Allowed User ID / Chat ID Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      Allowed Telegram User ID / Chat ID
                      <span className="text-xs text-accent font-mono">RECOMMENDED</span>
                    </label>
                    <span className="text-xs text-muted-foreground">From @userinfobot</span>
                  </div>

                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="e.g. 123456789"
                    className="h-11 w-full rounded-xl border border-border-control bg-card/[0.04] px-3.5 text-sm font-mono outline-none focus:border-accent text-foreground transition-all"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Restricts two-way agent commands to your numeric user ID so unauthorized accounts cannot trigger actions.
                  </p>
                </div>

                {/* Webhook Status Info Box */}
                {status?.telegram.webhookUrl && (
                  <div className="rounded-xl border border-border-control bg-background/40 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Registered Webhook URL:</span>
                      <code className="text-foreground font-mono text-xs">
                        {status.telegram.webhookUrl}
                      </code>
                    </div>
                    {(status.telegram.pendingUpdateCount ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Pending updates:</span>
                        <span className="font-mono text-foreground">
                          {status.telegram.pendingUpdateCount}
                        </span>
                      </div>
                    )}
                    {status.telegram.lastErrorMessage && (
                      <div className="text-destructive text-xs pt-1">
                        Last webhook error: {status.telegram.lastErrorMessage}
                      </div>
                    )}
                  </div>
                )}

                {/* Save & Connect Button */}
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleConnectTelegram}
                    disabled={connecting}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:brightness-110 shadow-lg shadow-orange-500/20 transition-all"
                  >
                    {connecting ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Verifying & Registering Webhook...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Save & Auto-Register Webhook</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeChannel === 'healthchecks' && (
            <div className="space-y-6 animate-enter">
              <ChannelStatus
                kind="watchdog"
                state={hcState}
                announce
                detail="Dead-man's-switch monitoring for your background pg_cron sweeps. Cadence pings these URLs after each successful run. If a run stops, Healthchecks alerts you."
              />

              {/* Check 1: Dispatch Sweep */}
              <div className="rounded-2xl border border-border-control bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-accent" />
                    <h4 className="text-xs font-bold text-foreground">
                      Reminder Dispatch Ping URL
                    </h4>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent/15 text-accent">
                      Every 5 minutes
                    </span>
                  </div>

                  {dispatchLatency !== null && (
                    <span className="text-xs font-mono text-status-success-text flex items-center gap-1">
                      <Check size={12} /> {dispatchLatency}ms
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Create a check with period <strong className="text-foreground">5 min</strong> and grace <strong className="text-foreground">5 min</strong> in Healthchecks.io.
                </p>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={dispatchPingUrl}
                    onChange={(e) => setDispatchPingUrl(e.target.value)}
                    placeholder="https://hc-ping.com/your-uuid-here"
                    className="h-11 flex-1 rounded-xl border border-border-control bg-card/[0.04] px-3.5 text-sm font-mono outline-none focus:border-accent text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestPing(dispatchPingUrl, 'dispatch')}
                    disabled={testingDispatch || !dispatchPingUrl}
                    className="rounded-xl border border-border-control bg-card/[0.06] px-4 text-xs font-bold text-foreground hover:bg-card/10 transition-all disabled:opacity-40"
                  >
                    {testingDispatch ? 'Testing...' : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* Check 2: Reschedule Sweep */}
              <div className="rounded-2xl border border-border-control bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-primary-text" />
                    <h4 className="text-xs font-bold text-foreground">
                      Reschedule Sweep Ping URL
                    </h4>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/15 text-primary-text">
                      Hourly (:00)
                    </span>
                  </div>

                  {rescheduleLatency !== null && (
                    <span className="text-xs font-mono text-status-success-text flex items-center gap-1">
                      <Check size={12} /> {rescheduleLatency}ms
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  Create a check with period <strong className="text-foreground">1 hour</strong> and grace <strong className="text-foreground">15 min</strong> in Healthchecks.io.
                </p>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={reschedulePingUrl}
                    onChange={(e) => setReschedulePingUrl(e.target.value)}
                    placeholder="https://hc-ping.com/your-uuid-here"
                    className="h-11 flex-1 rounded-xl border border-border-control bg-card/[0.04] px-3.5 text-sm font-mono outline-none focus:border-accent text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestPing(reschedulePingUrl, 'reschedule')}
                    disabled={testingReschedule || !reschedulePingUrl}
                    className="rounded-xl border border-border-control bg-card/[0.06] px-4 text-xs font-bold text-foreground hover:bg-card/10 transition-all disabled:opacity-40"
                  >
                    {testingReschedule ? 'Testing...' : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* Save Healthchecks Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveHealthchecks}
                  disabled={savingHealthchecks}
                  className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:brightness-110 shadow-lg shadow-orange-500/20 transition-all"
                >
                  {savingHealthchecks ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save Watchdog URLs</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeChannel === 'webpush' && (
            <div className="space-y-4 animate-enter">
              <ChannelStatus
                kind="push"
                state="unavailable"
                announce
                detail="A service worker is registered for offline caching, but there is no web-push delivery path in this build. Reminders go out over Telegram, which is the primary channel (locked decision D-15)."
              />
            </div>
          )}

          {activeChannel === 'email' && (
            <div className="space-y-4 animate-enter">
              <ChannelStatus
                kind="email"
                state="unavailable"
                announce
                detail="The nightly catch-up digest is specified but not built. No email is sent, so there is nothing to configure here."
              />
            </div>
          )}
        </div>
      </div>

      {/* QR Code Pairing Modal (Hermes Experience) */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-background/90 backdrop-blur-md overflow-y-auto animate-enter">
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border-t sm:border border-border-control2] bg-muted p-6 pb-safe sm:pb-6 shadow-2xl shadow-black space-y-5 my-0 sm:my-auto">
            {/* Mobile Pull-Down Indicator Grab Bar */}
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-card/25 -mt-2 mb-2" />
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-xl bg-success/15 text-status-success-text">
                  <QrCode size={18} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {qrConfirmed ? 'Connected to Telegram!' : 'Scan with Telegram'}
                </h3>
              </div>
              <button
                onClick={() => setQrModalOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-card/10 hover:text-foreground transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {qrLoading ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw size={24} className="animate-spin mx-auto text-primary-text" />
                <p className="text-xs text-muted-foreground font-mono">Generating secure pairing code...</p>
              </div>
            ) : qrError ? (
              <div className="py-12 text-center space-y-3">
                <AlertTriangle size={24} className="mx-auto text-primary-text" />
                <p className="text-sm font-semibold text-foreground">
                  No pairing link available
                </p>
                <p className="text-xs text-muted-foreground">{qrError}</p>
              </div>
            ) : qrConfirmed ? (
              <div className="py-8 text-center space-y-4 animate-enter">
                <div className="grid size-16 place-items-center rounded-full bg-success/20 text-status-success-text mx-auto shadow-[0_0_30px_rgba(52,199,89,0.4)]">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-foreground">Pairing Verified!</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your Telegram Chat ID <span className="font-mono text-status-success-text font-semibold">{qrChatId}</span> is now linked.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Closing setup automatically...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* QR Code Container (Pure white background for crisp phone scanning) */}
                <div className="bg-card rounded-2xl p-4 flex flex-col items-center justify-center shadow-inner mx-auto max-w-[240px]">
                  {qrData?.qrUrl ? (
                    <img
                      src={qrData.qrUrl}
                      alt="Telegram Pairing QR Code"
                      className="size-48 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="size-48 grid place-items-center text-muted-foreground text-xs font-mono">
                      Loading QR...
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="space-y-2 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-status-success-text">
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2 bg-success"></span>
                    </span>
                    <span>Waiting for scan & confirm...</span>
                  </div>

                  <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 text-left bg-background/30 rounded-xl p-3 border border-border-control">
                    <li>Scan this QR code with your camera or Telegram.</li>
                    <li>Tap <strong>Start</strong> in the chat with <span className="text-foreground font-semibold font-mono">@{qrData?.botUsername}</span>.</li>
                    <li>Cadence detects your user ID automatically!</li>
                  </ol>
                </div>

                {/* Mobile Fallback Button */}
                {qrData?.deepLink && (
                  <div className="pt-1">
                    <a
                      href={qrData.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-foreground hover:brightness-110 shadow-md transition-all"
                    >
                      <span>Open in Telegram directly</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
