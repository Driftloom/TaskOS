import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useAnimationGate } from '@/hooks/useAnimationGate';

interface TelegramPlane3DProps {
  interactive?: boolean;
  triggerBoost?: boolean;
}

/**
 * 3D Origami Telegram Paper Plane (Three.js).
 *
 * Visualizes instantaneous two-way webhook messaging:
 * - Geometric wireframe and translucent glass hull
 * - Natural aerodynamic gliding, banking, and pitch
 * - Dynamic barrel-roll burst on message actions
 * - Adheres strictly to three-best-practices with memory disposal
 */
export function TelegramPlane3D({
  interactive = true,
  triggerBoost = false,
}: TelegramPlane3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const rollBoostRef = useRef<number>(0);
  const { active } = useAnimationGate(containerRef);
  const activeRef = useRef(active);
  activeRef.current = active;
  const scheduledRef = useRef(false);
  const animateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (triggerBoost) {
      rollBoostRef.current = Math.PI * 2; // Full 360 barrel roll
    }
  }, [triggerBoost]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 96;
    const height = container.clientHeight || 96;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.3, 3.8);

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
    const amb = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(amb);

    const dLight = new THREE.DirectionalLight(0x06b6d4, 2.5); // Cyan
    dLight.position.set(2, 4, 3);
    scene.add(dLight);

    const dLight2 = new THREE.DirectionalLight(0x10b981, 2.0); // Emerald
    dLight2.position.set(-2, -3, 2);
    scene.add(dLight2);

    // Build custom paper plane geometry
    // Vertices:
    // 0: Nose (0, 0, 1.2)
    // 1: Left wing tip (-1.3, 0.25, -0.9)
    // 2: Right wing tip (1.3, 0.25, -0.9)
    // 3: Tail center keel (0, -0.35, -0.9)
    // 4: Tail top spine (0, 0.1, -0.9)
    const vertices = new Float32Array([
      // Left Wing (Nose -> Spine -> WingTip)
      0, 0, 1.2,
      0, 0.1, -0.9,
      -1.3, 0.25, -0.9,

      // Right Wing (Nose -> WingTip -> Spine)
      0, 0, 1.2,
      1.3, 0.25, -0.9,
      0, 0.1, -0.9,

      // Left Keel (Nose -> Keel -> Spine)
      0, 0, 1.2,
      -0.05, -0.35, -0.9,
      0, 0.1, -0.9,

      // Right Keel (Nose -> Spine -> Keel)
      0, 0, 1.2,
      0, 0.1, -0.9,
      0.05, -0.35, -0.9,
    ]);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0284c7,
      emissiveIntensity: 0.35,
      metalness: 0.6,
      roughness: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    disposables.push(geom, mat, wireMat);

    const planeGroup = new THREE.Group();
    const mesh = new THREE.Mesh(geom, mat);
    const wire = new THREE.Mesh(geom, wireMat);
    planeGroup.add(mesh);
    planeGroup.add(wire);
    scene.add(planeGroup);

    // Initial orientation: slightly pitched up and banking
    planeGroup.rotation.x = -0.15;
    planeGroup.rotation.y = 0.4;
    planeGroup.rotation.z = -0.1;

    let targetRotY = 0.4;
    let targetRotX = -0.15;

    const onPointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetRotY = 0.4 + x * 0.7;
      targetRotX = -0.15 + y * 0.5;
    };

    const onPointerLeave = () => {
      targetRotY = 0.4;
      targetRotX = -0.15;
    };

    const onClick = () => {
      rollBoostRef.current = Math.PI * 2;
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
    let time = 0;

    const animate = () => {
      if (!activeRef.current) {
        // Paused by the gate (tab hidden / off-screen): do not re-schedule or
        // render, but keep the loop alive so resuming is automatic.
        scheduledRef.current = false;
        return;
      }

      time += 0.025;

      if (!prefersReducedMotion) {
        // Natural aerodynamic hovering wave
        planeGroup.position.y = Math.sin(time) * 0.08;
        planeGroup.position.x = Math.cos(time * 0.7) * 0.05;

        // Smooth orientation tracking
        planeGroup.rotation.y += (targetRotY - planeGroup.rotation.y) * 0.08;
        planeGroup.rotation.x += (targetRotX - planeGroup.rotation.x) * 0.08;

        // Banking roll
        const bankingZ = -0.1 + Math.sin(time * 1.2) * 0.06;
        planeGroup.rotation.z = bankingZ;

        // Barrel roll boost
        if (rollBoostRef.current > 0.05) {
          planeGroup.rotation.z += rollBoostRef.current;
          rollBoostRef.current *= 0.88;
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
      className="relative size-20 flex items-center justify-center cursor-pointer select-none"
      title="3D Webhook Signal Plane (Click to Barrel Roll)"
      aria-label="3D Telegram Webhook Plane"
    />
  );
}
