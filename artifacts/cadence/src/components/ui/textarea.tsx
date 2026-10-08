import * as React from 'react';
import { cn } from '@/lib/utils';

// VENDORED shadcn. `textarea-min-h` replaces upstream's `min-h-[60px]` at the
// identical value (pure rename). Regenerating this file with `shadcn add` will
// silently put the literal back -- nothing fails, because the rendered height is
// unchanged either way. After regenerating, confirm `textarea-min-h` is still here.
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex textarea-min-h w-full rounded-md border border-input bg-transparent px-3 py-2 text-callout shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-micro',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
