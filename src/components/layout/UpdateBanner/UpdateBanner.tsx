import { type UpdateState } from "@/hooks/useUpdater";
import styles from "./UpdateBanner.module.css";

interface UpdateBannerProps {
  state: UpdateState;
  onInstall: () => void;
  onClose: () => void;
}

export function UpdateBanner({ state, onInstall, onClose }: UpdateBannerProps) {
  if (state.type === "idle") return null;

  if (state.type === "error") {
    return (
      <div className={`${styles.banner} ${styles.error}`} role="alert">
        <span className={styles.message}>Update check failed: {state.message}</span>
        <button className={styles.dismiss} onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }

  if (state.type === "installing") {
    return (
      <div className={`${styles.banner} ${styles.installing}`} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <span className={styles.message}>Installing update… App will restart shortly.</span>
      </div>
    );
  }

  // state.type === "available"
  const { info } = state;
  return (
    <div className={`${styles.banner} ${styles.available}`} role="status">
      <div className={styles.content}>
        <span className={styles.badge}>Update available</span>
        <span className={styles.version}>v{info.version}</span>
        {info.body && (
          <span className={styles.notes} title={info.body}>
            {info.body.split("\n")[0]}
          </span>
        )}
      </div>
      <div className={styles.actions}>
        <button className={styles.install} onClick={onInstall}>
          Install &amp; Restart
        </button>
        <button className={styles.dismiss} onClick={onClose} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}

export default UpdateBanner;
