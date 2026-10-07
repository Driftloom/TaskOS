import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  ChevronDown,
  Globe,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { soundFX } from '@/lib/sound-fx';
import { cn } from '@/lib/utils';
import {
  filterTimezones,
  getAllSupportedTimezones,
  getTimezoneAbbr,
  getTimezoneCurrentTime,
  getTimezoneOffset,
  parseTimezoneOption,
  resolveTimezoneAlias,
  type TimezoneOption,
} from '@/lib/timezones';
import { timezone as detectBrowserTimezone } from '@/lib/date-utils';

export interface TimezoneSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  disabled?: boolean;
  className?: string;
  testId?: string;
}

export function TimezoneSelect({
  id = 'settings-input-timezone',
  value,
  onChange,
  onSave,
  disabled = false,
  className,
  testId = 'input-timezone',
}: TimezoneSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const detectedZone = useMemo(() => {
    try {
      return detectBrowserTimezone();
    } catch {
      return 'UTC';
    }
  }, []);

  const allSupported = useMemo(() => getAllSupportedTimezones(), []);

  // Filtered options based on search query
  const options = useMemo(() => {
    return filterTimezones(searchQuery, allSupported);
  }, [searchQuery, allSupported]);

  // Detected timezone details
  const detectedOption = useMemo(() => {
    return parseTimezoneOption(detectedZone);
  }, [detectedZone]);

  // Current selected timezone details
  const currentOffset = useMemo(() => {
    return getTimezoneOffset(value || detectedZone);
  }, [value, detectedZone]);

  const currentLocalTime = useMemo(() => {
    return getTimezoneCurrentTime(value || detectedZone);
  }, [value, detectedZone]);

  const currentAbbr = useMemo(() => {
    return getTimezoneAbbr(value || detectedZone);
  }, [value, detectedZone]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (!isOpen) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      return;
    }
    setHighlightedIndex(0);
    // Give DOM time to mount popover then focus search input
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, [isOpen]);

  const selectTimezone = (targetTz: string) => {
    // Resolve any aliases if needed
    const resolved = resolveTimezoneAlias(targetTz) || targetTz;
    onChange(resolved);
    soundFX.playTactileClick();
    setIsOpen(false);
    onSave?.();
  };

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Check if user entered an alias (e.g. "IST")
      const resolved = resolveTimezoneAlias(value);
      if (resolved && resolved !== value) {
        onChange(resolved);
      }
      setIsOpen(false);
      onSave?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < options.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlightedIndex]) {
        selectTimezone(options[highlightedIndex].id);
      } else if (searchQuery.trim()) {
        const resolved = resolveTimezoneAlias(searchQuery);
        if (resolved) {
          selectTimezone(resolved);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.focus();
    }
  };

  // Check if current value matches an abbreviation that needs auto-resolution
  const aliasSuggestion = useMemo(() => {
    if (!value) return null;
    const resolved = resolveTimezoneAlias(value);
    if (resolved && resolved.toLowerCase() !== value.toLowerCase()) {
      return resolved;
    }
    return null;
  }, [value]);

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      {/* Combobox Trigger Field */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          onClick={() => setIsOpen(true)}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          data-testid={testId}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? listboxId : undefined}
          placeholder="e.g. Asia/Kolkata"
          className="h-11 w-full rounded-lg border border-border-control bg-card pl-3 pr-20 font-mono text-caption text-foreground transition-colors hover:border-border-control/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
        />

        {/* Action icons right-aligned inside input */}
        <div className="absolute right-1.5 flex items-center gap-1">
          {value ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                soundFX.playClick();
                onChange('');
                inputRef.current?.focus();
              }}
              aria-label="Clear timezone"
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setIsOpen(!isOpen);
            }}
            aria-label={isOpen ? 'Close timezone selector' : 'Open timezone selector'}
            aria-expanded={isOpen}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronDown
              className={cn(
                'size-4 transition-transform duration-base',
                isOpen && 'rotate-180 text-foreground',
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Alias auto-fix hint if user typed abbreviation like "IST" */}
      {aliasSuggestion ? (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-caption text-foreground">
          <Sparkles className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span>
            Did you mean <strong>{aliasSuggestion}</strong>?
          </span>
          <button
            type="button"
            onClick={() => selectTimezone(aliasSuggestion)}
            className="ml-auto rounded px-2 py-0.5 font-bold text-accent underline hover:bg-accent/20"
          >
            Apply
          </button>
        </div>
      ) : null}

      {/* Offset and Local Time Pill summary */}
      {value ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono rounded bg-muted px-2 py-0.5 text-foreground">
            {currentOffset}
          </span>
          {currentAbbr ? (
            <span className="font-semibold text-accent">{currentAbbr}</span>
          ) : null}
          {currentLocalTime ? (
            <span>Local time: <strong className="text-foreground">{currentLocalTime}</strong></span>
          ) : null}
        </div>
      ) : null}

      {/* Dropdown Popover */}
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Timezone options"
          className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[320px] max-w-component-dimension-dialog-max-w rounded-xl border border-border-control bg-card p-2 shadow-2xl animate-in fade-in-0 zoom-in-95"
        >
          {/* Search Input */}
          <div className="relative mb-2">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search city, country, or code (e.g. Kolkata, IST)..."
              className="h-9 w-full rounded-lg border border-border-control bg-muted pl-8 pr-3 text-caption text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Quick-use Browser Detected Timezone */}
          {detectedZone ? (
            <div className="mb-2 border-b border-border-control/50 pb-2">
              <button
                type="button"
                onClick={() => selectTimezone(detectedZone)}
                className="flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded bg-accent/15 text-accent">
                    <Globe className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-caption font-semibold text-foreground">
                      Use Browser Detected
                    </p>
                    <p className="text-caption text-muted-foreground font-mono">
                      {detectedOption.id} ({detectedOption.offset})
                    </p>
                  </div>
                </div>
                {value === detectedZone ? (
                  <Check className="size-4 text-accent" aria-hidden="true" />
                ) : null}
              </button>
            </div>
          ) : null}

          {/* Timezone List */}
          <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {options.length === 0 ? (
              <div className="py-6 text-center text-caption text-muted-foreground">
                No timezones found for &quot;{searchQuery}&quot;
              </div>
            ) : (
              options.map((opt, index) => {
                const isSelected = value === opt.id;
                const isHighlighted = highlightedIndex === index;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectTimezone(opt.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-caption transition-colors',
                      isSelected && 'bg-primary/10 text-primary-text font-bold',
                      !isSelected && isHighlighted && 'bg-muted text-foreground',
                      !isSelected && !isHighlighted && 'text-foreground hover:bg-muted',
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{opt.city}</span>
                        {opt.abbr ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-caption font-mono text-muted-foreground">
                            {opt.abbr}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate font-mono text-caption text-muted-foreground">
                        {opt.id}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <span className="font-mono text-caption text-muted-foreground">
                          {opt.offset}
                        </span>
                        {opt.currentTime ? (
                          <p className="text-caption text-muted-foreground">
                            {opt.currentTime}
                          </p>
                        ) : null}
                      </div>
                      {isSelected ? (
                        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
