"use client";

/**
 * The recorded run as a lit scene: one lane per proposal, receding in depth.
 *
 * A proposal that lowered the weighted cost is a solid post in the kept colour,
 * as tall as the cost it left behind. One that moved the cost by nothing is a
 * flat plate in the refused colour at the level it started and ended on, on a
 * thin stem, because there is no change to give it height. Posts rise and plates
 * lift as the replay reaches them. Edges are brighter than 1.0 so the bloom pass
 * picks them up and nothing else.
 */

import { Edges, Line } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { easeOutCubic, KEPT, REFUSED, type Rgb } from "./ramp";
import type { Slab } from "./run-trajectory-3d";

const WIDTH = 9;
const HEIGHT = 2.6;
const DEPTH_STEP = 0.2;
const RISE_MS = 520;

function toColor({ r, g, b }: Rgb, gain = 1): THREE.Color {
  return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear().multiplyScalar(gain);
}

const KEPT_COLOR = toColor(KEPT);
const REFUSED_COLOR = toColor(REFUSED);
const DIM_COLOR = new THREE.Color(0.16, 0.18, 0.22);

interface Layout {
  lane: number;
  post: number;
  levelOf: (value: number) => number;
  xOf: (index: number) => number;
  zOf: (index: number) => number;
}

function layoutFor(total: Slab[]): Layout {
  const values = total.flatMap((slab) => [slab.before, slab.after]);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const span = high - low || 1;
  const ceiling = high + span * 0.12;
  const floor = low - span * 0.35;
  const lane = WIDTH / Math.max(1, total.length);
  return {
    lane,
    post: lane * 0.52,
    levelOf: (value) => ((value - floor) / (ceiling - floor)) * HEIGHT,
    xOf: (index) => -WIDTH / 2 + lane * (index + 0.5),
    zOf: (index) => -index * DEPTH_STEP,
  };
}

interface SlabProps {
  slab: Slab;
  index: number;
  shown: boolean;
  hovered: number | null;
  layout: Layout;
  reduced: boolean;
  register: (index: number, mesh: THREE.Mesh | null) => void;
}

function SlabMesh({ slab, index, shown, hovered, layout, reduced, register }: SlabProps) {
  const group = useRef<THREE.Group>(null);
  const arrived = useRef(0);
  const isHovered = hovered === index;
  const dimmed = hovered !== null && !isHovered;
  const base = slab.improved ? KEPT_COLOR : REFUSED_COLOR;
  const edge = dimmed ? DIM_COLOR : base.clone().multiplyScalar(isHovered ? 5 : 2.6);

  const top = layout.levelOf(slab.improved ? slab.after : slab.before);
  const x = layout.xOf(index);
  const z = layout.zOf(index);
  const w = layout.post;

  useFrame(() => {
    const node = group.current;
    if (node === null) return;
    if (!shown) {
      arrived.current = 0;
      node.visible = false;
      return;
    }
    if (arrived.current === 0) arrived.current = performance.now();
    const rise = reduced ? 1 : easeOutCubic(Math.min(1, (performance.now() - arrived.current) / RISE_MS));
    node.visible = true;
    if (slab.improved) {
      node.scale.set(1, Math.max(0.001, rise), 1);
    } else {
      node.scale.set(0.55 + rise * 0.45, 1, 0.55 + rise * 0.45);
      node.position.y = top * rise;
    }
  });

  if (slab.improved) {
    return (
      <group ref={group} position={[x, 0, z]} visible={false}>
        <mesh position={[0, top / 2, 0]}>
          <boxGeometry args={[w, top, w * 0.8]} />
          <meshStandardMaterial
            color={dimmed ? DIM_COLOR : base}
            emissive={base}
            emissiveIntensity={dimmed ? 0.05 : isHovered ? 0.55 : 0.28}
            roughness={0.35}
            metalness={0.1}
            transparent
            opacity={dimmed ? 0.45 : 0.92}
          />
          <Edges color={edge} toneMapped={false} />
        </mesh>
        <HitBox index={index} height={top} width={layout.lane} register={register} />
      </group>
    );
  }

  return (
    <group ref={group} position={[x, 0, z]} visible={false}>
      <mesh>
        <boxGeometry args={[w * 1.25, 0.05, w]} />
        <meshStandardMaterial
          color={dimmed ? DIM_COLOR : base}
          emissive={base}
          emissiveIntensity={dimmed ? 0.05 : isHovered ? 1.4 : 0.8}
          toneMapped={false}
        />
        <Edges color={edge} toneMapped={false} />
      </mesh>
      <Line
        points={[
          [0, 0, 0],
          [0, -top, 0],
        ]}
        color={dimmed ? DIM_COLOR : base}
        lineWidth={1}
        transparent
        opacity={0.35}
        raycast={() => null}
      />
      <group position={[0, -top, 0]}>
        <HitBox index={index} height={top} width={layout.lane} register={register} />
      </group>
    </group>
  );
}

/** An invisible column over a whole lane, so a thin plate is as easy to point at as a post. */
function HitBox({
  index,
  height,
  width,
  register,
}: {
  index: number;
  height: number;
  width: number;
  register: (index: number, mesh: THREE.Mesh | null) => void;
}) {
  return (
    <mesh
      position={[0, Math.max(height, 0.4) / 2, 0]}
      userData={{ index }}
      ref={(mesh) => register(index, mesh)}
    >
      <boxGeometry args={[width, Math.max(height, 0.4) + 0.3, 0.6]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  );
}

function Floor({ count, layout }: { count: number; layout: Layout }) {
  const segments = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const x = layout.xOf(i);
        const z = layout.zOf(i);
        return [
          [x - layout.lane * 0.42, 0, z],
          [x + layout.lane * 0.42, 0, z],
        ] as [number, number, number][];
      }),
    [count, layout],
  );
  return (
    <group>
      {segments.map((points, i) => (
        <Line key={i} points={points} color="#7d8694" lineWidth={1} transparent opacity={0.2} raycast={() => null} />
      ))}
    </group>
  );
}

type Pointer = { x: number; y: number; inside: boolean };

function Rig({ pointer, reduced, center }: { pointer: React.RefObject<Pointer>; reduced: boolean; center: THREE.Vector3 }) {
  const eased = useRef({ x: 0, y: 0 });
  const framed = useRef("");

  useFrame(({ camera, size }) => {
    const key = `${size.width}x${size.height}`;
    if (framed.current !== key) {
      framed.current = key;
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.min(size.width / (WIDTH * 1.18), size.height / (HEIGHT * 1.55));
      ortho.updateProjectionMatrix();
    }
    const state = pointer.current;
    const target = reduced || !state.inside ? { x: 0, y: 0 } : state;
    eased.current.x += (target.x - eased.current.x) * 0.07;
    eased.current.y += (target.y - eased.current.y) * 0.07;
    // The viewpoint moves, never the slabs: a reader aiming at a lane finds it where they saw it.
    const azimuth = -0.38 + eased.current.x * 0.12;
    const elevation = 0.3 - eased.current.y * 0.08;
    const radius = 20;
    camera.position.set(
      center.x + Math.sin(azimuth) * Math.cos(elevation) * -radius,
      center.y + Math.sin(elevation) * radius,
      center.z + Math.cos(azimuth) * Math.cos(elevation) * radius,
    );
    camera.lookAt(center);
  });

  return null;
}

function HoverTracker({
  pointer,
  meshes,
  onHover,
}: {
  pointer: React.RefObject<Pointer>;
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
      const targets = meshes.current.filter(
        (mesh): mesh is THREE.Mesh => mesh !== null && mesh.parent?.visible !== false,
      );
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

export default function TrajectoryScene({
  slabs,
  total,
  hovered,
  onHover,
  className,
}: {
  slabs: Slab[];
  total: Slab[];
  hovered: number | null;
  onHover: (index: number | null) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0, inside: false });
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const layout = useMemo(() => layoutFor(total), [total]);
  const center = useMemo(() => new THREE.Vector3(0, HEIGHT * 0.42, -((total.length - 1) * DEPTH_STEP) / 2), [total.length]);

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

  useEffect(() => {
    const element = wrap.current;
    if (element === null) return;
    const watcher = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "120px",
    });
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
      onPointerLeave={() => {
        pointer.current = { x: 0, y: 0, inside: false };
        onHover(null);
      }}
    >
      <Canvas
        orthographic
        dpr={[1, 2]}
        // The replay keeps adding slabs, so this one animates whenever it is on screen.
        frameloop={visible ? "always" : "never"}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 6, 20], near: 0.1, far: 100 }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[-4, 8, 6]} intensity={1.6} />
        <Rig pointer={pointer} reduced={reduced} center={center} />
        <HoverTracker pointer={pointer} meshes={meshes} onHover={onHover} />
        <Floor count={total.length} layout={layout} />
        {total.map((slab, index) => (
          <SlabMesh
            key={`${index}-${slab.label}`}
            slab={slab}
            index={index}
            shown={index < slabs.length}
            hovered={hovered}
            layout={layout}
            reduced={reduced}
            register={register}
          />
        ))}
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={1} intensity={0.9} radius={0.65} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
