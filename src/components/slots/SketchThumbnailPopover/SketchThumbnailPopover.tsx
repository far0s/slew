import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import styles from "./SketchThumbnailPopover.module.css";

const SIZE = 128;
const GAP = 6;
export const HOVER_DELAY_MS = 300;

export function SketchThumbnailPopover({
  thumbnail,
  anchorRect,
}: {
  thumbnail: string | undefined;
  anchorRect: DOMRect;
}) {
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const showAbove = spaceBelow < SIZE + GAP * 2;
  const top = showAbove ? anchorRect.top - SIZE - GAP : anchorRect.bottom + GAP;
  const left = Math.min(anchorRect.left, window.innerWidth - SIZE - 8);
  const yOffset = showAbove ? -4 : 4;

  return createPortal(
    <motion.div
      className={styles.preview}
      style={{ top, left, width: SIZE, height: SIZE }}
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: yOffset }}
      transition={{ duration: 0.12, ease: "easeOut" }}
    >
      {thumbnail ? (
        <img src={thumbnail} alt="" className={styles.img} draggable={false} />
      ) : (
        <div className={styles.empty}>No preview</div>
      )}
    </motion.div>,
    document.body,
  );
}

export function useSketchThumbnailHover() {
  const [hovered, setHovered] = useState<{
    thumbnail: string | undefined;
    rect: DOMRect;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onMouseEnter(e: React.MouseEvent, thumbnail: string | undefined) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => setHovered({ thumbnail, rect }),
      HOVER_DELAY_MS,
    );
  }

  function onMouseLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setHovered(null);
  }

  const popover = (
    <AnimatePresence>
      {hovered && (
        <SketchThumbnailPopover
          key="thumb"
          thumbnail={hovered.thumbnail}
          anchorRect={hovered.rect}
        />
      )}
    </AnimatePresence>
  );

  return { onMouseEnter, onMouseLeave, popover };
}
