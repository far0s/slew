import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import styles from "./DeviceCard.module.css";

export type DeviceStatusTone = "success" | "warning" | "danger" | "muted";

interface DeviceCardProps {
  tag?: string;
  name: string;
  meta?: string;
  status?: string;
  statusTone?: DeviceStatusTone;
  badge?: ReactNode;
  actions?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  helpAnchor?: string;
  helpSection?: string;
  children: ReactNode;
}

export function DeviceCard({
  tag,
  name,
  meta,
  status,
  statusTone,
  badge,
  actions,
  expanded,
  onToggle,
  helpAnchor,
  helpSection,
  children,
}: DeviceCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`${styles.card} ${expanded ? styles.expanded : ""}`}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.trigger}
          onClick={onToggle}
          aria-expanded={expanded}
          data-help-anchor={helpAnchor}
          data-help-section={helpSection}
        >
          {tag && <span className={styles.tag}>{tag}</span>}
          <span className={styles.info}>
            <span className={styles.name}>{name}</span>
            {meta && <span className={styles.meta}>{meta}</span>}
          </span>
          {badge}
          {status && statusTone && (
            <span className={`${styles.status} ${styles[statusTone]}`}>
              {status}
            </span>
          )}
          {expanded ? (
            <ChevronDownIcon className={styles.chevron} aria-hidden="true" />
          ) : (
            <ChevronRightIcon className={styles.chevron} aria-hidden="true" />
          )}
        </button>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15, ease: "easeOut" }}
            className={styles.motionBody}
          >
            <div className={styles.body}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
