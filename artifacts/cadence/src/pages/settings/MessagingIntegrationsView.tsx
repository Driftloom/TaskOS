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
  Zap,
  Radio,
  Sparkles,
  ArrowUpRight,
  Clock,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { soundFX } from '@/lib/sound-fx';

interface TelegramStatus {
  configured: boolean;
  source: 'env' | 'database' | 'none';
  botUsername: string | null;
  botFirstName: string | null;
  chatId: string | null;
  webhookUrl: string | null;
  pendingUpdateCount: number;
  lastErrorMessage: string | null;
  error: string | null;
  webhookSecretConfigured: boolean;
}

interface HealthchecksStatus {
  configured: boolean;
  dispatchPingUrl: string | null;
  reschedulePingUrl: string | null;
}

interface IntegrationsStatusResponse {
  telegram: TelegramStatus;
  healthchecks: HealthchecksStatus;
}

type ActiveChannel = 'telegram' | 'healthchecks' | 'webpush' | 'email';

export function MessagingIntegrationsView() {
  const [activeChannel, setActiveChannel] = useState<ActiveChannel>('telegram');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testingMessage, setTestingMessage] = useState(false);
  const [testingDispatch, setTestingDispatch] = useState(false);
  const [testingReschedule, setTestingReschedule] = useState(false);
  const [dispatchLatency, setDispatchLatency] = useState<number | null>(null);
  const [rescheduleLatency, setRescheduleLatency] = useState<number | null>(null);

  // Form states
  const [botToken, setBotToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [status, setStatus] = useState<IntegrationsStatusResponse | null>(null);

  const [dispatchPingUrl, setDispatchPingUrl] = useState('');
  const [reschedulePingUrl, setReschedulePingUrl] = useState('');
  const [savingHealthchecks, setSavingHealthchecks] = useState(false);

  // QR Pairing Modal state (Hermes Flow)
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState<{
    token: string;
    botUsername: string;
    deepLink: string;
    qrUrl: string;
    expiresAt: number;
  } | null>(null);
  const [qrConfirmed, setQrConfirmed] = useState(false);
  const [qrChatId, setQrChatId] = useState<string | null>(null);

  const handleOpenQrModal = async () => {
    soundFX.playClick();
    setQrModalOpen(true);
    setQrLoading(true);
    setQrConfirmed(false);
    setQrChatId(null);

    try {
      const res = await fetch('/api/integrations/telegram/pairing-token');
      if (!res.ok) throw new Error('Failed to generate pairing token');
      const data = await res.json();
      setQrData(data);
    } catch (err: any) {
      toast.error(err.message || 'Error creating QR code');
    } finally {
      setQrLoading(false);
    }
  };

  // Poll for QR scan & confirmation in Telegram
  useEffect(() => {
    if (!qrModalOpen || !qrData?.token || qrConfirmed) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/integrations/telegram/pairing-status?token=${encodeURIComponent(qrData.token)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.confirmed) {
          setQrConfirmed(true);
          setQrChatId(data.chatId || null);
          soundFX.playCompletion();
          toast.success(`🎉 Linked to Telegram chat ID ${data.chatId}!`);
          await fetchStatus();
          setTimeout(() => {
            setQrModalOpen(false);
          }, 2500);
        }
      } catch (err) {
        // silent polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [qrModalOpen, qrData?.token, qrConfirmed]);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/integrations/status');
      if (!res.ok) throw new Error(`Failed to load status: ${res.status}`);
      const data: IntegrationsStatusResponse = await res.json();
      setStatus(data);
      if (data.telegram.chatId) setTelegramChatId(data.telegram.chatId);
      if (data.healthchecks.dispatchPingUrl) setDispatchPingUrl(data.healthchecks.dispatchPingUrl);
      if (data.healthchecks.reschedulePingUrl) setReschedulePingUrl(data.healthchecks.reschedulePingUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnectTelegram = async () => {
    if (!botToken.trim()) {
      toast.error('Please enter your Telegram Bot Token from @BotFather.');
      return;
    }

    try {
      setConnecting(true);
      soundFX.playClick();
      const res = await fetch('/api/integrations/telegram/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          botToken: botToken.trim(),
          telegramChatId: telegramChatId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect Telegram bot.');
      }

      soundFX.playCompletion();
      toast.success(data.message || 'Telegram bot connected and webhook registered!');
      setBotToken('');
      await fetchStatus();
    } catch (err: any) {
      toast.error(err.message || 'Error connecting to Telegram.');
    } finally {
      setConnecting(false);
    }
  };

  const handleSendTestNudge = async () => {
    try {
      setTestingMessage(true);
      soundFX.playClick();
      const res = await fetch('/api/integrations/telegram/test-message', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test message.');
      }
      soundFX.playCompletion();
      toast.success('Test message sent to Telegram! Check your phone.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send test nudge.');
    } finally {
      setTestingMessage(false);
    }
  };

  const handleTestPing = async (url: string, type: 'dispatch' | 'reschedule') => {
    if (!url.trim()) {
      toast.error('Please enter a valid ping URL first.');
      return;
    }
    soundFX.playClick();
    if (type === 'dispatch') setTestingDispatch(true);
    else setTestingReschedule(true);

    try {
      const res = await fetch('/api/integrations/healthchecks/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ping test failed.');

      if (type === 'dispatch') setDispatchLatency(data.latencyMs);
      else setRescheduleLatency(data.latencyMs);

      soundFX.playCompletion();
      toast.success(`Ping verified! Response in ${data.latencyMs}ms`);
    } catch (err: any) {
      toast.error(err.message || 'Ping failed.');
    } finally {
      if (type === 'dispatch') setTestingDispatch(false);
      else setTestingReschedule(false);
    }
  };

  const handleSaveHealthchecks = async () => {
    try {
      setSavingHealthchecks(true);
      soundFX.playClick();
      const res = await fetch('/api/integrations/healthchecks/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dispatchPingUrl: dispatchPingUrl.trim() || null,
          reschedulePingUrl: reschedulePingUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save healthchecks.');
      soundFX.playCompletion();
      toast.success('Healthchecks watchdog URLs saved!');
      await fetchStatus();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingHealthchecks(false);
    }
  };

  const isTgConnected = status?.telegram.configured;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#141416] overflow-hidden shadow-2xl">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] px-6 py-5 bg-[#1C1C1E]/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-[#0A84FF] to-[#0055D6] text-white shadow-lg shadow-blue-500/20">
            <Radio size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              Messaging & Gateways
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground font-semibold">
                Hermes Engine
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Configure two-way mobile capture, conversational commands, and automated cron watchdogs.
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px]">
        {/* Left Sidebar (Channels) */}
        <div className="lg:col-span-4 border-r border-white/[0.08] bg-[#18181B]/50 p-4 space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2 font-bold">
            Active Gateways
          </p>

          {/* Telegram Channel Item */}
          <button
            onClick={() => setActiveChannel('telegram')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'telegram'
                ? 'bg-[#242428] text-foreground border border-white/[0.12] shadow-md'
                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#0A84FF]/15 text-[#0A84FF]">
                <MessageSquare size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Telegram
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-normal">
                    Primary
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">Two-way Nudges & Commands</div>
              </div>
            </div>

            <div className="flex items-center">
              {isTgConnected ? (
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,199,89,0.8)]" />
              ) : (
                <span className="size-2 rounded-full bg-amber-400/70" />
              )}
            </div>
          </button>

          {/* Healthchecks.io Watchdog Item */}
          <button
            onClick={() => setActiveChannel('healthchecks')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'healthchecks'
                ? 'bg-[#242428] text-foreground border border-white/[0.12] shadow-md'
                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
                <ShieldCheck size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Healthchecks.io
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-normal">
                    Watchdog
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">pg_cron Dead-Man's Switch</div>
              </div>
            </div>

            <div className="flex items-center">
              {status?.healthchecks.configured ? (
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,199,89,0.8)]" />
              ) : (
                <span className="size-2 rounded-full bg-amber-400/70" />
              )}
            </div>
          </button>

          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground px-3 pt-5 pb-2 font-bold">
            Secondary & Fallbacks
          </p>

          {/* Web Push */}
          <button
            onClick={() => setActiveChannel('webpush')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'webpush'
                ? 'bg-[#242428] text-foreground border border-white/[0.12] shadow-md'
                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-purple-500/15 text-purple-400">
                <Bell size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground">Web Push (VAPID)</div>
                <div className="text-[11px] text-muted-foreground">Desktop & PWA Banner Alerts</div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
              PWA
            </span>
          </button>

          {/* Email Digest */}
          <button
            onClick={() => setActiveChannel('email')}
            className={`w-full text-left rounded-2xl p-3.5 transition-all flex items-center justify-between ${
              activeChannel === 'email'
                ? 'bg-[#242428] text-foreground border border-white/[0.12] shadow-md'
                : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-orange-500/15 text-orange-400">
                <Mail size={18} />
              </span>
              <div>
                <div className="text-xs font-bold text-foreground">Email Digest</div>
                <div className="text-[11px] text-muted-foreground">Nightly Catch-Up & Summary</div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
              Fallback
            </span>
          </button>

          {/* Coming Soon Hermes channels */}
          <div className="pt-3 px-3">
            <p className="text-[11px] text-muted-foreground font-mono">
              Planned Hermes Gateways:
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Discord', 'Slack', 'WhatsApp', 'Matrix', 'Signal', 'iMessage'].map((name) => (
                <span
                  key={name}
                  className="text-[10px] px-2 py-0.5 rounded-lg bg-white/[0.03] text-muted-foreground border border-white/[0.05]"
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
              {/* Channel Status Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-xl font-bold text-foreground">Telegram Gateway</h3>
                    {isTgConnected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                        <span className="size-1.5 rounded-full bg-amber-400" />
                        Needs setup
                      </span>
                    )}

                    {status?.telegram.source && status.telegram.source !== 'none' && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-muted-foreground">
                        Source: {status.telegram.source}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send commands to Cadence from Telegram: <code className="text-foreground">done &lt;id&gt;</code>, <code className="text-foreground">snooze &lt;id&gt; 1h</code>, <code className="text-foreground">undo</code>, <code className="text-foreground">list</code>.
                  </p>
                </div>

                {isTgConnected && (
                  <button
                    onClick={handleSendTestNudge}
                    disabled={testingMessage}
                    className="flex items-center gap-1.5 rounded-xl border border-white/[0.15] bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-foreground hover:bg-white/10 transition-all"
                  >
                    <Send size={13} className={testingMessage ? 'animate-pulse' : ''} />
                    <span>{testingMessage ? 'Sending...' : 'Send Test Nudge'}</span>
                  </button>
                )}
              </div>

              {/* QUICK SETUP (Hermes Style) */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#18181B] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-emerald-400" />
                    <h4 className="text-xs font-bold text-foreground">
                      Quick setup
                    </h4>
                    <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                      Recommended
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Scan a QR code and confirm in Telegram. Cadence pairs with the bot and detects your Telegram user ID automatically.
                </p>

                <div className="pt-1">
                  <button
                    onClick={handleOpenQrModal}
                    className="inline-flex items-center gap-2 rounded-xl bg-white text-black font-bold px-4 py-2.5 text-xs hover:bg-neutral-200 shadow-md transition-all active:scale-95"
                  >
                    <QrCode size={16} />
                    <span>Create with QR</span>
                  </button>
                </div>
              </div>

              {/* GET YOUR CREDENTIALS */}
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Get Your Credentials
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  In Telegram, talk to <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-[#0A84FF] hover:underline font-semibold">@BotFather</a>, run <code className="text-foreground font-mono">/newbot</code>, and copy the token it gives you. Then grab your numeric user ID from <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-[#0A84FF] hover:underline font-semibold">@userinfobot</a>.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-all"
                  >
                    <span>Open @BotFather</span>
                    <ArrowUpRight size={12} />
                  </a>

                  <a
                    href="https://t.me/userinfobot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-white/10 transition-all"
                  >
                    <span>Open @userinfobot</span>
                    <ExternalLink size={12} />
                  </a>

                  {status?.telegram.botUsername && (
                    <a
                      href={`https://t.me/${status.telegram.botUsername}?start=cadence`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-all"
                    >
                      <span>Open Bot (@{status.telegram.botUsername})</span>
                      <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              </div>

              {/* Bot Credentials Form */}
              <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#18181B] p-5">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
                  Credentials & Linking
                </h4>

                {/* Bot Token Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      Telegram Bot Token
                      <span className="text-[10px] text-red-400 font-mono">*REQUIRED</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">From @BotFather</span>
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
                      className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] pl-3.5 pr-10 text-sm font-mono outline-none focus:border-[#0A84FF] text-foreground transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Entering a new token and clicking Save will <strong className="text-foreground">automatically register the webhook</strong> via Telegram's API without running any curl commands.
                  </p>
                </div>

                {/* Allowed User ID / Chat ID Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      Allowed Telegram User ID / Chat ID
                      <span className="text-[10px] text-blue-400 font-mono">RECOMMENDED</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">From @userinfobot</span>
                  </div>

                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder="e.g. 123456789"
                    className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-[#0A84FF] text-foreground transition-all"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Restricts two-way agent commands to your numeric user ID so unauthorized accounts cannot trigger actions.
                  </p>
                </div>

                {/* Webhook Status Info Box */}
                {status?.telegram.webhookUrl && (
                  <div className="rounded-xl border border-white/[0.06] bg-black/40 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Registered Webhook URL:</span>
                      <code className="text-foreground font-mono text-[11px]">
                        {status.telegram.webhookUrl}
                      </code>
                    </div>
                    {status.telegram.pendingUpdateCount > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Pending updates:</span>
                        <span className="font-mono text-foreground">
                          {status.telegram.pendingUpdateCount}
                        </span>
                      </div>
                    )}
                    {status.telegram.lastErrorMessage && (
                      <div className="text-red-400 text-[11px] pt-1">
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
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-xl font-bold text-foreground">Healthchecks.io Watchdog</h3>
                  {status?.healthchecks.configured ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      <span className="size-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      <span className="size-1.5 rounded-full bg-amber-400" />
                      Unmonitored
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Dead-man's-switch monitoring for your background <code className="text-foreground">pg_cron</code> sweeps. Cadence pings these URLs after each successful run. If a run fails, Healthchecks alerts you.
                </p>
              </div>

              {/* Check 1: Dispatch Sweep */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#18181B] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-blue-400" />
                    <h4 className="text-xs font-bold text-foreground">
                      Reminder Dispatch Ping URL
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300">
                      Every 5 minutes
                    </span>
                  </div>

                  {dispatchLatency !== null && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
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
                    className="h-11 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-[#0A84FF] text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestPing(dispatchPingUrl, 'dispatch')}
                    disabled={testingDispatch || !dispatchPingUrl}
                    className="rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 text-xs font-bold text-foreground hover:bg-white/10 transition-all disabled:opacity-40"
                  >
                    {testingDispatch ? 'Testing...' : 'Test Ping'}
                  </button>
                </div>
              </div>

              {/* Check 2: Reschedule Sweep */}
              <div className="rounded-2xl border border-white/[0.08] bg-[#18181B] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-orange-400" />
                    <h4 className="text-xs font-bold text-foreground">
                      Reschedule Sweep Ping URL
                    </h4>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/15 text-orange-300">
                      Hourly (:00)
                    </span>
                  </div>

                  {rescheduleLatency !== null && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
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
                    className="h-11 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-mono outline-none focus:border-[#0A84FF] text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => handleTestPing(reschedulePingUrl, 'reschedule')}
                    disabled={testingReschedule || !reschedulePingUrl}
                    className="rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 text-xs font-bold text-foreground hover:bg-white/10 transition-all disabled:opacity-40"
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
              <h3 className="text-xl font-bold text-foreground">Web Push (VAPID)</h3>
              <p className="text-xs text-muted-foreground">
                Secondary reminder channel for browser push notifications when Cadence is open in a background tab or installed as a PWA.
              </p>
              <div className="rounded-2xl border border-white/[0.08] bg-[#18181B] p-5">
                <p className="text-xs text-muted-foreground">
                  Status: <span className="text-emerald-400 font-semibold">Ready</span> (Service Worker registered).
                </p>
              </div>
            </div>
          )}

          {activeChannel === 'email' && (
            <div className="space-y-4 animate-enter">
              <h3 className="text-xl font-bold text-foreground">Email Digest</h3>
              <p className="text-xs text-muted-foreground">
                Nightly catch-up digest summarizing tasks completed, overdue items rolled forward, and upcoming schedule.
              </p>
              <div className="rounded-2xl border border-white/[0.08] bg-[#18181B] p-5">
                <p className="text-xs text-muted-foreground">
                  Sends to your authenticated Clerk email address.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* QR Code Pairing Modal (Hermes Experience) */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-md overflow-y-auto animate-enter">
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border-t sm:border border-white/[0.12] bg-[#141416] p-6 pb-safe sm:pb-6 shadow-2xl shadow-black space-y-5 my-0 sm:my-auto">
            {/* Mobile Pull-Down Indicator Grab Bar */}
            <div className="sm:hidden mx-auto w-10 h-1 rounded-full bg-white/25 -mt-2 mb-2" />
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <QrCode size={18} />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  {qrConfirmed ? 'Connected to Telegram!' : 'Scan with Telegram'}
                </h3>
              </div>
              <button
                onClick={() => setQrModalOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {qrLoading ? (
              <div className="py-16 text-center space-y-3">
                <RefreshCw size={24} className="animate-spin mx-auto text-primary" />
                <p className="text-xs text-muted-foreground font-mono">Generating secure pairing code...</p>
              </div>
            ) : qrConfirmed ? (
              <div className="py-8 text-center space-y-4 animate-enter">
                <div className="grid size-16 place-items-center rounded-full bg-emerald-500/20 text-emerald-400 mx-auto shadow-[0_0_30px_rgba(52,199,89,0.4)]">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-foreground">Pairing Verified!</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your Telegram Chat ID <span className="font-mono text-emerald-400 font-semibold">{qrChatId}</span> is now linked.
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Closing setup automatically...
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* QR Code Container (Pure white background for crisp phone scanning) */}
                <div className="bg-white rounded-2xl p-4 flex flex-col items-center justify-center shadow-inner mx-auto max-w-[240px]">
                  {qrData?.qrUrl ? (
                    <img
                      src={qrData.qrUrl}
                      alt="Telegram Pairing QR Code"
                      className="size-48 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="size-48 grid place-items-center text-neutral-400 text-xs font-mono">
                      Loading QR...
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div className="space-y-2 text-center">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400">
                    <span className="relative flex size-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full size-2 bg-emerald-500"></span>
                    </span>
                    <span>Waiting for scan & confirm...</span>
                  </div>

                  <ol className="text-[11px] text-muted-foreground list-decimal list-inside space-y-1 text-left bg-black/30 rounded-xl p-3 border border-white/[0.05]">
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
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2.5 text-xs font-bold text-white hover:brightness-110 shadow-md transition-all"
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
