import { visit } from "unist-util-visit";

const LONG_QUOTE_THRESHOLD = 350;

function getTextLength(node) {
  if (node.type === "text") return node.value.length;
  if (!node.children) return 0;
  return node.children.reduce((total, child) => total + getTextLength(child), 0);
}

export function remarkLongBlockquote() {
  return (tree) => {
    visit(tree, "blockquote", (node) => {
      if (getTextLength(node) <= LONG_QUOTE_THRESHOLD) return;

      node.data ??= {};
      node.data.hProperties ??= {};
      const existingClassName = node.data.hProperties.className;
      const classes = Array.isArray(existingClassName)
        ? existingClassName
        : existingClassName
        ? [existingClassName]
        : [];
      node.data.hProperties.className = [...classes, "long-quote"];
    });
  };
}
