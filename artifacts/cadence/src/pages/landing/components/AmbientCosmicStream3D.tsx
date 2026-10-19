import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * End-to-End Ambient 3D Cosmic Environment (Three.js).
 *
 * Spans the entire scroll height of the Cadence landing page:
 * - 800 celestial depth particles with color temperature (amber, cyan, steel, violet)
 * - 3 floating geometric polyhedra (Icosahedron, Torus Knot, Dodecahedron) at key scroll tiers
 * - Smooth scroll-linked camera/scene parallax with inertia damping
 * - Interactive pointer gravity field
 * - High-efficiency rendering with pixel-ratio capping & clean disposal (three-best-practices)
 */
export function AmbientCosmicStream3D() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 0, 24);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    const disposables: { dispose: () => void }[] = [];

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(amb);

    const lightAmber = new THREE.PointLight(0xf59e0b, 2.5, 40);
    lightAmber.position.set(12, 10, 8);
    scene.add(lightAmber);

    const lightCyan = new THREE.PointLight(0x06b6d4, 2.0, 40);
    lightCyan.position.set(-12, -10, 8);
    scene.add(lightCyan);

    // 1. Celestial Stardust Particles (800 points)
    const particleCount = 800;
    const posArray = new Float32Array(particleCount * 3);
    const colArray = new Float32Array(particleCount * 3);

    const colorPalette = [
      new THREE.Color(0xf59e0b), // Amber
      new THREE.Color(0x06b6d4), // Cyan
      new THREE.Color(0x8b5cf6), // Violet
      new THREE.Color(0x64748b), // Slate
    ];

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Spread across a deep 3D volume
      posArray[i3] = (Math.random() - 0.5) * 60;
      posArray[i3 + 1] = (Math.random() - 0.5) * 80;
      posArray[i3 + 2] = (Math.random() - 0.5) * 35;

      const c = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colArray[i3] = c.r;
      colArray[i3 + 1] = c.g;
      colArray[i3 + 2] = c.b;
    }

    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    starGeom.setAttribute('color', new THREE.BufferAttribute(colArray, 3));

    // High-performance soft circular point texture using pure DataTexture (zero canvas allocation)
    const texSize = 32;
    const texData = new Uint8Array(texSize * texSize * 4);
    for (let py = 0; py < texSize; py++) {
      for (let px = 0; px < texSize; px++) {
        const dx = (px - 15.5) / 16;
        const dy = (py - 15.5) / 16;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (py * texSize + px) * 4;
        const alpha = dist >= 1 ? 0 : Math.floor(Math.pow(1 - dist, 1.8) * 255);
        texData[idx] = 255;
        texData[idx + 1] = 255;
        texData[idx + 2] = 255;
        texData[idx + 3] = alpha;
      }
    }
    const starTex = new THREE.DataTexture(texData, texSize, texSize, THREE.RGBAFormat);
    starTex.needsUpdate = true;

    const starMat = new THREE.PointsMaterial({
      size: 0.45,
      map: starTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    disposables.push(starGeom, starMat, starTex);
    const starField = new THREE.Points(starGeom, starMat);
    scene.add(starField);

    // 2. Floating Background Geometric Wireframes along the Scroll Axis
    // Polyhedron 1: Floating Icosahedron (Top Right / Bento level)
    const icoGeom = new THREE.IcosahedronGeometry(3.2, 0);
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      wireframe: true,
      transparent: true,
      opacity: 0.14,
    });
    disposables.push(icoGeom, icoMat);
    const icoMesh = new THREE.Mesh(icoGeom, icoMat);
    icoMesh.position.set(16, 4, -8);
    scene.add(icoMesh);

    // Polyhedron 2: Floating Torus Knot (Mid Left / Philosophy level)
    const knotGeom = new THREE.TorusKnotGeometry(2.6, 0.45, 64, 12, 2, 3);
    const knotMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });
    disposables.push(knotGeom, knotMat);
    const knotMesh = new THREE.Mesh(knotGeom, knotMat);
    knotMesh.position.set(-18, -16, -10);
    scene.add(knotMesh);

    // Polyhedron 3: Floating Dodecahedron (Bottom Right / Footer level)
    const dodecGeom = new THREE.DodecahedronGeometry(3.8, 0);
    const dodecMat = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      wireframe: true,
      transparent: true,
      opacity: 0.13,
    });
    disposables.push(dodecGeom, dodecMat);
    const dodecMesh = new THREE.Mesh(dodecGeom, dodecMat);
    dodecMesh.position.set(15, -34, -12);
    scene.add(dodecMesh);

    // Dynamic Parallax Tracking
    let targetParallaxX = 0;
    let targetParallaxY = 0;
    let currentParallaxX = 0;
    let currentParallaxY = 0;

    let targetScrollY = window.scrollY;
    let currentScrollY = window.scrollY;

    const onPointerMove = (e: MouseEvent) => {
      targetParallaxX = (e.clientX / window.innerWidth - 0.5) * 3.5;
      targetParallaxY = -(e.clientY / window.innerHeight - 0.5) * 3.5;
    };

    const onScroll = () => {
      targetScrollY = window.scrollY;
    };

    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    // Animation Loop using native performance.now() (zero console deprecation warnings)
    let animId: number;
    let lastTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = Math.min((now - lastTime) * 0.001, 0.1);
      const elapsed = now * 0.001;
      lastTime = now;

      if (!prefersReducedMotion) {
        currentParallaxX += (targetParallaxX - currentParallaxX) * 0.05;
        currentParallaxY += (targetParallaxY - currentParallaxY) * 0.05;
        currentScrollY += (targetScrollY - currentScrollY) * 0.08;

        // Camera scroll parallax (maps full document scroll to vertical 3D space)
        const scrollFactor = currentScrollY * 0.012;
        camera.position.y = -scrollFactor + currentParallaxY;
        camera.position.x = currentParallaxX;

        // Gentle harmonic rotation of background starfield
        starField.rotation.y = elapsed * 0.018;
        starField.rotation.x = Math.sin(elapsed * 0.025) * 0.08;

        // Tumble polyhedra
        icoMesh.rotation.x += delta * 0.12;
        icoMesh.rotation.y += delta * 0.18;

        knotMesh.rotation.x += delta * 0.15;
        knotMesh.rotation.z += delta * 0.1;

        dodecMesh.rotation.y += delta * 0.14;
        dodecMesh.rotation.x += delta * 0.09;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);

      disposables.forEach((d) => d.dispose());
      scene.clear();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none -z-10 overflow-hidden"
      aria-hidden="true"
    />
  );
}
