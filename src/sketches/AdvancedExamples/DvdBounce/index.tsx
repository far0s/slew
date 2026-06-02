import { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { SketchProps } from "@/sketches/types";
import { makeImageStorageKey } from "@/components/parameters/ImageInput";
import { DEFAULT_LOGO_DATA_URL } from "./defaultLogo";
import { descriptor } from "./descriptor";

const IMAGE_STORAGE_KEY = makeImageStorageKey("dvdBounce", "dvd_image");

export { descriptor };

// Curated neon bounce palette — cycles in order, never random.
const BOUNCE_PALETTE: [number, number, number][] = [
  [0, 200, 255],   // electric cyan
  [255, 60, 200],  // hot pink
  [80, 255, 80],   // lime
  [255, 180, 0],   // amber
  [200, 100, 255], // purple
  [255, 80, 80],   // coral
  [0, 255, 200],   // mint
  [255, 220, 50],  // yellow
];

function rgbToThreeColor(rgb: [number, number, number]): THREE.Color {
  return new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
}

function loadTexture(dataUrl: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(
      dataUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

interface BounceState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  paletteIdx: number;
}

const TRAIL_COUNT = 6;

export function DvdBounce({ opacity, params, setOpacityOverride }: SketchProps) {
  const speed = params?.dvdSpeed ?? 1;
  const scale = params?.dvdScale ?? 0.18;
  const glow = params?.dvdGlow ?? 0.4;
  const trail = params?.dvdTrail ?? 0;

  const { viewport } = useThree();

  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [imageAspect, setImageAspect] = useState(2.5);

  const applyDataUrl = (url: string) => {
    loadTexture(url).then((tex) => {
      const img = tex.image as HTMLImageElement;
      setImageAspect(img.width / img.height);
      setTexture(tex);
    }).catch(() => {});
  };

  useEffect(() => {
    const stored = localStorage.getItem(IMAGE_STORAGE_KEY);
    applyDataUrl(stored ?? DEFAULT_LOGO_DATA_URL);

    const handler = (e: Event) => {
      const { dataUrl } = (e as CustomEvent<{ dataUrl: string | null }>).detail;
      applyDataUrl(dataUrl ?? DEFAULT_LOGO_DATA_URL);
    };
    window.addEventListener(IMAGE_STORAGE_KEY, handler);
    return () => window.removeEventListener(IMAGE_STORAGE_KEY, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);

  const mainMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => {
    return () => {
      mainMat.dispose();
      glowMat.dispose();
    };
  }, [mainMat, glowMat]);

  useEffect(() => {
    if (!texture) return;
    mainMat.map = texture;
    mainMat.needsUpdate = true;
    glowMat.map = texture;
    glowMat.needsUpdate = true;
  }, [texture, mainMat, glowMat]);

  useEffect(() => {
    mainMat.opacity = opacity;
    glowMat.opacity = opacity * glow * 0.4;
  }, [opacity, glow, mainMat, glowMat]);

  useEffect(() => {
    setOpacityOverride?.((v) => {
      mainMat.opacity = v;
      glowMat.opacity = v * glow * 0.4;
    });
  }, [setOpacityOverride, mainMat, glowMat, glow]);

  const stateRef = useRef<BounceState>({
    x: 0,
    y: 0,
    vx: 1,
    vy: 0.7,
    paletteIdx: 0,
  });

  const colorRef = useRef<THREE.Color>(rgbToThreeColor(BOUNCE_PALETTE[0]));

  const mainMeshRef = useRef<THREE.Mesh>(null);
  const glowMeshRef = useRef<THREE.Mesh>(null);

  const trailMeshRefs = useRef<(THREE.Mesh | null)[]>(Array(TRAIL_COUNT).fill(null));
  const trailMats = useMemo(() =>
    Array.from({ length: TRAIL_COUNT }, () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    ), []);

  useEffect(() => {
    if (!texture) return;
    trailMats.forEach((m) => {
      m.map = texture;
      m.needsUpdate = true;
    });
  }, [texture, trailMats]);

  useEffect(() => {
    return () => trailMats.forEach((m) => m.dispose());
  }, [trailMats]);

  const posHistoryRef = useRef<{ x: number; y: number }[]>([]);

  useFrame((_, delta) => {
    const st = stateRef.current;
    const vw = viewport.width;
    const vh = viewport.height;

    const logoH = vh * scale;
    const logoW = logoH * imageAspect;
    const halfW = logoW / 2;
    const halfH = logoH / 2;

    const baseSpeed = Math.min(vw, vh) * 0.6 * speed;
    const mag = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
    const nx = (st.vx / mag) * baseSpeed;
    const ny = (st.vy / mag) * baseSpeed;

    let newX = st.x + nx * delta;
    let newY = st.y + ny * delta;
    let newVx = st.vx;
    let newVy = st.vy;
    let bounced = false;

    const right = vw / 2 - halfW;
    const left = -vw / 2 + halfW;
    const top = vh / 2 - halfH;
    const bottom = -vh / 2 + halfH;

    if (newX > right) { newX = right; newVx = -Math.abs(newVx); bounced = true; }
    if (newX < left)  { newX = left;  newVx =  Math.abs(newVx); bounced = true; }
    if (newY > top)   { newY = top;   newVy = -Math.abs(newVy); bounced = true; }
    if (newY < bottom){ newY = bottom; newVy = Math.abs(newVy); bounced = true; }

    if (bounced) {
      st.paletteIdx = (st.paletteIdx + 1) % BOUNCE_PALETTE.length;
      colorRef.current = rgbToThreeColor(BOUNCE_PALETTE[st.paletteIdx]);
    }

    st.x = newX;
    st.y = newY;
    st.vx = newVx;
    st.vy = newVy;

    posHistoryRef.current.unshift({ x: newX, y: newY });
    if (posHistoryRef.current.length > TRAIL_COUNT * 3) {
      posHistoryRef.current.length = TRAIL_COUNT * 3;
    }

    if (mainMeshRef.current) {
      mainMeshRef.current.position.set(newX, newY, 0);
      mainMeshRef.current.scale.set(logoW, logoH, 1);
      (mainMeshRef.current.material as THREE.MeshBasicMaterial).color = colorRef.current;
    }

    if (glowMeshRef.current) {
      glowMeshRef.current.position.set(newX, newY, -0.01);
      glowMeshRef.current.scale.set(logoW * 1.3, logoH * 1.3, 1);
      (glowMeshRef.current.material as THREE.MeshBasicMaterial).color = colorRef.current;
    }

    trailMeshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const histIdx = (i + 1) * 3;
      const pos = posHistoryRef.current[histIdx];
      if (!pos) { mesh.visible = false; return; }
      const trailOpacity = trail * opacity * (1 - (i + 1) / (TRAIL_COUNT + 1)) * 0.4;
      mesh.visible = trail > 0.01 && trailOpacity > 0.005;
      mesh.position.set(pos.x, pos.y, -0.02 - i * 0.01);
      mesh.scale.set(logoW, logoH, 1);
      (mesh.material as THREE.MeshBasicMaterial).color = colorRef.current;
      (mesh.material as THREE.MeshBasicMaterial).opacity = trailOpacity;
    });
  });

  return (
    <group>
      {trailMats.map((mat, i) => (
        <mesh
          key={`trail-${i}`}
          ref={(el) => { trailMeshRefs.current[i] = el; }}
        >
          <planeGeometry args={[1, 1]} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}

      <mesh ref={glowMeshRef}>
        <planeGeometry args={[1, 1]} />
        <primitive object={glowMat} attach="material" />
      </mesh>

      <mesh ref={mainMeshRef}>
        <planeGeometry args={[1, 1]} />
        <primitive object={mainMat} attach="material" />
      </mesh>

    </group>
  );
}

export default DvdBounce;
