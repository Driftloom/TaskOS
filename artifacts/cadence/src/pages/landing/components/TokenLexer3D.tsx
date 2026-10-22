import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAnimationGate } from '@/hooks/useAnimationGate';

interface TokenLexer3DProps {
  interactive?: boolean;
  activeTokenCount?: number;
}

/**
 * 3D Lexer Token Prism (Three.js).
 *
 * Visualizes instant natural language task decomposition:
 * - Central luminous prism crystal (Amber)
 * - Orbiting data token satellites in 3D coordinate space
 * - Interactive pointer tilt and speed excitation
 * - Proper disposal on unmount adhering to three-best-practices
 */
export function TokenLexer3D({
  interactive = true,
  activeTokenCount = 4,
}: TokenLexer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const speedBoostRef = useRef<number>(0);
  const { active } = useAnimationGate(containerRef);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scheduledRef = useRef(false);
  const animateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Pulse on token count changes
    speedBoostRef.current = 0.35;
  }, [activeTokenCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 90;
    const height = container.clientHeight || 90;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const disposables: { dispose: () => void }[] = [];

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(amb);

    const pLight = new THREE.PointLight(0xf59e0b, 3.0, 10);
    pLight.position.set(2, 3, 2);
    scene.add(pLight);

    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Central Prism Crystal
    const prismGeom = new THREE.OctahedronGeometry(0.7, 0);
    const prismMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
      wireframe: true,
    });
    disposables.push(prismGeom, prismMat);
    const prism = new THREE.Mesh(prismGeom, prismMat);
    masterGroup.add(prism);

    // Orbiting Satellite Beads (representing parsed tokens)
    const tokenGroup = new THREE.Group();
    masterGroup.add(tokenGroup);

    const beadGeom = new THREE.SphereGeometry(0.08, 12, 12);
    const colors = [0xf59e0b, 0x06b6d4, 0x10b981, 0xef4444];
    disposables.push(beadGeom);

    const tokens: THREE.Mesh[] = [];
    const count = 4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const bMat = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length],
        emissive: colors[i % colors.length],
        emissiveIntensity: 0.8,
        metalness: 0.5,
        roughness: 0.2,
      });
      disposables.push(bMat);
      const bMesh = new THREE.Mesh(beadGeom, bMat);
      bMesh.position.set(Math.cos(angle) * 1.15, (i % 2 === 0 ? 0.25 : -0.25), Math.sin(angle) * 1.15);
      tokenGroup.add(bMesh);
      tokens.push(bMesh);
    }

    let targetX = 0;
    let targetY = 0;

    const onPointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.7;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.7;
    };

    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    const onClick = () => {
      speedBoostRef.current = 0.5;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.key === ' ') e.preventDefault();
        onClick();
      }
    };

    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('mouseleave', onPointerLeave);
    container.addEventListener('click', onClick);
    container.addEventListener('keydown', onKeyDown);

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

    let animId: number;
    const animate = () => {
      if (!activeRef.current) {
        // Paused by the gate (tab hidden / off-screen): do not re-schedule or
        // render, but keep the loop alive so resuming is automatic.
        scheduledRef.current = false;
        return;
      }

      if (!prefersReducedMotion) {
        masterGroup.rotation.y += (targetX - masterGroup.rotation.y) * 0.1;
        masterGroup.rotation.x += (targetY - masterGroup.rotation.x) * 0.1;

        speedBoostRef.current *= 0.94;
        const spd = 0.02 + speedBoostRef.current;

        prism.rotation.x += spd * 0.8;
        prism.rotation.y += spd;
        tokenGroup.rotation.y -= spd * 1.4;
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

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      container.removeEventListener('mousemove', onPointerMove);
      container.removeEventListener('mouseleave', onPointerLeave);
      container.removeEventListener('click', onClick);
      container.removeEventListener('keydown', onKeyDown);

      disposables.forEach((d) => d.dispose());
      scene.clear();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [interactive, prefersReducedMotion]);

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
      className="relative size-18 flex items-center justify-center cursor-pointer select-none"
      title="3D Lexer Token Prism"
      aria-label="3D Natural Language Token Prism"
    />
  );
}
