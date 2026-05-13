/**
 * ModulationMap
 *
 * Full-screen overlay showing a node-graph of all active LFO → parameter
 * connections. LFO nodes on the left, parameter nodes on the right, SVG
 * lines connecting them. Color-coded by LFO shape, line weight = depth.
 */

import { useEffect } from "react";
import {
  useLfos,
  useModulationTargets,
  useLfoValues,
  LFO_SHAPE_COLORS,
  LFO_SHAPE_LABELS,
} from "../../inputs/modulation";
import {
  getParameterDropdownLabel,
  type ParameterId,
} from "../../slots/slotTypes";
import type { Slot } from "../../slots/useSlots";
import styles from "./ModulationMap.module.css";

interface ModulationMapProps {
  isOpen: boolean;
  onClose: () => void;
  /** Used for parameter label resolution */
  slots?: Slot[];
  /** Called when user clicks an LFO node — host can focus it in the panel */
  onFocusLfo?: (lfoId: string) => void;
}

export function ModulationMap({
  isOpen,
  onClose,
  slots: _slots = [],
  onFocusLfo,
}: ModulationMapProps) {
  const { lfos } = useLfos();
  const { targets } = useModulationTargets();
  const { getValue } = useLfoValues();

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Only include LFOs that have at least one target
  const activeLfos = lfos.filter((lfo) =>
    targets.some((t) => t.source_id === lfo.id),
  );

  // Collect unique parameter IDs from all targets whose LFO is active
  const activeTargets = targets.filter((t) =>
    activeLfos.some((l) => l.id === t.source_id),
  );
  const uniqueParamIds = Array.from(
    new Set(activeTargets.map((t) => t.parameter_id)),
  );

  const hasConnections = activeLfos.length > 0;

  // Layout constants (all in SVG user units)
  const SVG_W = 600;
  const SVG_H = Math.max(
    300,
    Math.max(activeLfos.length, uniqueParamIds.length) * 52 + 40,
  );
  const LFO_X = 80;
  const PARAM_X = SVG_W - 80;
  const NODE_H = 44;

  const lfoY = (i: number) =>
    (SVG_H / (activeLfos.length + 1)) * (i + 1);
  const paramY = (i: number) =>
    (SVG_H / (uniqueParamIds.length + 1)) * (i + 1);

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Modulation map"
    >
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Modulation Map</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modulation map"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {!hasConnections ? (
            <p className={styles.empty}>
              No active LFO → parameter connections yet.
            </p>
          ) : (
            <svg
              className={styles.svg}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              {/* Connection lines */}
              {activeTargets.map((target) => {
                const lfoIdx = activeLfos.findIndex(
                  (l) => l.id === target.source_id,
                );
                const paramIdx = uniqueParamIds.indexOf(target.parameter_id);
                if (lfoIdx === -1 || paramIdx === -1) return null;

                const lfo = activeLfos[lfoIdx];
                const color = LFO_SHAPE_COLORS[lfo.shape];
                const depth = Math.abs(target.depth);
                const strokeW = 0.5 + depth * 3.5; // 0.5 – 4px
                const opacity = target.enabled ? 0.55 + depth * 0.35 : 0.15;

                const x1 = LFO_X + 56; // right edge of LFO node
                const y1 = lfoY(lfoIdx);
                const x2 = PARAM_X - 56; // left edge of param node
                const y2 = paramY(paramIdx);
                const cx = (x1 + x2) / 2;

                return (
                  <path
                    key={target.id}
                    d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeOpacity={opacity}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* LFO nodes */}
              {activeLfos.map((lfo, i) => {
                const cy = lfoY(i);
                const color = LFO_SHAPE_COLORS[lfo.shape];
                const value = getValue(lfo.id) ?? 0;
                // Mini waveform indicator bar
                const barH = Math.abs(value) * 8;
                const isDisabled = !lfo.enabled;

                return (
                  <g
                    key={lfo.id}
                    className={styles.lfoNode}
                    style={{ cursor: onFocusLfo ? "pointer" : "default" }}
                    onClick={() => {
                      onFocusLfo?.(lfo.id);
                      onClose();
                    }}
                    aria-label={`LFO: ${lfo.name}`}
                    role={onFocusLfo ? "button" : undefined}
                  >
                    {/* Node background */}
                    <rect
                      x={LFO_X - 56}
                      y={cy - NODE_H / 2}
                      width={112}
                      height={NODE_H}
                      rx={6}
                      fill={color}
                      fillOpacity={isDisabled ? 0.08 : 0.12}
                      stroke={color}
                      strokeOpacity={isDisabled ? 0.2 : 0.45}
                      strokeWidth={1}
                    />
                    {/* Color dot */}
                    <circle cx={LFO_X - 38} cy={cy} r={5} fill={color} fillOpacity={isDisabled ? 0.3 : 0.9} />
                    {/* Label */}
                    <text
                      x={LFO_X - 28}
                      y={cy - 4}
                      fontSize={9}
                      fontWeight={600}
                      fill="var(--text-primary)"
                      fillOpacity={isDisabled ? 0.35 : 0.9}
                      dominantBaseline="middle"
                    >
                      {lfo.name.length > 14 ? lfo.name.slice(0, 13) + "…" : lfo.name}
                    </text>
                    <text
                      x={LFO_X - 28}
                      y={cy + 8}
                      fontSize={7.5}
                      fill={color}
                      fillOpacity={isDisabled ? 0.3 : 0.7}
                      dominantBaseline="middle"
                    >
                      {LFO_SHAPE_LABELS[lfo.shape]}
                      {isDisabled ? " · off" : ""}
                    </text>
                    {/* Live value bar */}
                    <rect
                      x={LFO_X + 36}
                      y={cy - 8}
                      width={6}
                      height={16}
                      rx={2}
                      fill="var(--bg-active)"
                    />
                    <rect
                      x={LFO_X + 36}
                      y={cy + 8 - barH}
                      width={6}
                      height={barH}
                      rx={1}
                      fill={color}
                      fillOpacity={isDisabled ? 0.2 : 0.8}
                    />
                  </g>
                );
              })}

              {/* Parameter nodes */}
              {uniqueParamIds.map((paramId, i) => {
                const cy = paramY(i);
                // Find the first connected LFO to inherit a tint color
                const firstTarget = activeTargets.find(
                  (t) => t.parameter_id === paramId,
                );
                const tintLfo = firstTarget
                  ? activeLfos.find((l) => l.id === firstTarget.source_id)
                  : null;
                const color = tintLfo
                  ? LFO_SHAPE_COLORS[tintLfo.shape]
                  : "var(--text-muted)";
                const label = getParameterDropdownLabel(
                  paramId as ParameterId,
                );

                return (
                  <g key={paramId}>
                    {/* Node background */}
                    <rect
                      x={PARAM_X - 56}
                      y={cy - NODE_H / 2}
                      width={112}
                      height={NODE_H}
                      rx={6}
                      fill="var(--bg-elevated)"
                      stroke="var(--border-default)"
                      strokeWidth={1}
                    />
                    {/* Label */}
                    <text
                      x={PARAM_X - 42}
                      y={cy}
                      fontSize={9}
                      fill="var(--text-secondary)"
                      dominantBaseline="middle"
                    >
                      {label.length > 16 ? label.slice(0, 15) + "…" : label}
                    </text>
                    {/* Connection count badge */}
                    {(() => {
                      const count = activeTargets.filter(
                        (t) => t.parameter_id === paramId,
                      ).length;
                      return count > 1 ? (
                        <>
                          <circle cx={PARAM_X + 42} cy={cy} r={8} fill={color} fillOpacity={0.25} />
                          <text
                            x={PARAM_X + 42}
                            y={cy}
                            fontSize={7}
                            fontWeight={700}
                            fill={color}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {count}
                          </text>
                        </>
                      ) : null;
                    })()}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Footer legend */}
        {hasConnections && (
          <div className={styles.legend}>
            <span className={styles.legendHint}>
              Line weight = depth · Faded = disabled
              {onFocusLfo ? " · Click LFO node to focus" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
