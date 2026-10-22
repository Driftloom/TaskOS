import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAnimationGate } from '@/hooks/useAnimationGate';

interface ActivityRings3DProps {
  focusPercent?: number; // 0..100
  tasksPercent?: number; // 0..100
  streakPercent?: number; // 0..100
  interactive?: boolean;
}

/**
 * 3D Activity Rings WebGL Scene (Three.js).
 *
 * Renders 3 concentric, volumetric toruses with dynamic lighting,
 * orbit beads, milestone arcs, and interactive pointer gyroscopic tilt:
 * - Ring 1 (Outer): Focus Minutes (Amber / Gold)
 * - Ring 2 (Middle): Tasks Completed (Emerald / Mint)
 * - Ring 3 (Inner): Strict Streak (Cyan / Violet)
 * - Full resource lifecycle management & dispose on unmount (three-best-practices)
 */
export function ActivityRings3D({
  focusPercent = 75,
  tasksPercent = 80,
  streakPercent = 90,
  interactive = true,
}: ActivityRings3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const spinBoostRef = useRef<number>(0);
  const { active } = useAnimationGate(containerRef);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scheduledRef = useRef(false);
  const animateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 180;
    const height = container.clientHeight || 180;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.8);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xf59e0b, 2.5); // Warm amber
    dirLight1.position.set(3, 4, 3);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x06b6d4, 2.0); // Cool cyan
    dirLight2.position.set(-3, -3, 2);
    scene.add(dirLight2);

    // Root rotation group
    const rootGroup = new THREE.Group();
    rootGroup.rotation.x = 0.55;
    rootGroup.rotation.y = -0.35;
    scene.add(rootGroup);

    // Geometries & Materials tracking for cleanup
    const disposables: { dispose: () => void }[] = [];

    interface RingConfig {
      radius: number;
      tube: number;
      color: number;
      percent: number;
      speed: number;
    }

    const configs: RingConfig[] = [
      { radius: 1.45, tube: 0.08, color: 0xf59e0b, percent: focusPercent, speed: 0.012 }, // Amber
      { radius: 1.15, tube: 0.075, color: 0x10b981, percent: tasksPercent, speed: -0.016 }, // Emerald
      { radius: 0.85, tube: 0.07, color: 0x8b5cf6, percent: streakPercent, speed: 0.02 }, // Violet
    ];

    const ringMeshes: {
      track: THREE.Mesh;
      arc: THREE.Mesh;
      bead: THREE.Mesh;
      speed: number;
      radius: number;
    }[] = [];

    configs.forEach((cfg) => {
      // 1. Background dark track
      const trackGeom = new THREE.TorusGeometry(cfg.radius, cfg.tube * 0.9, 16, 64);
      const trackMat = new THREE.MeshStandardMaterial({
        color: 0x1f242e,
        roughness: 0.8,
        metalness: 0.2,
        transparent: true,
        opacity: 0.5,
      });
      disposables.push(trackGeom, trackMat);
      const track = new THREE.Mesh(trackGeom, trackMat);
      rootGroup.add(track);

      // 2. Active illuminated progress arc
      const arcLength = (cfg.percent / 100) * Math.PI * 2;
      const arcGeom = new THREE.TorusGeometry(cfg.radius, cfg.tube, 20, 80, arcLength);
      const arcMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.2,
        metalness: 0.8,
        emissive: cfg.color,
        emissiveIntensity: 0.45,
      });
      disposables.push(arcGeom, arcMat);
      const arc = new THREE.Mesh(arcGeom, arcMat);
      rootGroup.add(arc);

      // 3. Orbiting milestone bead at the tip of the arc
      const beadGeom = new THREE.SphereGeometry(cfg.tube * 1.6, 16, 16);
      const beadMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: cfg.color,
        emissiveIntensity: 1.2,
        roughness: 0.1,
      });
      disposables.push(beadGeom, beadMat);
      const bead = new THREE.Mesh(beadGeom, beadMat);
      bead.position.set(
        Math.cos(arcLength) * cfg.radius,
        Math.sin(arcLength) * cfg.radius,
        0
      );
      rootGroup.add(bead);

      ringMeshes.push({
        track,
        arc,
        bead,
        speed: cfg.speed,
        radius: cfg.radius,
      });
    });

    // Central radiant crystal core
    const coreGeom = new THREE.OctahedronGeometry(0.35, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.6,
      wireframe: true,
    });
    disposables.push(coreGeom, coreMat);
    const core = new THREE.Mesh(coreGeom, coreMat);
    rootGroup.add(core);

    // Pointer interaction
    let targetTiltX = 0.55;
    let targetTiltY = -0.35;
    let isHovered = false;

    const onPointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / height - 0.5;
      targetTiltY = -0.35 + x * 0.8;
      targetTiltX = 0.55 + y * 0.8;
    };

    const onMouseEnter = () => {
      isHovered = true;
      spinBoostRef.current = 0.15;
    };

    const onMouseLeave = () => {
      isHovered = false;
      targetTiltX = 0.55;
      targetTiltY = -0.35;
    };

    const onClick = () => {
      spinBoostRef.current = 0.4;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        onClick();
      }
    };

    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('mouseenter', onMouseEnter);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeyDown);

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          camera.aspect = cr.width / cr.height;
          camera.updateProjectionMatrix();
          renderer.setSize(cr.width, cr.height);
        }
      }
    });
    ro.observe(container);

    // Animation Loop
    let animId: number;
    const animate = () => {
      if (!activeRef.current) {
        // Paused by the gate (tab hidden / off-screen): do not re-schedule or
        // render, but keep the loop alive so resuming is automatic.
        scheduledRef.current = false;
        return;
      }

      if (!prefersReducedMotion) {
        // Gyroscopic tilt smoothing
        rootGroup.rotation.x += (targetTiltX - rootGroup.rotation.x) * 0.1;
        rootGroup.rotation.y += (targetTiltY - rootGroup.rotation.y) * 0.1;

        // Spin boost decay
        const boost = spinBoostRef.current;
        spinBoostRef.current *= 0.94;

        // Rotate individual rings
        ringMeshes.forEach((r, idx) => {
          r.arc.rotation.z += r.speed + (idx % 2 === 0 ? boost : -boost);
          r.bead.rotation.z = r.arc.rotation.z;
        });

        // Tumble central core
        core.rotation.x += 0.02 + boost;
        core.rotation.y += 0.025 + boost;
      }

      renderer.render(scene, camera);

      if (prefersReducedMotion) {
        // Reduced motion: render once, then stop the loop.
        scheduledRef.current = true;
        return;
      }

      animId = requestAnimationFrame(animate);
      scheduledRef.current = true;
    };

    animateRef.current = animate;
    animate();

    // Comprehensive cleanup adhering to three-best-practices
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      container.removeEventListener('mousemove', onPointerMove);
      container.removeEventListener('mouseenter', onMouseEnter);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeyDown);

      disposables.forEach((d) => d.dispose());
      scene.clear();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [focusPercent, tasksPercent, streakPercent, interactive, prefersReducedMotion]);

  // Auto-resume the render loop when the canvas becomes visible / on-screen again.
  useEffect(() => {
    if (activeRef.current && !scheduledRef.current) {
      scheduledRef.current = true;
      animateRef.current?.();
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      className="relative size-44 mx-auto flex items-center justify-center cursor-pointer select-none"
      title="Click or hover to rotate in 3D"
      // The percentages are decorative sample values inside a disclosed
      // preview. Announcing them would tell a screen-reader user that a
      // streak exists, so the label describes the illustration instead.
      aria-label="Animated illustration of three activity rings"
    />
  );
}
