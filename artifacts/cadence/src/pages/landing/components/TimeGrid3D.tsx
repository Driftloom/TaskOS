import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAnimationGate } from '@/hooks/useAnimationGate';

interface TimeGrid3DProps {
  mode?: 'day' | 'night';
  interactive?: boolean;
}

/**
 * 3D Isometric Time Block Scene (Three.js).
 *
 * Visualizes visual hour time blocking and overlap prevention:
 * - 3 floating geometric block modules representing scheduled tasks
 * - Luminous laser timeline axis with pulse glow
 * - Dynamic color shift between Day (09:00-18:00) and Night Owl (00:00-23:59)
 * - Full memory disposal on unmount (three-best-practices)
 */
export function TimeGrid3D({
  mode = 'day',
  interactive = true,
}: TimeGrid3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const { active } = useAnimationGate(containerRef);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scheduledRef = useRef(false);
  const animateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 96;
    const height = container.clientHeight || 96;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(2.8, 2.2, 3.2);
    camera.lookAt(0, 0, 0);

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

    const dirLight = new THREE.DirectionalLight(0xf59e0b, 2.2);
    dirLight.position.set(3, 4, 2);
    scene.add(dirLight);

    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Laser timeline vertical line
    const lineGeom = new THREE.CylinderGeometry(0.015, 0.015, 2.2, 8);
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.8,
    });
    disposables.push(lineGeom, lineMat);
    const timeline = new THREE.Mesh(lineGeom, lineMat);
    timeline.position.set(-0.75, 0, 0);
    masterGroup.add(timeline);

    // Block 1 (Deep Work - 90m)
    const b1Geom = new THREE.BoxGeometry(1.2, 0.45, 0.5);
    const b1Mat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.6,
      roughness: 0.3,
      emissive: 0xd97706,
      emissiveIntensity: 0.3,
    });
    disposables.push(b1Geom, b1Mat);
    const block1 = new THREE.Mesh(b1Geom, b1Mat);
    block1.position.set(0, 0.55, 0);
    masterGroup.add(block1);

    // Block 2 (Rest Buffer - 30m)
    const b2Geom = new THREE.BoxGeometry(1.0, 0.22, 0.45);
    const b2Mat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      wireframe: true,
      metalness: 0.3,
      roughness: 0.7,
    });
    disposables.push(b2Geom, b2Mat);
    const block2 = new THREE.Mesh(b2Geom, b2Mat);
    block2.position.set(0, 0.1, 0);
    masterGroup.add(block2);

    // Block 3 (PR Review - 45m)
    const b3Geom = new THREE.BoxGeometry(1.15, 0.32, 0.48);
    const b3Mat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      metalness: 0.6,
      roughness: 0.3,
      emissive: 0x059669,
      emissiveIntensity: 0.3,
    });
    disposables.push(b3Geom, b3Mat);
    const block3 = new THREE.Mesh(b3Geom, b3Mat);
    block3.position.set(0, -0.35, 0);
    masterGroup.add(block3);

    let targetRotY = 0;
    let targetRotX = 0;

    const onPointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      targetRotY = ((e.clientX - rect.left) / rect.width - 0.5) * 0.6;
      targetRotX = ((e.clientY - rect.top) / rect.height - 0.5) * 0.4;
    };

    const onPointerLeave = () => {
      targetRotY = 0;
      targetRotX = 0;
    };

    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('mouseleave', onPointerLeave);

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
    let time = 0;

    const animate = () => {
      if (!activeRef.current) {
        // Paused by the gate (tab hidden / off-screen): do not re-schedule or
        // render, but keep the loop alive so resuming is automatic.
        scheduledRef.current = false;
        return;
      }

      time += 0.02;

      if (!prefersReducedMotion) {
        masterGroup.rotation.y += (targetRotY - masterGroup.rotation.y) * 0.1;
        masterGroup.rotation.x += (targetRotX - masterGroup.rotation.x) * 0.1;

        // Subtle floating breathing effect
        block1.position.y = 0.55 + Math.sin(time) * 0.03;
        block3.position.y = -0.35 + Math.cos(time * 0.8) * 0.025;

        // Mode color tinting
        if (modeRef.current === 'night') {
          b1Mat.color.setHex(0x8b5cf6); // Night violet
          b1Mat.emissive.setHex(0x6d28d9);
        } else {
          b1Mat.color.setHex(0xf59e0b); // Day amber
          b1Mat.emissive.setHex(0xd97706);
        }
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
      className="relative size-20 flex items-center justify-center select-none"
      title="3D Time Blocking Modules"
      aria-label="3D Isometric Time Blocks"
    />
  );
}
