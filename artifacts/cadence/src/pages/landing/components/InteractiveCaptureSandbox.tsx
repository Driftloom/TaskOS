import { useState, useId } from 'react';
import {
  Calendar,
  Clock,
  Sparkles,
  Tag,
  AlertCircle,
  Folder,
  CheckCircle2,
  CornerDownLeft,
} from 'lucide-react';
import { analyseCaptureDraft, type CaptureChip } from '@/lib/capture/parseQuickCapture';
import { soundFX } from '@/lib/sound-fx';
import { TokenLexer3D } from './TokenLexer3D';

const PRESET_PROMPTS = [
  'Deep work tomorrow 9am for 90m !p1',
  'Review slippage ledger friday 6pm #rituals',
  'Architecture RFC in 2 hours #core',
];

export function InteractiveCaptureSandbox() {
  const inputId = useId();
  const [text, setText] = useState('Deep work tomorrow 9am for 90m !p1');
  const [simulatedSaved, setSimulatedSaved] = useState(false);

  const { chips, title } = analyseCaptureDraft(text);

  const handleSelectPreset = (preset: string) => {
    soundFX.playClick();
    setText(preset);
    setSimulatedSaved(false);
  };

  const handleSimulateCapture = () => {
    soundFX.playCompletion();
    setSimulatedSaved(true);
    setTimeout(() => {
      setSimulatedSaved(false);
    }, 2800);
  };

  const renderChipIcon = (kind: CaptureChip['kind']) => {
    switch (kind) {
      case 'date':
        return <Calendar size={13} className="text-primary-text" />;
      case 'time':
      case 'duration':
        return <Clock size={13} className="text-accent" />;
      case 'priority':
        return <AlertCircle size={13} className="text-status-danger-text" />;
      case 'project':
        return <Folder size={13} className="text-status-info-text" />;
      case 'tag':
      default:
        return <Tag size={13} className="text-status-success-text" />;
    }
  };

  return (
    <div
      className="relative size-full p-6 sm:p-7 flex flex-col justify-between"
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* 3D Glass Inner Refraction Highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent"
        aria-hidden="true"
      />

      {/* Layer 1: Header with 3D Token Lexer */}
      <div
        className="flex items-center justify-between pb-4 border-b border-border-control/60"
        style={{ transform: 'translateZ(14px)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-control bg-primary/15 text-primary-text shadow-sm">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-title3 sm:text-title2 font-bold text-foreground tracking-tight">
              Natural Speed
            </h2>
            <span className="block text-caption text-muted-foreground">
              Instant natural language parser decomposes intent
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 3D Lexer Prism */}
          <div className="hidden sm:block" title="3D Token Decomposition Engine">
            <TokenLexer3D activeTokenCount={chips.length} />
          </div>
          <span className="rounded-control border border-border-control bg-surface-elevated px-2.5 py-1 font-mono text-caption text-primary-text font-bold shadow-sm">
            INTERACTIVE PREVIEW
          </span>
        </div>
      </div>

      {/* Layer 2: Input Container with 3D Pop */}
      <div className="mt-5" style={{ transform: 'translateZ(26px)' }}>
        <label htmlFor={inputId} className="sr-only">
          Natural language task input
        </label>
        <div className="relative flex items-center group">
          <input
            id={inputId}
            type="text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSimulatedSaved(false);
            }}
            placeholder='Try typing "Tomorrow 3pm meeting for 45m !p1"'
            className="w-full rounded-control border border-border-control bg-surface-elevated/95 px-4 py-3 pr-11 text-caption sm:text-callout text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary shadow-inner transition-all"
          />
          <button
            type="button"
            onClick={handleSimulateCapture}
            aria-label="Submit simulated task"
            title="Parse and simulate capture"
            className="absolute right-2 flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground shadow-md transition-all hover:scale-105 active:scale-95 touch-manipulation"
          >
            <CornerDownLeft size={14} />
          </button>
        </div>
      </div>

      {/* Layer 3: Preset Prompt Pills */}
      <div
        className="mt-3.5 flex flex-wrap items-center gap-2"
        style={{ transform: 'translateZ(18px)' }}
      >
        <span className="text-caption text-muted-foreground mr-1 font-mono">Pills:</span>
        {PRESET_PROMPTS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => handleSelectPreset(preset)}
            className="rounded-control border border-border-control bg-surface-elevated px-3 py-1 text-caption text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground active:scale-98 touch-manipulation shadow-sm"
          >
            {preset.split(' ')[0]}...
          </button>
        ))}
      </div>

      {/* Layer 4: Extracted Tokens Card */}
      <div
        className="mt-5 rounded-xl border border-border-control/80 bg-surface-elevated/90 p-4 backdrop-blur-md shadow-md"
        style={{ transform: 'translateZ(30px)' }}
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-border-control/40">
          <span className="font-mono text-caption uppercase tracking-wider text-muted-foreground">
            Deconstructed Title:
          </span>
          <span className="font-mono text-caption font-semibold text-foreground truncate max-w-[220px]">
            {title || '(empty title)'}
          </span>
        </div>

        {/* Tokens Row */}
        <div className="mt-3 flex flex-wrap items-center gap-2 min-h-7">
          {chips.length === 0 ? (
            <span className="text-caption text-muted-foreground italic">
              Type words like "tomorrow", "9am", "45m", or "#tag" to extract tokens...
            </span>
          ) : (
            chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-control border border-border-control bg-card px-2.5 py-1 font-mono text-caption font-semibold text-foreground shadow-sm transition-transform hover:-translate-y-0.5"
              >
                {renderChipIcon(chip.kind)}
                <span>{chip.label}</span>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Layer 5: Simulated Confirmation Banner */}
      {simulatedSaved && (
        <div
          className="mt-4 flex items-center gap-2.5 rounded-control border border-border-control bg-card p-3.5 text-status-success-text shadow-xl transition-all animate-in fade-in slide-in-from-top-1"
          style={{ transform: 'translateZ(38px)' }}
        >
          <CheckCircle2 size={16} />
          <span className="text-caption font-semibold text-foreground">
            Preview only — nothing was saved. In the app this creates the task and adds it to your calendar.
          </span>
        </div>
      )}
    </div>
  );
}
