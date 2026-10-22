import { useEffect, useRef, useState, type RefObject } from 'react';

export interface AnimationGate {
  /** True when frames should be rendered: tab visible AND element on-screen (or not yet observed). */
  active: boolean;
}

/**
 * Gates animation frames on tab visibility and element on-screen presence.
 *
 * Combines a `visibilitychange` listener (`document.visibilityState !== 'hidden'`)
 * with an `IntersectionObserver` on the supplied ref (`entry.isIntersecting`).
 *
 * Returns `{ active: visible && intersecting }`. `active` defaults to `true`
 * before the first observation so a canvas is never blanked on first paint.
 */
export function useAnimationGate(ref: RefObject<Element | null>): AnimationGate {
  const [visible, setVisible] = useState<boolean>(
    () => typeof document !== 'undefined' && document.visibilityState !== 'hidden',
  );
  const [intersecting, setIntersecting] = useState<boolean>(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setVisible(document.visibilityState !== 'hidden');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    let observer: IntersectionObserver | null = null;
    const element = ref.current;
    if (element) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            setIntersecting(entry.isIntersecting);
          }
        },
        { threshold: 0 },
      );
      observer.observe(element);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer?.disconnect();
    };
  }, [ref]);

  return { active: visible && intersecting };
}
