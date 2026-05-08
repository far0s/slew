/**
 * OscPanel
 *
 * Control panel for OSC server management, connection status,
 * and mappings overview. Displays in the Debug column or as a tab.
 */

import { useState, useMemo, useEffect } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  useOscServer,
  useOscMappings,
  useOscActivity,
  useOscRecentMessages,
  useOscBeat,
  useOscOutput,
  DEFAULT_OSC_PORT,
  setupDefaultMappings,
  type OscMapping,
} from "../../inputs/osc";
import { useEventListener } from "../../inputs/shared";
import {
  getAllSlotParameterIds,
  getParameterDescriptor,
  getParameterDropdownLabel,
  type ParameterId,
} from "../../slots/slotTypes";
import type { Slot } from "../../slots/useSlots";
import styles from "./OscPanel.module.css";

/**
 * Beat indicator for OSC beat input — pulses on each /slew/beat message.
 */
function OscBeatIndicator() {
  const { beat, bpm } = useOscBeat();

  return (
    <div className={styles.oscBeatIndicator}>
      <div className={styles.beatVisual}>
        <span
          className={`${styles.beatDot} ${beat ? styles.beatActive : ""}`}
          aria-label={beat ? "Beat received" : "No beat"}
        />
        <span
          className={`${styles.beatRing} ${beat ? styles.beatRingActive : ""}`}
        />
      </div>
      <span className={styles.bpmDisplay}>
        {bpm !== null ? (
          <>
            <span className={styles.bpmValue}>{bpm}</span>
            <span className={styles.bpmUnit}>BPM</span>
          </>
        ) : (
          <span className={styles.bpmWaiting}>Waiting…</span>
        )}
      </span>
    </div>
  );
}

/**
 * Beat Input section: reserved address reference + live beat indicator.
 */
function BeatInputSection({ port }: { port: number | null }) {
  const displayPort = port ?? DEFAULT_OSC_PORT;

  return (
    <div className={styles.beatInputSection}>
      <p className={styles.beatInputHint}>
        Send from Ableton (Max4Live), TouchOSC, or any OSC app to{" "}
        <code className={styles.inlineCode}>127.0.0.1:{displayPort}</code>.
      </p>

      <div className={styles.reservedAddresses}>
        <div className={styles.reservedAddress}>
          <code className={styles.addressCode}>/slew/beat</code>
          <span className={styles.addressDesc}>Trigger a beat pulse</span>
        </div>
        <div className={styles.reservedAddress}>
          <code className={styles.addressCode}>/slew/bpm &lt;float&gt;</code>
          <span className={styles.addressDesc}>Set BPM (20–300)</span>
        </div>
      </div>

      <OscBeatIndicator />
    </div>
  );
}

/**
 * Activity dot for OSC output — pulses when a message is sent.
 * Uses the osc_output_sent event emitted by the backend.
 */
function OscOutputActivityDot() {
  const [active, setActive] = useState(false);

  useEventListener("osc_output_sent", () => {
    setActive(true);
    setTimeout(() => setActive(false), 120);
  });

  return (
    <span
      className={`${styles.outputDot} ${active ? styles.outputDotActive : ""}`}
      aria-label={active ? "Message sent" : "Idle"}
    />
  );
}

/**
 * Output section: enable/disable OSC forwarding, configure target.
 */
function OutputSection() {
  const { config, isLoading, update } = useOscOutput();
  const [hostInput, setHostInput] = useState(config.host);
  const [portInput, setPortInput] = useState(String(config.port));

  // Sync local inputs when config loads
  useEffect(() => {
    setHostInput(config.host);
    setPortInput(String(config.port));
  }, [config.host, config.port]);

  const handleHostBlur = () => {
    const trimmed = hostInput.trim();
    if (trimmed && trimmed !== config.host) {
      void update({ host: trimmed });
    }
  };

  const handlePortBlur = () => {
    const num = parseInt(portInput, 10);
    if (!isNaN(num) && num > 0 && num <= 65535 && num !== config.port) {
      void update({ port: num });
    } else {
      setPortInput(String(config.port)); // revert invalid
    }
  };

  if (isLoading) {
    return <p className={styles.emptyText}>Loading…</p>;
  }

  return (
    <div className={styles.outputSection}>
      <div className={styles.outputEnableRow}>
        <label className={styles.outputEnableLabel}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => void update({ enabled: e.target.checked })}
            className={styles.checkbox}
          />
          <span>Enable output</span>
        </label>
        <OscOutputActivityDot />
      </div>

      <div className={styles.outputFields}>
        <div className={styles.outputFieldRow}>
          <label className={styles.fieldLabel} htmlFor="osc-out-host">Host</label>
          <input
            id="osc-out-host"
            type="text"
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            onBlur={handleHostBlur}
            disabled={false}
            className={styles.outputInput}
            placeholder="127.0.0.1"
            spellCheck={false}
          />
        </div>
        <div className={styles.outputFieldRow}>
          <label className={styles.fieldLabel} htmlFor="osc-out-port">Port</label>
          <input
            id="osc-out-port"
            type="text"
            inputMode="numeric"
            value={portInput}
            onChange={(e) => setPortInput(e.target.value)}
            onBlur={handlePortBlur}
            disabled={false}
            className={`${styles.outputInput} ${styles.outputInputPort}`}
            placeholder="9001"
          />
        </div>
      </div>

      <div className={styles.outputCheckboxes}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.forward_beat}
            onChange={(e) => void update({ forward_beat: e.target.checked })}
            disabled={false}
            className={styles.checkbox}
          />
          <span>Forward beat</span>
          <code className={styles.inlineCode}>/slew/beat</code>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.forward_bpm}
            onChange={(e) => void update({ forward_bpm: e.target.checked })}
            disabled={false}
            className={styles.checkbox}
          />
          <span>Forward BPM</span>
          <code className={styles.inlineCode}>/slew/bpm</code>
        </label>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.forward_colors}
            onChange={(e) => void update({ forward_colors: e.target.checked })}
            disabled={false}
            className={styles.checkbox}
          />
          <span>Forward colors</span>
          <code className={styles.inlineCode}>/slew/slot/{`{n}`}/color/{`{id}`}</code>
        </label>
      </div>

      <p className={styles.outputHint}>
        Forward beat to other apps or devices on the network.
      </p>
    </div>
  );
}

/**
 * Activity indicator that pulses on OSC input.
 */
function OscActivityIndicator() {
  const { lastMessage, messageCount } = useOscActivity();

  const isActive = lastMessage !== null && messageCount > 0;

  return (
    <div className={styles.activityIndicator}>
      <span
        className={`${styles.activityDot} ${isActive ? styles.active : ""}`}
        aria-label={isActive ? "OSC activity detected" : "No OSC activity"}
      />
      <span className={styles.activityLabel}>
        {isActive ? `${messageCount} msgs` : "No activity"}
      </span>
    </div>
  );
}

/**
 * Server controls with start/stop and port configuration.
 */
function ServerControls() {
  const { isRunning, port, error, isLoading, start, stop } = useOscServer();
  const [inputPort, setInputPort] = useState(String(DEFAULT_OSC_PORT));

  const handleToggle = async () => {
    try {
      if (isRunning) {
        await stop();
      } else {
        const portNum = parseInt(inputPort, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          return;
        }
        await start(portNum);
      }
    } catch {
      // UI state already reflects failure
    }
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric input
    const value = e.target.value.replace(/\D/g, "");
    setInputPort(value);
  };

  return (
    <div className={styles.serverControls}>
      <div className={styles.serverStatus}>
        <span
          className={`${styles.statusDot} ${isRunning ? styles.running : ""}`}
          aria-label={isRunning ? "Server running" : "Server stopped"}
        />
        <span className={styles.statusText}>
          {isRunning ? `Listening on port ${port}` : "Server stopped"}
        </span>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.serverForm}>
        <label className={styles.portLabel}>
          <span className={styles.portLabelText}>Port:</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={inputPort}
            onChange={handlePortChange}
            disabled={isRunning || isLoading}
            className={styles.portInput}
            aria-label="OSC port number"
          />
        </label>

        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={isLoading}
          className={`${styles.toggleButton} ${isRunning ? styles.stop : styles.start}`}
        >
          {isLoading ? "…" : isRunning ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}

/**
 * Form to add a new OSC mapping.
 */
function AddMappingForm({
  slots,
  onAdd,
}: {
  slots: Slot[];
  onAdd: (mapping: OscMapping) => Promise<void>;
}) {
  const [address, setAddress] = useState("");
  const [parameterId, setParameterId] = useState("");
  const [minOutput, setMinOutput] = useState(0);
  const [maxOutput, setMaxOutput] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  const allParameterIds = useMemo(
    () =>
      getAllSlotParameterIds(
        slots
          .filter((s) => s.sketchId !== null)
          .map((s) => ({ index: s.index, sketchId: s.sketchId as string })),
      ),
    [slots],
  );

  const selectedParamDescriptor = parameterId
    ? getParameterDescriptor(parameterId as ParameterId)
    : null;

  const handleParameterChange = (newParamId: string) => {
    setParameterId(newParamId);
    const desc = getParameterDescriptor(newParamId as ParameterId);
    if (desc) {
      setMinOutput(desc.min);
      setMaxOutput(desc.max);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address.trim() || !parameterId.trim()) return;

    setIsAdding(true);
    try {
      await onAdd({
        address: address.trim(),
        parameter_id: parameterId.trim(),
        min_input: 0,
        max_input: 1,
        min_output: minOutput,
        max_output: maxOutput,
      });
      setAddress("");
      setParameterId("");
      setMinOutput(0);
      setMaxOutput(1);
    } catch {
      // UI state already reflects failure
    } finally {
      setIsAdding(false);
    }
  };

  const hasSlots = allParameterIds.length > 0;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className={styles.addForm}>
      <div className={styles.addFormRow}>
        <input
          type="text"
          placeholder="/address/pattern"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={styles.addressInput}
          aria-label="OSC address pattern"
        />
        <span className={styles.arrow}>→</span>
        {hasSlots ? (
          <select
            value={parameterId}
            onChange={(e) => handleParameterChange(e.target.value)}
            className={styles.parameterInput}
            aria-label="Parameter"
          >
            <option value="">Select parameter…</option>
            {allParameterIds.map((id) => (
              <option key={id} value={id}>
                {getParameterDropdownLabel(id)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder="parameter_id"
            value={parameterId}
            onChange={(e) => setParameterId(e.target.value)}
            className={styles.parameterInput}
            aria-label="Parameter ID"
          />
        )}
        <button
          type="submit"
          disabled={isAdding || !address.trim() || !parameterId.trim()}
          className={styles.addButton}
        >
          {isAdding ? "…" : "+"}
        </button>
      </div>
      <div className={styles.addFormRow}>
        <label className={styles.rangeLabel}>
          <span className={styles.rangeLabelText}>Output Range:</span>
          <div className={styles.rangeInputs}>
            <input
              type="number"
              value={minOutput}
              onChange={(e) => setMinOutput(parseFloat(e.target.value) || 0)}
              step={selectedParamDescriptor?.step ?? 0.01}
              className={styles.rangeInput}
              aria-label="Minimum output"
            />
            <span className={styles.rangeSeparator}>–</span>
            <input
              type="number"
              value={maxOutput}
              onChange={(e) => setMaxOutput(parseFloat(e.target.value) || 1)}
              step={selectedParamDescriptor?.step ?? 0.01}
              className={styles.rangeInput}
              aria-label="Maximum output"
            />
          </div>
        </label>
      </div>
    </form>
  );
}

/**
 * Mappings list showing all current OSC→parameter bindings.
 */
function MappingsList({ slots }: { slots: Slot[] }) {
  const { mappings, isLoading, addMapping, removeMapping, clearAll } =
    useOscMappings();
  const [removing, setRemoving] = useState<string | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const handleRemove = async (address: string) => {
    setRemoving(address);
    try {
      await removeMapping(address);
    } catch {
      // UI state already reflects failure
    } finally {
      setRemoving(null);
    }
  };

  const handleSetupDefaults = async () => {
    setIsSettingUp(true);
    try {
      await setupDefaultMappings();
      // Force refresh by fetching mappings again
      window.location.reload();
    } catch {
      // UI state already reflects failure
    } finally {
      setIsSettingUp(false);
    }
  };

  if (isLoading) {
    return <p className={styles.loadingText}>Loading mappings…</p>;
  }

  return (
    <div className={styles.mappingsSection}>
      <AddMappingForm slots={slots} onAdd={addMapping} />

      {mappings.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            No OSC mappings. Add one above or use defaults.
          </p>
          <button
            type="button"
            onClick={() => void handleSetupDefaults()}
            disabled={isSettingUp}
            className={styles.setupDefaultsButton}
          >
            {isSettingUp ? "Setting up…" : "Setup Default Mappings"}
          </button>
        </div>
      ) : (
        <div className={styles.mappingsList}>
          {mappings.map((mapping) => (
            <div key={mapping.address} className={styles.mappingItem}>
              <div className={styles.mappingInfo}>
                <span className={styles.mappingAddress}>{mapping.address}</span>
                <span className={styles.mappingArrow}>→</span>
                <span className={styles.mappingParameter}>
                  {mapping.parameter_id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleRemove(mapping.address)}
                disabled={removing === mapping.address}
                className={styles.removeButton}
                aria-label={`Remove mapping for ${mapping.address}`}
              >
                {removing === mapping.address ? "…" : "×"}
              </button>
            </div>
          ))}
          <div className={styles.mappingsActions}>
            <button
              type="button"
              onClick={() => void handleSetupDefaults()}
              disabled={isSettingUp}
              className={styles.setupDefaultsButton}
            >
              {isSettingUp ? "…" : "Reset to Defaults"}
            </button>
            <button
              type="button"
              onClick={() => void clearAll()}
              className={styles.clearAllButton}
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Recent messages display for debugging.
 */
function RecentMessages() {
  const { messages, clear } = useOscRecentMessages();

  if (messages.length === 0) {
    return (
      <p className={styles.emptyText}>
        No messages yet. Send OSC to port 9000.
      </p>
    );
  }

  return (
    <div className={styles.recentMessages}>
      <div className={styles.messagesList}>
        {messages.map((msg, idx) => (
          <div
            key={`${msg.timestamp}-${idx}`}
            className={`${styles.messageItem} ${
              msg.address.startsWith("/slew/")
                ? styles.messageItemSlew
                : ""
            }`}
          >
            <span className={styles.messageAddress}>{msg.address}</span>
            <span className={styles.messageArgs}>
              {msg.args.length > 0 ? msg.args.join(", ") : "(no args)"}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={clear}
        className={styles.clearMessagesButton}
      >
        Clear
      </button>
    </div>
  );
}

export interface OscPanelProps {
  /** Optional class name for additional styling */
  className?: string;
  /** Active slots for parameter filtering */
  slots?: Slot[];
}

/**
 * OscPanel
 *
 * Complete OSC management panel with:
 * - Activity indicator
 * - Server controls (start/stop, port config)
 * - Mappings list with add/remove
 */
export function OscPanel({ className, slots = [] }: OscPanelProps) {
  const [serverOpen, setServerOpen] = useState(true);
  const [beatInputOpen, setBeatInputOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(true);
  const [messagesOpen, setMessagesOpen] = useState(true);
  const { isRunning, port } = useOscServer();

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>OSC</h3>
        <OscActivityIndicator />
      </div>

      <Collapsible.Root open={serverOpen} onOpenChange={setServerOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {serverOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Server</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          {isRunning && port && (
            <p className={styles.serverInfoLine}>
              Send OSC UDP to{" "}
              <code className={styles.inlineCode}>127.0.0.1:{port}</code>
            </p>
          )}
          <ServerControls />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={beatInputOpen} onOpenChange={setBeatInputOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {beatInputOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Beat Input</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <BeatInputSection port={isRunning ? port : null} />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={outputOpen} onOpenChange={setOutputOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {outputOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Output</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <OutputSection />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={messagesOpen} onOpenChange={setMessagesOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {messagesOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Recent Messages</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <RecentMessages />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={mappingsOpen} onOpenChange={setMappingsOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {mappingsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Mappings</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <p className={styles.mappingsNote}>
            Map any OSC address to a parameter. Reserved{" "}
            <code className={styles.inlineCode}>/slew/*</code> addresses are
            handled automatically.
          </p>
          <MappingsList slots={slots} />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default OscPanel;
