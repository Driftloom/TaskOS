import { useRef, type ReactNode, type HTMLAttributes, useEffect } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAnimationGate } from '@/hooks/useAnimationGate';

export type TiltGlowVariant = 'amber' | 'emerald' | 'cyan' | 'violet';

interface TiltCard3DProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  sheen?: boolean;
  glow?: TiltGlowVariant;
}

const GLOW_MAP: Record<TiltGlowVariant, { sheen: string; rim: string }> = {
  amber: {
    sheen: 'color-mix(in srgb, var(--primary) 20%, transparent)',
    rim: 'color-mix(in srgb, var(--primary) 40%, transparent)',
  },
  emerald: {
    sheen: 'color-mix(in srgb, var(--status-success-text) 20%, transparent)',
    rim: 'color-mix(in srgb, var(--status-success-text) 40%, transparent)',
  },
  cyan: {
    sheen: 'color-mix(in srgb, var(--status-info-text) 20%, transparent)',
    rim: 'color-mix(in srgb, var(--status-info-text) 40%, transparent)',
  },
  violet: {
    sheen: 'color-mix(in srgb, var(--accent) 20%, transparent)',
    rim: 'color-mix(in srgb, var(--accent) 40%, transparent)',
  },
};

/**
 * World-Class Stereoscopic 3D Card Engine.
 *
 * Implements hardware-accelerated 3D tilt, specular sheen, dynamic border spotlight,
 * and unflattened stereoscopic child depth (translateZ):
 * - Outer wrapper preserves 3D perspective context (no clipping)
 * - Inner card elevated in 3D space with preserve-3d
 * - Specular sheen tracks pointer coordinates with smooth spring lerp
 * - Dynamic border glow highlights the rim facing the cursor
 * - 120 FPS requestAnimationFrame with zero React re-render overhead
 * - Full reduced-motion fallback for accessibility
 */
export function TiltCard3D({
  children,
  className = '',
  maxTilt = 7,
  sheen = true,
  glow = 'amber',
  ...props
}: TiltCard3DProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const rafRef = useRef<number | null>(null);
  const { active } = useAnimationGate(cardRef);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scheduledRef = useRef(false);
  const animateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion) return;

    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;
    let targetElevate = 0;
    let currentElevate = 0;
    let mouseX = 50;
    let mouseY = 50;
    let isHovering = false;

    const onPointerMove = (e: PointerEvent) => {
      // Touch devices should scroll freely without tilting under touch gestures
      if (e.pointerType === 'touch') return;

      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const percentX = x / rect.width;
      const percentY = y / rect.height;

      targetRotY = (percentX - 0.5) * (maxTilt * 2);
      targetRotX = -(percentY - 0.5) * (maxTilt * 2);
      targetElevate = 18; // Elevate 18px toward user
      mouseX = Math.round(percentX * 100);
      mouseY = Math.round(percentY * 100);
      isHovering = true;
    };

    const onPointerLeave = () => {
      targetRotX = 0;
      targetRotY = 0;
      targetElevate = 0;
      isHovering = false;
    };

    const update = () => {
      if (!activeRef.current) {
        // Paused by the gate (tab hidden / off-screen): do not re-schedule,
        // but keep the loop alive so resuming is automatic.
        scheduledRef.current = false;
        return;
      }

      currentRotX += (targetRotX - currentRotX) * 0.14;
      currentRotY += (targetRotY - currentRotY) * 0.14;
      currentElevate += (targetElevate - currentElevate) * 0.14;

      card.style.setProperty('--rx', `${currentRotX.toFixed(2)}deg`);
      card.style.setProperty('--ry', `${currentRotY.toFixed(2)}deg`);
      card.style.setProperty('--elevate', `${currentElevate.toFixed(1)}px`);
      card.style.setProperty('--mx', `${mouseX}%`);
      card.style.setProperty('--my', `${mouseY}%`);
      card.style.setProperty('--glow-opacity', isHovering ? '1' : '0');

      rafRef.current = requestAnimationFrame(update);
      scheduledRef.current = true;
    };

    animateRef.current = update;
    update();

    card.addEventListener('pointermove', onPointerMove, { passive: true });
    card.addEventListener('pointerleave', onPointerLeave);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [maxTilt, prefersReducedMotion]);

  // Auto-resume the render loop when the card becomes visible / on-screen again.
  useEffect(() => {
    if (activeRef.current && !scheduledRef.current) {
      scheduledRef.current = true;
      animateRef.current?.();
    }
  }, [active]);

  const activeGlow = GLOW_MAP[glow] || GLOW_MAP.amber;

  return (
    <div
      className="relative [perspective:1200px]"
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div
        ref={cardRef}
        style={{
          transform: prefersReducedMotion
            ? undefined
            : 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateZ(var(--elevate, 0px))',
          transformStyle: 'preserve-3d',
        }}
        className={`relative group rounded-2xl border border-border-control/80 bg-card/60 p-6 backdrop-blur-xl transition-[border-color,box-shadow] duration-base hover:border-border-control hover:shadow-e3 ${className}`}
        {...props}
      >
        {/* Dynamic Specular 3D Sheen Highlight */}
        {sheen && !prefersReducedMotion && (
          <div
            className="pointer-events-none absolute -inset-px rounded-2xl z-30 transition-opacity duration-base overflow-hidden"
            style={{
              opacity: 'var(--glow-opacity, 0)',
              background: `radial-gradient(circle 350px at var(--mx, 50%) var(--my, 50%), ${activeGlow.sheen}, transparent 70%)`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Dynamic Border Spotlight Ring */}
        {!prefersReducedMotion && (
          <div
            className="pointer-events-none absolute -inset-px rounded-2xl z-20 transition-opacity duration-base"
            style={{
              opacity: 'var(--glow-opacity, 0)',
              background: `radial-gradient(circle 240px at var(--mx, 50%) var(--my, 50%), ${activeGlow.rim}, transparent 70%)`,
              mask: 'linear-gradient(black 0 0) content-box, linear-gradient(black 0 0)',
              maskComposite: 'exclude',
              WebkitMaskComposite: 'xor',
              padding: '1px',
            }}
            aria-hidden="true"
          />
        )}

        {/* 3D Glass Edge Refraction Accent */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent z-20"
          aria-hidden="true"
        />

        {/* Content wrapper with stereoscopic depth preservation */}
        <div
          className="relative z-10 size-full"
          style={{ transformStyle: 'preserve-3d', transform: 'translateZ(24px)' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
