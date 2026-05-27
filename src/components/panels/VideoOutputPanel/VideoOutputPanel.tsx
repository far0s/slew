/**
 * VideoOutputPanel
 *
 * Control panel for video output settings organized in three sections:
 * - Renderer: Stats, DPR controls, backend info
 * - Output: Syphon, NDI, Spout backends with toggle controls
 * - Recording: Placeholder for future recording feature
 */

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  QuestionMarkCircledIcon,
} from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";
import { useBufferPoolStats } from "@/outputs/videoOutput";
import { useRendererSettings } from "@/hooks";
import styles from "./VideoOutputPanel.module.css";

/**
 * Collapsible section wrapper
 */
function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDownIcon className={styles.sectionChevron} />
        ) : (
          <ChevronRightIcon className={styles.sectionChevron} />
        )}
        <span className={styles.sectionTitle}>{title}</span>
        {badge}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, overflow: "visible" }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={styles.sectionContent}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Renderer stats and DPR controls section
 */
function RendererSection() {
  const { settings, info, setDpr, setPreviewStreamFps } = useRendererSettings();
  const { hitRate } = useBufferPoolStats();
  const [showDprInfo, setShowDprInfo] = useState(false);
  const [showPreviewFpsInfo, setShowPreviewFpsInfo] = useState(false);

  const dprOptions = [
    {
      value: 0.25,
      label: "0.25×",
      description: "Quarter resolution (fastest)",
    },
    { value: 0.5, label: "0.5×", description: "Half resolution (fast)" },
    { value: 1, label: "1×", description: "Native resolution" },
    { value: 2, label: "2×", description: "Retina quality (4× pixels)" },
  ];

  const previewFpsOptions = [
    { value: 15, label: "15", description: "Low bandwidth" },
    { value: 30, label: "30", description: "Balanced (recommended)" },
    { value: 45, label: "45", description: "Smoother" },
    { value: 60, label: "60", description: "Maximum smoothness" },
  ];

  return (
    <Section title="Renderer">
      <div className={styles.rendererContent}>
        {info ? (
          <>
            <div className={styles.statsGrid}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Window</span>
                <span className={styles.statValue}>
                  {info.windowWidth}&nbsp;×&nbsp;{info.windowHeight}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Render</span>
                <span className={styles.statValue}>
                  {info.renderWidth}&nbsp;×&nbsp;{info.renderHeight}
                  <span className={styles.statUnit}>px</span>
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Backend</span>
                <span className={styles.statValue} data-backend={info.backend}>
                  {info.backend === "webgpu"
                    ? "WebGPU"
                    : info.backend === "webgl2"
                      ? "WebGL2"
                      : "Unknown"}
                </span>
              </div>
              {info.stats && (
                <>
                  <div className={styles.statDivider} />
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>FPS</span>
                    <span
                      className={styles.statValue}
                      data-fps-status={
                        info.stats.fps >= 55
                          ? "good"
                          : info.stats.fps >= 30
                            ? "ok"
                            : "low"
                      }
                    >
                      {info.stats.fps}
                      <span className={styles.statUnit}>fps</span>
                    </span>
                  </div>
                  <div className={styles.statRow}>
                    <span className={styles.statLabel}>Frame Time</span>
                    <span
                      className={styles.statValue}
                      data-frametime-status={
                        info.stats.frameTimeMs <= 18
                          ? "good"
                          : info.stats.frameTimeMs <= 33
                            ? "ok"
                            : "slow"
                      }
                    >
                      {info.stats.frameTimeMs.toFixed(1)}
                      <span className={styles.statUnit}>ms</span>
                    </span>
                  </div>
                  {hitRate !== null && (
                    <div className={styles.statRow}>
                      <span className={styles.statLabel}>Buffer Pool</span>
                      <span
                        className={styles.statValue}
                        data-pool-status={
                          hitRate >= 90 ? "good" : hitRate >= 50 ? "ok" : "low"
                        }
                      >
                        {hitRate}
                        <span className={styles.statUnit}>% hit</span>
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className={styles.dprControl}>
              <div className={styles.dprLabelRow}>
                <span className={styles.dprLabel}>Pixel Density</span>
                <div
                  className={styles.infoButtonWrapper}
                  onMouseEnter={() => setShowDprInfo(true)}
                  onMouseLeave={() => setShowDprInfo(false)}
                >
                  <button
                    type="button"
                    className={`${styles.infoButton} ${showDprInfo ? styles.infoButtonActive : ""}`}
                    aria-label="What is pixel density?"
                  >
                    <QuestionMarkCircledIcon className={styles.infoIcon} />
                  </button>
                  {showDprInfo && (
                    <div className={styles.infoPopover} role="tooltip">
                      <p>
                        <strong>Pixel density</strong> controls how many pixels
                        are rendered relative to your display.
                      </p>
                      <p>
                        Lower values improve performance for complex shaders.
                        Higher values increase visual quality on Retina
                        displays.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.dprButtonGroup}>
                {dprOptions.map((opt, index) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={styles.dprButton}
                    data-active={settings.dpr === opt.value}
                    data-first={index === 0}
                    data-last={index === dprOptions.length - 1}
                    onClick={() => setDpr(opt.value)}
                    title={opt.description}
                    aria-pressed={settings.dpr === opt.value}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.dprControl}>
              <div className={styles.dprLabelRow}>
                <span className={styles.dprLabel}>Preview FPS</span>
                <div
                  className={styles.infoButtonWrapper}
                  onMouseEnter={() => setShowPreviewFpsInfo(true)}
                  onMouseLeave={() => setShowPreviewFpsInfo(false)}
                >
                  <button
                    type="button"
                    className={`${styles.infoButton} ${showPreviewFpsInfo ? styles.infoButtonActive : ""}`}
                    aria-label="What is preview FPS?"
                  >
                    <QuestionMarkCircledIcon className={styles.infoIcon} />
                  </button>
                  {showPreviewFpsInfo && (
                    <div className={styles.infoPopover} role="tooltip">
                      <p>
                        <strong>Preview FPS</strong> controls how often the Live
                        Preview updates from the Renderer.
                      </p>
                      <p>
                        Lower values reduce CPU usage. Higher values provide
                        smoother preview updates.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.dprButtonGroup}>
                {previewFpsOptions.map((opt, index) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={styles.dprButton}
                    data-active={settings.previewStreamFps === opt.value}
                    data-first={index === 0}
                    data-last={index === previewFpsOptions.length - 1}
                    onClick={() => setPreviewStreamFps(opt.value)}
                    title={opt.description}
                    aria-pressed={settings.previewStreamFps === opt.value}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className={styles.waitingMessage}>Waiting for Renderer window…</p>
        )}
      </div>
    </Section>
  );
}

/**
 * Recording placeholder section
 */
function RecordingSection() {
  return (
    <Section
      title="Recording"
      badge={<span className={styles.comingSoonBadge}>Coming Soon</span>}
      defaultOpen={false}
    >
      <div className={styles.recordingContent}>
        <p className={styles.placeholderText}>
          Recording is not yet available. This feature will allow you to capture
          your visuals directly to video files.
        </p>
      </div>
    </Section>
  );
}

/**
 * VideoOutputPanel
 *
 * Main panel component with three collapsible sections.
 */
export function VideoOutputPanel() {
  return (
    <div className={styles.container}>
      <RendererSection />
      <RecordingSection />
    </div>
  );
}
