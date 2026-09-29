"use client";

/**
 * The ridgeline as a lit WebGL scene: the same data and ramp as the canvas
 * version, drawn as curtains standing in depth with a bloom pass on their rims.
 *
 * The camera is orthographic on purpose. A ridgeline is read by comparing
 * heights across rows, and perspective would shrink the back rows for a reason
 * that has nothing to do with the data. Depth comes from the camera angle,
 * occlusion and haze.
 *
 * Only the rims are brighter than 1.0, so they are the only thing the bloom
 * pass picks up; the fills stay flat colour.
 */

import { Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { AXIS, RIDGES, type MethodRidge } from "@/lib/method-ridges";

import { css, easeOutCubic, rampAt, type Rgb } from "./ramp";

/** Scene units. */
const WIDTH = 10;
const HEIGHT = 1.55;
const SPACING = 0.72;
const DEPTH = (RIDGES.length - 1) * SPACING;
const CENTER = new THREE.Vector3(0.9, 0.5, -DEPTH / 2);

const ENTRANCE_MS = 1700;
const BACKGROUND = new THREE.Color("#07080b");

function label(method: string): string {
  return method.replace(/_/g, " ");
}

function toColor({ r, g, b }: Rgb, gain = 1): THREE.Color {
  return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear().multiplyScalar(gain);
}

function xAt(index: number): number {
  return (index / (AXIS.length - 1)) * WIDTH - WIDTH / 2;
}

/** A filled curtain from the floor up to the density curve, coloured top to bottom. */
function curtainGeometry(ridge: MethodRidge, colour: Rgb): THREE.BufferGeometry {
  const count = ridge.density.length;
  const positions = new Float32Array(count * 2 * 3);
  const colours = new Float32Array(count * 2 * 3);
  const top = toColor(colour);
  const bottom = BACKGROUND.clone().convertSRGBToLinear();

  for (let i = 0; i < count; i += 1) {
    const x = xAt(i);
    const y = ridge.density[i] * HEIGHT;
    positions.set([x, y, 0, x, 0, 0], i * 6);
    // Brightness follows height, so a tall peak glows and a flat tail does not.
    const lift = 0.35 + 0.65 * ridge.density[i];
    const upper = bottom.clone().lerp(top, lift * 0.55);
    colours.set([upper.r, upper.g, upper.b, bottom.r, bottom.g, bottom.b], i * 6);
  }

  const indices: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  return geometry;
}

interface RidgeProps {
  ridge: MethodRidge;
  index: number;
  hovered: number | null;
  register: (index: number, mesh: THREE.Mesh | null) => void;
  reduced: boolean;
  start: React.RefObject<number>;
}

function Ridge({ ridge, index, hovered, register, reduced, start }: RidgeProps) {
  const group = useRef<THREE.Group>(null);
  const colour = useMemo(() => rampAt(index, RIDGES.length), [index]);
  const geometry = useMemo(() => curtainGeometry(ridge, colour), [ridge, colour]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const rim = useMemo(
    () => ridge.density.map((d, i) => [xAt(i), d * HEIGHT, 0] as [number, number, number]),
    [ridge],
  );

  const isHovered = hovered === index;
  const dimmed = hovered !== null && !isHovered;

  useFrame(({ clock }) => {
    const node = group.current;
    if (node === null) return;
    const elapsed = performance.now() - (start.current ?? 0);
    const entrance = reduced ? 1 : easeOutCubic(Math.min(1, elapsed / ENTRANCE_MS));
    // Back rows rise first, each a little after the one behind it.
    const stagger = (RIDGES.length - 1 - index) / RIDGES.length;
    const local = Math.max(0.001, Math.min(1, (entrance - stagger * 0.45) / 0.55));
    const breath = reduced ? 1 : 1 + Math.sin(clock.elapsedTime / 2.6 + index * 0.9) * 0.022;
    node.scale.y = local * breath;
  });

  return (
    <group ref={group} position={[0, 0, -index * SPACING]}>
      <mesh
        geometry={geometry}
        userData={{ index }}
        ref={(mesh) => {
          register(index, mesh);
        }}
      >
        <meshBasicMaterial
          vertexColors
          side={THREE.DoubleSide}
          transparent
          opacity={dimmed ? 0.35 : 0.96}
          depthWrite={!dimmed}
        />
      </mesh>
      <Line
        points={rim}
        raycast={() => null}
        color={dimmed ? new THREE.Color(0.18, 0.2, 0.24) : toColor(colour, isHovered ? 4.2 : 2.3)}
        lineWidth={isHovered ? 3.2 : 1.8}
        toneMapped={false}
        transparent
        opacity={dimmed ? 0.5 : 1}
      />
    </group>
  );
}

function Floor() {
  const lines = useMemo(() => {
    const out: [number, number, number][][] = [];
    for (let i = 0; i <= 5; i += 1) {
      const x = -WIDTH / 2 + (i / 5) * WIDTH;
      out.push([
        [x, 0, SPACING * 0.4],
        [x, 0, -DEPTH - SPACING * 0.4],
      ]);
    }
    out.push([
      [-WIDTH / 2, 0, SPACING * 0.4],
      [WIDTH / 2, 0, SPACING * 0.4],
    ]);
    return out;
  }, []);
  return (
    <group>
      {lines.map((points, i) => (
        <Line key={i} points={points} raycast={() => null} color="#7d8694" lineWidth={1} transparent opacity={0.16} />
      ))}
    </group>
  );
}

const MAX_AXIS = AXIS[AXIS.length - 1];
const TICKS = [0, 0.2, 0.4, 0.6, 0.8].filter((value) => value <= MAX_AXIS);

/** Where each DOM label is pinned in the scene. Names sit past the tails, where nothing covers them. */
const ANCHORS: { key: string; at: THREE.Vector3 }[] = [
  ...RIDGES.map((ridge, index) => ({
    key: ridge.method,
    at: new THREE.Vector3(WIDTH / 2 + 0.22, 0.04, -index * SPACING),
  })),
  ...TICKS.map((value) => ({
    key: `tick-${value}`,
    at: new THREE.Vector3((value / MAX_AXIS) * WIDTH - WIDTH / 2, 0, SPACING * 1.05),
  })),
];

/** Projects the anchors every frame and moves the DOM labels onto them. */
function LabelTracker({ labels }: { labels: React.RefObject<(HTMLSpanElement | null)[]> }) {
  const scratch = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const elements = labels.current;
    if (elements === null) return;
    ANCHORS.forEach((anchor, i) => {
      const element = elements[i];
      if (!element) return;
      scratch.copy(anchor.at).project(camera);
      const x = ((scratch.x + 1) / 2) * size.width;
      const y = ((1 - scratch.y) / 2) * size.height;
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      element.style.visibility = "visible";
    });
  });
  return null;
}

/** Eases the camera toward the pointer and keeps the scene framed at any width. */
function Rig({ pointer, reduced }: { pointer: React.RefObject<{ x: number; y: number }>; reduced: boolean }) {
  const eased = useRef({ x: 0, y: 0 });
  const framed = useRef("");
  const invalidate = useThree((state) => state.invalidate);

  // A resize has to draw a frame even when the loop is idle.
  useEffect(() => {
    const onResize = () => invalidate();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [invalidate]);

  useFrame(({ camera, size }) => {
    const key = `${size.width}x${size.height}`;
    if (framed.current !== key) {
      framed.current = key;
      const ortho = camera as THREE.OrthographicCamera;
      // Fit the scene's footprint, with room on the left for the names.
      ortho.zoom = Math.min(size.width / (WIDTH * 1.6), size.height / 6.5);
      ortho.updateProjectionMatrix();
    }

    const target = reduced ? { x: 0, y: 0 } : (pointer.current ?? { x: 0, y: 0 });
    eased.current.x += (target.x - eased.current.x) * 0.06;
    eased.current.y += (target.y - eased.current.y) * 0.06;
    // Moving right swings the view as though the reader stepped to the right.
    const azimuth = -0.62 + eased.current.x * 0.22;
    const elevation = 0.5 - eased.current.y * 0.12;
    const radius = 20;
    camera.position.set(
      CENTER.x + Math.sin(azimuth) * Math.cos(elevation) * -radius,
      CENTER.y + Math.sin(elevation) * radius,
      CENTER.z + Math.cos(azimuth) * Math.cos(elevation) * radius,
    );
    camera.lookAt(CENTER);
  });

  return null;
}

/**
 * Picks the ridge under the pointer by casting against the curtains each frame.
 * The nearest hit wins, so a front ridge covers the ones behind it, which is
 * what the eye expects.
 */
function HoverTracker({
  pointer,
  meshes,
  onHover,
}: {
  pointer: React.RefObject<{ x: number; y: number; inside: boolean }>;
  meshes: React.RefObject<(THREE.Mesh | null)[]>;
  onHover: (index: number | null) => void;
}) {
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const last = useRef<number | null>(null);

  useFrame(({ camera, raycaster }) => {
    const state = pointer.current;
    let next: number | null = null;
    if (state.inside) {
      ndc.set(state.x, -state.y);
      raycaster.setFromCamera(ndc, camera);
      const targets = meshes.current.filter((mesh): mesh is THREE.Mesh => mesh !== null);
      const hit = raycaster.intersectObjects(targets, false)[0];
      next = hit ? (hit.object.userData.index as number) : null;
    }
    if (next !== last.current) {
      last.current = next;
      onHover(next);
    }
  });

  return null;
}

export default function RidgelineScene({
  hovered,
  onHover,
  className,
}: {
  hovered: number | null;
  onHover: (index: number | null) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ x: 0, y: 0, inside: false });
  const start = useRef(0);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);

  const register = useCallback((index: number, mesh: THREE.Mesh | null) => {
    meshes.current[index] = mesh;
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Render only while on screen; off screen the canvas keeps its last frame.
  useEffect(() => {
    const element = wrap.current;
    if (element === null) return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && start.current === 0) start.current = performance.now();
        setVisible(entry.isIntersecting);
      },
      { rootMargin: "120px" },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, []);

  return (
    <div
      ref={wrap}
      className={`relative ${className ?? ""}`}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.current = {
          x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
          y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
          inside: true,
        };
      }}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => {
        pointer.current = { x: 0, y: 0, inside: false };
        setPointerInside(false);
        onHover(null);
      }}
    >
      <Canvas
        orthographic
        dpr={[1, 1.5]}
        // Reduced motion draws only on demand, except while the pointer is over
        // the chart, where hover still has to be picked up every frame.
        frameloop={visible ? (reduced && !pointerInside ? "demand" : "always") : "never"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 6, 20], near: 0.1, far: 100 }}
      >
        <Rig pointer={pointer} reduced={reduced} />
        <HoverTracker pointer={pointer} meshes={meshes} onHover={onHover} />
        <LabelTracker labels={labels} />
        <Floor />
        {RIDGES.map((ridge, index) => (
          <Ridge
            key={ridge.method}
            ridge={ridge}
            index={index}
            hovered={hovered}
            register={register}
            reduced={reduced}
            start={start}
          />
        ))}
        <EffectComposer multisampling={2}>
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.85} radius={0.7} />
        </EffectComposer>
      </Canvas>

      {/* DOM rather than canvas text: crisp at any size, selectable, read aloud. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {ANCHORS.map((anchor, i) => {
          const ridgeIndex = i < RIDGES.length ? i : null;
          const tick = ridgeIndex === null ? TICKS[i - RIDGES.length] : null;
          const isHovered = ridgeIndex !== null && hovered === ridgeIndex;
          const dimmed = ridgeIndex !== null && hovered !== null && !isHovered;
          return (
            <span
              key={anchor.key}
              ref={(element) => {
                labels.current[i] = element;
              }}
              className="absolute left-0 top-0 whitespace-nowrap font-terminal tabular-nums will-change-transform"
              style={{ visibility: "hidden" }}
            >
              <span
                className={`block transition-[color,opacity] duration-200 ${
                  tick === null ? "-translate-y-1/2 text-[0.72rem]" : "-translate-x-1/2 text-[0.68rem]"
                }`}
                style={{
                  color: isHovered ? css(rampAt(i, RIDGES.length)) : "var(--muted)",
                  opacity: dimmed ? 0.35 : 1,
                }}
              >
                {tick === null ? label(RIDGES[i].method) : `${Math.round(tick * 100)}%`}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
