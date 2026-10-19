import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface DecisionGyro3DProps {
  status?: 'pending' | 'accepted' | 'declined' | 'rejected';
  interactive?: boolean;
}

/**
 * 3D Decision Gyroscope WebGL Scene (Three.js).
 *
 * Visualizes the 9-Rule Auto-Reschedule algorithmic engine:
 * - 3 interlocking concentric gimbal rings revolving along X, Y, Z axes
 * - Central decision core displaying computation state
 * - Harmonic rotation with pointer parallax and celebration bursts
 * - Fully managed lifecycle with memory disposal (three-best-practices)
 */
export function DecisionGyro3D({
  status = 'pending',
  interactive = true,
}: DecisionGyro3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const speedMultiplierRef = useRef<number>(1);

  // Trigger spin burst when status changes
  useEffect(() => {
    if (status === 'accepted') {
      speedMultiplierRef.current = 4;
    } else if (status === 'declined' || status === 'rejected') {
      speedMultiplierRef.current = 0.5;
    }
  }, [status]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 100;
    const height = container.clientHeight || 100;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const disposables: { dispose: () => void }[] = [];

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(amb);

    const pLight1 = new THREE.PointLight(0xf59e0b, 3, 10);
    pLight1.position.set(2, 3, 2);
    scene.add(pLight1);

    const pLight2 = new THREE.PointLight(0x06b6d4, 2, 10);
    pLight2.position.set(-2, -2, 2);
    scene.add(pLight2);

    // Master Gimbal Group
    const masterGroup = new THREE.Group();
    scene.add(masterGroup);

    // Ring 1 (Outer - Amber)
    const r1Geom = new THREE.TorusGeometry(1.2, 0.035, 16, 64);
    const r1Mat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.3,
    });
    disposables.push(r1Geom, r1Mat);
    const ring1 = new THREE.Mesh(r1Geom, r1Mat);
    masterGroup.add(ring1);

    // Ring 2 (Middle - Cyan)
    const r2Geom = new THREE.TorusGeometry(0.95, 0.03, 16, 64);
    const r2Mat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      metalness: 0.85,
      roughness: 0.2,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.35,
    });
    disposables.push(r2Geom, r2Mat);
    const ring2 = new THREE.Mesh(r2Geom, r2Mat);
    ring1.add(ring2);

    // Ring 3 (Inner - White/Gold)
    const r3Geom = new THREE.TorusGeometry(0.7, 0.025, 16, 48);
    const r3Mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.5,
    });
    disposables.push(r3Geom, r3Mat);
    const ring3 = new THREE.Mesh(r3Geom, r3Mat);
    ring2.add(ring3);

    // Central Core Node (Icosahedron)
    const coreGeom = new THREE.IcosahedronGeometry(0.3, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      wireframe: true,
      emissive: status === 'accepted' ? 0x10b981 : 0xf59e0b,
      emissiveIntensity: 0.8,
    });
    disposables.push(coreGeom, coreMat);
    const core = new THREE.Mesh(coreGeom, coreMat);
    ring3.add(core);

    // 4 Tiny Pivot Spheres
    const pivotGeom = new THREE.SphereGeometry(0.06, 12, 12);
    const pivotMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
    });
    disposables.push(pivotGeom, pivotMat);

    const p1 = new THREE.Mesh(pivotGeom, pivotMat);
    p1.position.set(1.2, 0, 0);
    ring1.add(p1);

    const p2 = new THREE.Mesh(pivotGeom, pivotMat);
    p2.position.set(-1.2, 0, 0);
    ring1.add(p2);

    const p3 = new THREE.Mesh(pivotGeom, pivotMat);
    p3.position.set(0, 0.95, 0);
    ring2.add(p3);

    const p4 = new THREE.Mesh(pivotGeom, pivotMat);
    p4.position.set(0, -0.95, 0);
    ring2.add(p4);

    // Pointer parallax
    let targetX = 0;
    let targetY = 0;

    const onPointerMove = (e: MouseEvent) => {
      if (!interactive) return;
      const rect = container.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.8;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.8;
    };

    const onPointerLeave = () => {
      targetX = 0;
      targetY = 0;
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
    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (!prefersReducedMotion) {
        masterGroup.rotation.y += (targetX - masterGroup.rotation.y) * 0.1;
        masterGroup.rotation.x += (targetY - masterGroup.rotation.x) * 0.1;

        // Speed multiplier decay back to 1
        speedMultiplierRef.current += (1 - speedMultiplierRef.current) * 0.04;
        const spd = speedMultiplierRef.current;

        ring1.rotation.x += 0.015 * spd;
        ring2.rotation.y += 0.02 * spd;
        ring3.rotation.z += 0.025 * spd;
        core.rotation.y -= 0.03 * spd;
        core.rotation.x -= 0.015 * spd;
      }

      renderer.render(scene, camera);
    };

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

  return (
    <div
      ref={containerRef}
      className="relative size-24 mx-auto flex items-center justify-center select-none"
      title="Rule 9 Decision Gyroscope"
      aria-label="3D Algorithmic Decision Gyroscope"
    />
  );
}
