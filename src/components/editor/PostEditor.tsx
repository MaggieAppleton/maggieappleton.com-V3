import { useState, useEffect, useCallback, useRef } from "react";
import "./editor-styles.css";

interface PostEditorProps {
  initialContent: string;
  slug: string;
  collection: string;
  filePath: string;
  lastModified: number;
}

interface Segment {
  type: "prose" | "component";
  content: string;
  componentName?: string;
}

interface ParsedContent {
  prefix: string; // frontmatter + imports
  segments: Segment[];
}

// Parse content into prefix (frontmatter + imports) and segments
// Key: we preserve EXACT content including all whitespace
function parseContent(content: string): ParsedContent {
  const lines = content.split("\n");
  let prefixEndLine = 0;
  let inFrontmatter = false;
  let frontmatterEnded = false;

  // Find where content starts (after frontmatter and imports)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }

    if (inFrontmatter) {
      if (line.trim() === "---") {
        inFrontmatter = false;
        frontmatterEnded = true;
      }
      continue;
    }

    if (frontmatterEnded) {
      // Skip import lines and empty lines in import section
      if (line.trim().startsWith("import ") || line.trim() === "") {
        continue;
      } else {
        prefixEndLine = i;
        break;
      }
    }
  }

  // Build the prefix string (frontmatter + imports)
  let prefix = "";
  for (let i = 0; i < prefixEndLine; i++) {
    prefix += lines[i] + "\n";
  }

  // Now parse the rest into segments
  const segments: Segment[] = [];
  let i = prefixEndLine;

  while (i < lines.length) {
    const line = lines[i];

    // Check if this line starts a component
    const componentMatch = line.match(/^<([A-Z][a-zA-Z0-9]*)/);

    if (componentMatch) {
      const componentName = componentMatch[1];
      let componentContent = line;

      // Self-closing tag?
      if (line.match(new RegExp(`^<${componentName}[^>]*/>`))) {
        segments.push({
          type: "component",
          content: componentContent,
          componentName,
        });
        i++;
        continue;
      }

      // Opens and closes on same line?
      if (line.match(new RegExp(`</${componentName}>`))) {
        segments.push({
          type: "component",
          content: componentContent,
          componentName,
        });
        i++;
        continue;
      }

      // Multi-line component - need to find the closing tag or self-close
      let j = i + 1;
      let foundEnd = false;
      let inOpeningTag = true; // We're still inside the opening <Component ... > or />

      while (j < lines.length && !foundEnd) {
        componentContent += "\n" + lines[j];

        if (inOpeningTag) {
          // Still looking for the end of the opening tag
          // It could end with > (content follows) or /> (self-closing)
          if (lines[j].trim().endsWith("/>")) {
            // Self-closing tag complete
            foundEnd = true;
          } else if (lines[j].includes(">")) {
            // Opening tag closed, now look for closing tag
            inOpeningTag = false;
            // But also check if closing tag is on same line
            if (lines[j].includes(`</${componentName}>`)) {
              foundEnd = true;
            }
          }
        } else {
          // Looking for closing tag </ComponentName>
          // Simple approach: just find the closing tag (doesn't handle deep nesting of same component)
          if (lines[j].includes(`</${componentName}>`)) {
            foundEnd = true;
          }
        }

        j++;
      }

      segments.push({
        type: "component",
        content: componentContent,
        componentName,
      });
      i = j;
    } else {
      // This is a prose line - accumulate until we hit a component
      let proseContent = line;
      let j = i + 1;

      while (j < lines.length) {
        const nextLine = lines[j];
        // Check if next line starts a component
        if (nextLine.match(/^<([A-Z][a-zA-Z0-9]*)/)) {
          break;
        }
        proseContent += "\n" + nextLine;
        j++;
      }

      segments.push({
        type: "prose",
        content: proseContent,
      });
      i = j;
    }
  }

  return { prefix, segments };
}

// Reconstruct full content from prefix and segments
function reconstructContent(prefix: string, segments: Segment[]): string {
  return prefix + segments.map(s => s.content).join("\n") + "\n";
}

// Rendered component display
function RenderedComponent({
  componentCode,
  componentName,
  slug,
}: {
  componentCode: string;
  componentName: string;
  slug: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRendered() {
      try {
        const response = await fetch("/api/render-component", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ componentCode, slug }),
        });
        const result = await response.json();
        if (result.html) {
          setHtml(result.html);
        }
      } catch (error) {
        console.error("Failed to render component:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchRendered();
  }, [componentCode, slug]);

  if (loading) {
    return (
      <div className="component-loading">
        <span className="component-label">{componentName}</span>
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (html) {
    return (
      <div
        className="component-rendered"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className="component-placeholder">
      <span className="component-label">{componentName}</span>
      <pre className="component-preview">
        {componentCode.length > 200 ? componentCode.slice(0, 200) + "..." : componentCode}
      </pre>
    </div>
  );
}

// Prose editor - auto-resizing textarea
function ProseEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (newContent: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localContent, setLocalContent] = useState(content);

  // Resize on mount and when content changes externally
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  }, []);

  // Sync if content prop changes (e.g., from reload)
  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    onChange(newContent);

    // Resize after content change
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  };

  return (
    <textarea
      ref={textareaRef}
      className="prose-editor-textarea"
      value={localContent}
      onChange={handleChange}
      spellCheck={true}
    />
  );
}

export default function PostEditor({
  initialContent,
  slug,
  filePath,
  lastModified: initialLastModified,
}: PostEditorProps) {
  const [parsed, setParsed] = useState<ParsedContent>(() => parseContent(initialContent));
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("idle");
  const [conflictData, setConflictData] = useState<{
    serverContent: string;
    serverModified: number;
  } | null>(null);
  const lastModifiedRef = useRef(initialLastModified);

  // Update a specific segment
  const updateSegment = useCallback((index: number, newContent: string) => {
    setParsed(prev => {
      const newSegments = [...prev.segments];
      newSegments[index] = { ...newSegments[index], content: newContent };
      return { ...prev, segments: newSegments };
    });
  }, []);

  // Save function with conflict detection
  const save = useCallback(async () => {
    setSaveStatus("saving");
    const content = reconstructContent(parsed.prefix, parsed.segments);

    try {
      const response = await fetch("/api/save-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          content,
          expectedLastModified: lastModifiedRef.current,
        }),
      });

      const result = await response.json();

      if (result.conflict) {
        setSaveStatus("conflict");
        setConflictData({
          serverContent: result.serverContent,
          serverModified: result.serverModified,
        });
      } else if (result.success) {
        lastModifiedRef.current = result.newLastModified;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Save failed:", error);
      setSaveStatus("error");
    }
  }, [filePath, parsed]);

  // Force save
  const forceSave = useCallback(async () => {
    if (!conflictData) return;
    setSaveStatus("saving");
    const content = reconstructContent(parsed.prefix, parsed.segments);

    try {
      const response = await fetch("/api/save-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath,
          content,
          force: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        lastModifiedRef.current = result.newLastModified;
        setConflictData(null);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Force save failed:", error);
      setSaveStatus("error");
    }
  }, [filePath, parsed, conflictData]);

  // Load server version
  const loadServerVersion = useCallback(() => {
    if (!conflictData) return;
    window.location.reload();
  }, [conflictData]);

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  return (
    <div className="editor-container">
      {/* Conflict modal */}
      {conflictData && (
        <div className="conflict-modal-overlay">
          <div className="conflict-modal">
            <h2>File Changed Externally</h2>
            <p>
              The file was modified outside the editor (probably in VS Code).
              What would you like to do?
            </p>
            <div className="conflict-actions">
              <button onClick={loadServerVersion} className="btn btn-secondary">
                Load file version (discard my changes)
              </button>
              <button onClick={forceSave} className="btn btn-primary">
                Keep my changes (overwrite file)
              </button>
              <button
                onClick={() => {
                  setConflictData(null);
                  setSaveStatus("idle");
                }}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="editor-toolbar">
        <button onClick={save} className="btn btn-primary" disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? "Saving..." : "Save"}
        </button>
        <span className="toolbar-hint">⌘S to save</span>
        <span className="save-status" style={{
          marginLeft: 'auto',
          color: saveStatus === "error" || saveStatus === "conflict"
            ? "var(--color-bright-crimson)"
            : saveStatus === "saved"
              ? "var(--color-sea-blue)"
              : "var(--color-gray-500)"
        }}>
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved!"}
          {saveStatus === "error" && "Error saving"}
          {saveStatus === "conflict" && "Conflict detected!"}
        </span>
      </div>

      {/* Editor content */}
      <div className="editor-content">
        <article className="prose-wrapper">
          {parsed.segments.map((segment, index) => {
            if (segment.type === "component") {
              return (
                <RenderedComponent
                  key={index}
                  componentCode={segment.content}
                  componentName={segment.componentName || "Component"}
                  slug={slug}
                />
              );
            }

            // Skip empty prose segments (only whitespace)
            if (!segment.content.trim()) {
              return null;
            }

            return (
              <ProseEditor
                key={index}
                content={segment.content}
                onChange={(newContent) => updateSegment(index, newContent)}
              />
            );
          })}
        </article>
      </div>
    </div>
  );
}
