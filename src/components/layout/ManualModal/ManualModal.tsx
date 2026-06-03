import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked, type RendererObject } from "marked";
import styles from "./ManualModal.module.css";

// ============================================================================
// Doc registry
// ============================================================================

interface DocSection {
  id: string;
  label: string;
  file: string;
  developer?: boolean;
}

const DOC_SECTIONS: DocSection[] = [
  { id: "slots",         label: "Slots & Crossfader", file: "docs/SLOTS.md" },
  { id: "video-output",  label: "Video Output",       file: "docs/VIDEO_OUTPUT_TROUBLESHOOTING.md" },
  { id: "controllers",   label: "Controllers & MIDI", file: "docs/CONTROLLERS.md" },
  { id: "fx",            label: "Effects (FX)",        file: "docs/FX.md" },
  { id: "modulation",    label: "Modulation / LFOs",  file: "docs/MODULATION.md" },
  { id: "creating-sketches", label: "Creating Sketches (Dev)", file: "docs/CREATING_SKETCHES.md", developer: true },
  { id: "architecture",      label: "Architecture (Dev)",  file: "docs/ARCHITECTURE.md", developer: true },
];

// ============================================================================
// Markdown rendering helpers
// ============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Custom renderer: id= on headings, mermaid code blocks as data containers
const customRenderer: RendererObject = {
  heading({ text, depth }: { text: string; depth: number }) {
    const tag = `h${depth}`;
    if (depth === 2 || depth === 3) {
      const id = slugify(text);
      return `<${tag} id="${id}">${text}</${tag}>\n`;
    }
    return `<${tag}>${text}</${tag}>\n`;
  },
  code({ text, lang }: { text: string; lang?: string }) {
    if (lang === "mermaid") {
      // Encode the diagram source in a data attribute; rendered post-mount
      const encoded = encodeURIComponent(text);
      return `<div class="mermaid-pending" data-diagram="${encoded}"></div>\n`;
    }
    return false; // fall through to default code renderer
  },
};

marked.use({ renderer: customRenderer });

// Dynamically load mermaid and render all pending diagrams in a container
async function renderMermaidDiagrams(container: HTMLElement): Promise<void> {
  const pending = container.querySelectorAll<HTMLElement>(".mermaid-pending");
  if (pending.length === 0) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
  let id = 0;
  for (const el of pending) {
    const source = decodeURIComponent(el.dataset.diagram ?? "");
    if (!source) continue;
    try {
      const { svg } = await mermaid.render(`mermaid-${Date.now()}-${id++}`, source);
      el.innerHTML = svg;
      el.classList.replace("mermaid-pending", "mermaid-rendered");
    } catch {
      el.textContent = source;
      el.classList.replace("mermaid-pending", "mermaid-error");
    }
  }
}

interface Heading {
  text: string;
  depth: number;
  slug: string;
}

function extractHeadings(md: string): Heading[] {
  const headings: Heading[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{2,3})\s+(.+)/);
    if (m) {
      headings.push({ depth: m[1].length, text: m[2].trim(), slug: slugify(m[2].trim()) });
    }
  }
  return headings;
}

// ============================================================================
// Doc fetch hook — caches raw md + rendered html
// ============================================================================

interface DocData {
  md: string;
  html: string;
  headings: Heading[];
}

const docCache = new Map<string, DocData>();

function useDocData(file: string, isOpen: boolean) {
  const [data, setData] = useState<DocData | null>(() => docCache.get(file) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !file) return;
    if (docCache.has(file)) {
      setData(docCache.get(file)!);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`./${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((md) => {
        const html = marked.parse(md) as string;
        const headings = extractHeadings(md);
        const entry: DocData = { md, html, headings };
        docCache.set(file, entry);
        setData(entry);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, [file, isOpen]);

  return { data, loading, error };
}

// ============================================================================
// ManualModal
// ============================================================================

interface ManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAnchor?: string | null;
  initialSection?: string | null;
}

export function ManualModal({ isOpen, onClose, initialAnchor, initialSection }: ManualModalProps) {
  const [activeSection, setActiveSection] = useState(
    () => DOC_SECTIONS.find((s) => s.id === initialSection)?.id ?? DOC_SECTIONS[0].id
  );
  const [search, setSearch] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const section = DOC_SECTIONS.find((s) => s.id === activeSection) ?? DOC_SECTIONS[0];
  const { data, loading, error } = useDocData(section.file, isOpen);

  // Scroll to anchor after content renders
  const pendingAnchor = useRef<string | null>(null);
  useEffect(() => {
    if (initialAnchor) pendingAnchor.current = initialAnchor;
  }, [initialAnchor]);

  useEffect(() => {
    if (!data) return;
    // Render mermaid diagrams, then write SVGs back into data.html so
    // subsequent React re-renders (e.g. search input, section switch) don't
    // overwrite the SVGs with the original pending placeholders.
    if (contentRef.current) {
      const markdownEl = contentRef.current.querySelector<HTMLElement>("[class*='markdown']");
      void renderMermaidDiagrams(contentRef.current).then(() => {
        if (markdownEl && data) {
          data.html = markdownEl.innerHTML;
        }
      });
    }
    if (!pendingAnchor.current) return;
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    setTimeout(() => {
      const el = contentRef.current?.querySelector(`[id="${anchor}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, [data]);

  // Reset section + anchor when reopening with new targets
  useEffect(() => {
    if (!isOpen) return;
    if (initialSection) {
      const sec = DOC_SECTIONS.find((s) => s.id === initialSection);
      if (sec) setActiveSection(sec.id);
    }
    if (initialAnchor) pendingAnchor.current = initialAnchor;
  }, [isOpen, initialSection, initialAnchor]);

  // Focus search on open, clear on close
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleSectionChange = useCallback((id: string) => {
    setActiveSection(id);
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  const scrollToHeading = useCallback((slug: string) => {
    const el = contentRef.current?.querySelector(`[id="${slug}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Filter sections + headings by search query
  const query = search.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!query) return DOC_SECTIONS;
    return DOC_SECTIONS.filter((s) => {
      if (s.label.toLowerCase().includes(query)) return true;
      const cached = docCache.get(s.file);
      if (!cached) return false;
      return (
        cached.headings.some((h) => h.text.toLowerCase().includes(query)) ||
        cached.md.toLowerCase().includes(query)
      );
    });
  }, [query]);

  const filteredHeadings = useMemo(() => {
    if (!data) return [];
    if (!query) return data.headings;
    return data.headings.filter((h) => h.text.toLowerCase().includes(query));
  }, [data, query]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Slew Manual"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Manual</span>
          <input
            ref={searchRef}
            className={styles.search}
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search manual"
          />
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close manual"
          >
            ×
          </button>
        </div>

        {/* Body: nav + content */}
        <div className={styles.body}>
          {/* Nav */}
          <nav className={styles.nav} aria-label="Manual sections">
            {/* Top-level section buttons */}
            {filteredSections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={[
                  styles.navItem,
                  s.id === activeSection ? styles.navItemActive : "",
                  s.developer ? styles.navItemDev : "",
                ].join(" ")}
                onClick={() => handleSectionChange(s.id)}
              >
                {s.label}
              </button>
            ))}

            {filteredSections.length === 0 && (
              <span className={styles.noResults}>No results</span>
            )}

            {/* Heading sub-nav for active section */}
            {filteredHeadings.length > 0 && (
              <div className={styles.navDivider} />
            )}
            {filteredHeadings.map((h) => (
              <button
                key={h.slug}
                type="button"
                className={[
                  styles.navHeading,
                  h.depth === 3 ? styles.navHeadingDepth3 : "",
                ].join(" ")}
                onClick={() => scrollToHeading(h.slug)}
                title={h.text}
              >
                {h.text}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className={styles.content} ref={contentRef}>
            {loading && <div className={styles.loading}>Loading…</div>}
            {error && <div className={styles.errorMsg}>Failed to load: {error}</div>}
            {!loading && !error && data && (
              <div
                className={styles.markdown}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: data.html }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
