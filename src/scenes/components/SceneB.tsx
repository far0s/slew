import * as THREE from "three";
import type { SceneProps } from "../sceneComponents";

/**
 * Scene B — orange cube used as the default "next" scene in crossfades.
 *
 * Only `opacity` is currently used; additional params can be wired in
 * later via `SceneProps["params"]` if needed.
 */
export function SceneB({ opacity }: SceneProps) {
  // Simple “energy” object for now: a slightly larger warm-colored cube.
  // We keep this stateless; any motion/animation can be added later.
  return (
    <mesh rotation={[0.3, -0.4, 0]}>
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial
        color={new THREE.Color("#f97316")}
        metalness={0.4}
        roughness={0.25}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

export default SceneB;
