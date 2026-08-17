"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

const COUNTRIES_URL =
  "https://cdn.jsdelivr.net/npm/three-globe@2.31.0/example/country-polygons/ne_110m_admin_0_countries.geojson";

const HUBS: Record<string, [number, number]> = {
  hou: [29.7, -95.4],
  nyc: [40.7, -74.0],
  sao: [-23.5, -46.6],
  lon: [51.5, -0.1],
  zur: [47.2, 8.5],
  jnb: [-26.2, 28.0],
  dxb: [25.2, 55.3],
  mum: [19.0, 72.8],
  sin: [1.3, 103.8],
  sha: [31.2, 121.5],
  syd: [-33.8, 151.0],
  per: [-31.9, 115.9],
  tok: [35.7, 139.7],
  hkg: [22.3, 114.2],
};

const ROUTES: [string, string][] = [
  ["lon", "nyc"],
  ["nyc", "hou"],
  ["lon", "zur"],
  ["zur", "dxb"],
  ["lon", "jnb"],
  ["dxb", "mum"],
  ["mum", "sin"],
  ["sin", "sha"],
  ["sin", "per"],
  ["per", "syd"],
  ["hou", "sao"],
  ["sao", "jnb"],
  ["sha", "tok"],
  ["zur", "sin"],
  ["jnb", "dxb"],
  ["hkg", "sin"],
  ["sha", "hkg"],
  ["nyc", "lon"],
  ["tok", "syd"],
  ["dxb", "zur"],
];

type Palette = {
  globe: string;
  polygon: string;
  atmosphere: string;
  emissive: string;
  arcs: string[];
  ring: string;
  ambient: string;
  directional: string;
};

const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    globe: "#b4f0ea",
    polygon: "#087516",
    atmosphere: "#ffffff",
    emissive: "#fafafa",
    arcs: ["#ce6b07", "#f09030", "#ed9b49"],
    ring: "4,200,181",
    ambient: "#ffffff",
    directional: "#ffffff",
  },
  dark: {
    globe: "#141414",
    polygon: "#c8c8c8",
    atmosphere: "#f7b700",
    emissive: "#0c0c0c",
    arcs: ["#f7b700", "#ffd84a"],
    ring: "247,183,0",
    ambient: "#3a3a3a",
    directional: "#fff2c4",
  },
};

type ArcDatum = {
  order: number;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  arcAlt: number;
  color: string;
};

export function HeroGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();
  const paletteRef = useRef<Palette>(PALETTES.dark);
  const applyColorsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let contextLost = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let renderer: import("three").WebGLRenderer | null = null;
    let scene: import("three").Scene | null = null;
    let controls:
      | import("three/examples/jsm/controls/OrbitControls.js").OrbitControls
      | null = null;
    let onContextLost: ((e: Event) => void) | null = null;
    let arcData: ArcDatum[] = [];

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } =
        await import("three/examples/jsm/controls/OrbitControls.js");
      const ThreeGlobeModule = await import("three-globe");
      const ThreeGlobe = ThreeGlobeModule.default;

      if (disposed) return;

      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      scene = new THREE.Scene();
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch (err) {
        // Browser refused to create a WebGL context (e.g. Chrome disabled GPU
        // after repeated GPU-process crashes). Skip silently — the surrounding
        // layout still renders without the globe.
        console.warn("hero-globe: WebGL unavailable, skipping render", err);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.className = "block w-full h-full";
      container.appendChild(renderer.domElement);

      onContextLost = (e: Event) => {
        // Prevent default so the browser will attempt restoration; we simply
        // stop rendering rather than trying to rebuild the scene in place.
        e.preventDefault();
        contextLost = true;
        cancelAnimationFrame(raf);
      };
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);

      const camera = new THREE.PerspectiveCamera(45, 1, 100, 1800);
      camera.position.set(0, 130, 290);

      const ambient = new THREE.AmbientLight(0xffffff, 0.9);
      const dirL = new THREE.DirectionalLight(0xffffff, 0.7);
      dirL.position.set(-200, 200, 200);
      const dirT = new THREE.DirectionalLight(0xffffff, 0.4);
      dirT.position.set(0, 400, 100);
      const point = new THREE.PointLight(0xffffff, 0.7);
      point.position.set(-180, 180, 360);
      scene.add(ambient, dirL, dirT, point);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minPolarAngle = Math.PI / 3.2;
      controls.maxPolarAngle = Math.PI - Math.PI / 3.2;
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.6;

      const globe = new ThreeGlobe({
        waitForGlobeReady: true,
        animateIn: true,
      });
      scene.add(globe);

      globe.rotateY(-Math.PI / 2.2);
      globe.rotateZ(-Math.PI / 8);

      // ---- Arcs, points, rings ----
      const palette = paletteRef.current;
      arcData = ROUTES.map(([a, b], i) => ({
        order: i % 8,
        startLat: HUBS[a][0],
        startLng: HUBS[a][1],
        endLat: HUBS[b][0],
        endLng: HUBS[b][1],
        arcAlt: 0.14 + (i % 5) * 0.05,
        color: palette.arcs[i % palette.arcs.length],
      }));

      globe
        .arcsData(arcData)
        .arcColor("color")
        .arcAltitude("arcAlt")
        .arcStroke(0.5)
        .arcDashLength(reduce ? 1 : 0.5)
        .arcDashGap(reduce ? 0 : 3)
        .arcDashInitialGap((d: unknown) => (d as ArcDatum).order)
        .arcDashAnimateTime(reduce ? 0 : 2200);

      const pts = Object.values(HUBS).map(([lat, lng]) => ({ lat, lng }));
      globe
        .pointsData(pts)
        .pointColor(() => palette.arcs[0])
        .pointAltitude(0)
        .pointRadius(0.42);

      if (!reduce) {
        const ringHubs = ["lon", "nyc", "sin", "dxb", "sao"].map((k) => ({
          lat: HUBS[k][0],
          lng: HUBS[k][1],
        }));
        globe
          .ringsData(ringHubs)
          .ringColor(
            () => (t: number) =>
              `rgba(${paletteRef.current.ring},${Math.sqrt(1 - t)})`,
          )
          .ringMaxRadius(4)
          .ringPropagationSpeed(2.2)
          .ringRepeatPeriod(1400);
      }

      // ---- Themed material + light colors (re-callable) ----
      const applyColors = () => {
        const p = paletteRef.current;
        const mat = globe.globeMaterial() as import("three").MeshPhongMaterial;
        mat.color = new THREE.Color(p.globe);
        mat.emissive = new THREE.Color(p.emissive);
        mat.emissiveIntensity = 0.12;
        mat.shininess = 0.7;

        globe
          .showAtmosphere(true)
          .atmosphereColor(p.atmosphere)
          .atmosphereAltitude(0.16);

        globe.hexPolygonColor(() => p.polygon);

        ambient.color = new THREE.Color(p.ambient);
        dirL.color = new THREE.Color(p.directional);
        point.color = new THREE.Color(p.directional);

        arcData.forEach((d, i) => {
          d.color = p.arcs[i % p.arcs.length];
        });
        globe.arcColor("color");
      };
      applyColors();
      applyColorsRef.current = applyColors;

      // ---- Country polygons (hex-dot fill) ----
      try {
        const res = await fetch(COUNTRIES_URL);
        const geo = (await res.json()) as { features: object[] };
        if (disposed) return;
        globe
          .hexPolygonsData(geo.features)
          .hexPolygonResolution(3)
          .hexPolygonMargin(0.62)
          .hexPolygonUseDots(true)
          .hexPolygonColor(() => paletteRef.current.polygon);
      } catch (err) {
        console.warn("hero-globe: country data failed to load", err);
      }

      // ---- Resize ----
      const resize = () => {
        if (!renderer) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      const tick = () => {
        if (disposed || contextLost) return;
        raf = requestAnimationFrame(tick);
        controls!.update();
        renderer!.render(scene!, camera);
      };
      tick();
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      applyColorsRef.current = null;
      controls?.dispose();
      if (scene) {
        scene.traverse((obj) => {
          const mesh = obj as Partial<import("three").Mesh>;
          mesh.geometry?.dispose();
          const mat = mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        });
        scene.clear();
      }
      if (renderer) {
        if (onContextLost) {
          renderer.domElement.removeEventListener(
            "webglcontextlost",
            onContextLost,
          );
        }
        // Frees the underlying WebGL context immediately rather than waiting
        // for GC — critical during dev HMR where the context cap is easy to hit.
        renderer.forceContextLoss();
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, []);

  // Re-apply palette when the theme changes, without rebuilding the scene.
  useEffect(() => {
    const mode = resolvedTheme === "light" ? "light" : "dark";
    paletteRef.current = PALETTES[mode];
    applyColorsRef.current?.();
  }, [resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      aria-hidden="true"
    />
  );
}
