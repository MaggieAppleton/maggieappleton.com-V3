import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useState, useEffect, useCallback, useRef } from "react";
import "./editor-styles.css";

interface PostEditorProps {
  initialContent: string;
  slug: string;
  collection: string;
  filePath: string;
  lastModified: number;
}

interface ParsedContent {
  frontmatter: string;
  imports: string;
  segments: ContentSegment[];
}

interface ContentSegment {
  type: "prose" | "component";
  content: string;
  componentName?: string;
}

// Parse MDX content into frontmatter, imports, and content segments
function parseMdxContent(content: string): ParsedContent {
  const lines = content.split("\n");
  let frontmatter = "";
  let imports = "";
  const segments: ContentSegment[] = [];

  let inFrontmatter = false;
  let frontmatterEnded = false;
  let importsEnded = false;
  let currentProse = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle frontmatter
    if (i === 0 && line.trim() === "---") {
      inFrontmatter = true;
      frontmatter += line + "\n";
      continue;
    }

    if (inFrontmatter) {
      frontmatter += line + "\n";
      if (line.trim() === "---") {
        inFrontmatter = false;
        frontmatterEnded = true;
      }
      continue;
    }

    // Handle imports (lines starting with "import")
    if (frontmatterEnded && !importsEnded) {
      if (line.trim().startsWith("import ") || line.trim() === "") {
        imports += line + "\n";
        continue;
      } else {
        importsEnded = true;
      }
    }

    // Now we're in the content area - detect block-level MDX components
    // A block component starts at the beginning of a line with <ComponentName
    const componentMatch = line.match(/^<([A-Z][a-zA-Z0-9]*)/);

    if (componentMatch) {
      // Save any accumulated prose
      if (currentProse.trim()) {
        segments.push({ type: "prose", content: currentProse });
        currentProse = "";
      }

      const componentName = componentMatch[1];
      let componentContent = line;

      // Check if it's a self-closing tag on this line
      // Match pattern: <Component ... /> (self-closing)
      const selfClosingMatch = line.match(new RegExp(`^<${componentName}[^>]*/>`));
      if (selfClosingMatch) {
        segments.push({
          type: "component",
          content: componentContent,
          componentName,
        });
        continue;
      }

      // Check if it opens AND closes on the same line
      // Match pattern: <Component ...>...</Component>
      const sameLineCloseMatch = line.match(new RegExp(`</${componentName}>`));
      if (sameLineCloseMatch) {
        segments.push({
          type: "component",
          content: componentContent,
          componentName,
        });
        continue;
      }

      // Multi-line component - find closing tag
      // We need to track depth for nested same-name components
      let depth = 1;
      let j = i + 1;

      while (j < lines.length && depth > 0) {
        componentContent += "\n" + lines[j];

        // Count opening tags on this line (excluding self-closing)
        // Look for <ComponentName followed by space, >, or end of pattern
        const openMatches = lines[j].match(new RegExp(`<${componentName}(?:\\s|>)`, "g")) || [];
        const selfCloseMatches = lines[j].match(new RegExp(`<${componentName}[^>]*/>`,"g")) || [];
        const closeMatches = lines[j].match(new RegExp(`</${componentName}>`, "g")) || [];

        depth += openMatches.length - selfCloseMatches.length - closeMatches.length;
        j++;
      }

      segments.push({
        type: "component",
        content: componentContent,
        componentName,
      });
      i = j - 1; // Skip the lines we've consumed
    } else {
      currentProse += line + "\n";
    }
  }

  // Don't forget trailing prose
  if (currentProse.trim()) {
    segments.push({ type: "prose", content: currentProse });
  }

  return { frontmatter, imports, segments };
}

// Convert markdown to HTML for TipTap (basic conversion)
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Wiki links - preserve as-is for now
    .replace(/\[\[([^\]]+)\]\]/g, "[[$1]]")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")
    // Blockquotes
    .replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>")
    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Paragraphs - wrap remaining lines that aren't already wrapped
  const lines = html.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push("");
    } else if (
      trimmed.startsWith("<h") ||
      trimmed.startsWith("<ul") ||
      trimmed.startsWith("<ol") ||
      trimmed.startsWith("<li") ||
      trimmed.startsWith("<blockquote") ||
      trimmed.startsWith("<hr") ||
      trimmed.startsWith("<p")
    ) {
      result.push(line);
    } else {
      result.push(`<p>${line}</p>`);
    }
  }

  return result.join("\n");
}

// Convert TipTap HTML back to markdown
function htmlToMarkdown(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  function processNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const el = node as HTMLElement;
    const children = Array.from(el.childNodes).map(processNode).join("");

    switch (el.tagName.toLowerCase()) {
      case "h1":
        return `# ${children}\n\n`;
      case "h2":
        return `## ${children}\n\n`;
      case "h3":
        return `### ${children}\n\n`;
      case "h4":
        return `#### ${children}\n\n`;
      case "p":
        return `${children}\n\n`;
      case "strong":
        return `**${children}**`;
      case "em":
        return `*${children}*`;
      case "a":
        return `[${children}](${el.getAttribute("href") || ""})`;
      case "code":
        return `\`${children}\``;
      case "blockquote":
        return children
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => `> ${l.replace(/^> /, "")}`)
          .join("\n") + "\n\n";
      case "ul":
        return children;
      case "ol":
        return children;
      case "li":
        return `- ${children.trim()}\n`;
      case "hr":
        return "---\n\n";
      case "br":
        return "\n";
      default:
        return children;
    }
  }

  return processNode(div).replace(/\n{3,}/g, "\n\n").trim();
}

// Sub-component for individual prose editors
function ProseEditor({
  initialContent,
  onUpdate,
}: {
  initialContent: string;
  onUpdate: (html: string) => void;
}) {
  const editor = useEditor({
    // Disable immediate render to avoid SSR hydration mismatches
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
    ],
    content: markdownToHtml(initialContent),
    editorProps: {
      attributes: {
        class: "prose-editor",
      },
    },
    onUpdate: ({ editor }) => {
      onUpdate(editor.getHTML());
    },
  });

  return <EditorContent editor={editor} />;
}

export default function PostEditor({
  initialContent,
  slug,
  collection,
  filePath,
  lastModified: initialLastModified,
}: PostEditorProps) {
  const [parsed] = useState<ParsedContent>(() =>
    parseMdxContent(initialContent)
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error" | "conflict"
  >("idle");
  const [conflictData, setConflictData] = useState<{
    serverContent: string;
    serverModified: number;
  } | null>(null);
  const lastModifiedRef = useRef(initialLastModified);
  const editorContentsRef = useRef<Map<number, string>>(new Map());

  // Initialize editor contents from parsed segments
  useEffect(() => {
    parsed.segments.forEach((segment, index) => {
      if (segment.type === "prose") {
        editorContentsRef.current.set(index, markdownToHtml(segment.content));
      }
    });
  }, [parsed]);

  // Reconstruct MDX content from editors
  const reconstructContent = useCallback(() => {
    let body = "";

    parsed.segments.forEach((segment, index) => {
      if (segment.type === "component") {
        body += segment.content + "\n\n";
      } else {
        const html = editorContentsRef.current.get(index) || "";
        const markdown = htmlToMarkdown(html);
        body += markdown + "\n\n";
      }
    });

    return parsed.frontmatter + parsed.imports + body.trim() + "\n";
  }, [parsed]);

  // Save function with conflict detection
  const save = useCallback(async () => {
    setSaveStatus("saving");

    const content = reconstructContent();

    try {
      const response = await fetch("/api/save-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
  }, [filePath, reconstructContent]);

  // Force save (overwrite server version)
  const forceSave = useCallback(async () => {
    if (!conflictData) return;

    setSaveStatus("saving");
    const content = reconstructContent();

    try {
      const response = await fetch("/api/save-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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
  }, [filePath, reconstructContent, conflictData]);

  // Load server version (discard local changes)
  const loadServerVersion = useCallback(() => {
    if (!conflictData) return;
    // Force re-render of editors by reloading
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

  // Update status display
  useEffect(() => {
    const statusEl = document.getElementById("save-status");
    if (statusEl) {
      const messages = {
        idle: "",
        saving: "Saving...",
        saved: "Saved!",
        error: "Error saving",
        conflict: "Conflict detected!",
      };
      statusEl.textContent = messages[saveStatus];
      statusEl.style.color =
        saveStatus === "error" || saveStatus === "conflict"
          ? "var(--color-bright-crimson)"
          : saveStatus === "saved"
            ? "var(--color-sea-blue)"
            : "";
    }
  }, [saveStatus]);

  return (
    <div className="editor-container">
      {/* Conflict resolution modal */}
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
      </div>

      {/* Editor content */}
      <div className="editor-content">
        <article className="prose-wrapper">
          {parsed.segments.map((segment, index) => {
            if (segment.type === "component") {
              return (
                <div key={index} className="component-placeholder">
                  <span className="component-label">{segment.componentName}</span>
                  <pre className="component-preview">
                    {segment.content.length > 200
                      ? segment.content.slice(0, 200) + "..."
                      : segment.content}
                  </pre>
                </div>
              );
            }

            return (
              <ProseEditor
                key={index}
                initialContent={segment.content}
                onUpdate={(html) => {
                  editorContentsRef.current.set(index, html);
                }}
              />
            );
          })}
        </article>
      </div>
    </div>
  );
}
