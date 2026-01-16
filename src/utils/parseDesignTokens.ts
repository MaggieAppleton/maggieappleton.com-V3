import fs from "fs";
import path from "path";

export interface DesignToken {
  name: string;
  value: string;
  category: "color" | "spacing" | "font-size" | "font-family" | "leading" | "shadow" | "radius";
  subcategory?: string;
}

/**
 * Parse CSS custom properties from global.css
 */
export function parseDesignTokens(): DesignToken[] {
  const cssPath = path.join(process.cwd(), "src/global.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  const tokens: DesignToken[] = [];

  // Match CSS custom properties: --name: value;
  const propertyRegex = /--([a-z0-9-]+):\s*([^;]+);/g;
  let match;

  while ((match = propertyRegex.exec(cssContent)) !== null) {
    const name = `--${match[1]}`;
    const value = match[2].trim();

    // Skip internal/calculation variables (fc-* prefix)
    if (name.startsWith("--fc-") || name.startsWith("--f-") || name.startsWith("--fluid-")) {
      continue;
    }

    const token = categorizeToken(name, value);
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

function categorizeToken(name: string, value: string): DesignToken | null {
  // Colors
  if (name.startsWith("--color-")) {
    let subcategory = "other";

    if (name.includes("gray")) {
      subcategory = "gray";
    } else if (name.includes("cream") || name === "--color-black") {
      subcategory = "base";
    } else if (name.includes("crimson") || name.includes("sea-blue") || name.includes("salmon") || name.includes("purple") || name.includes("gold")) {
      subcategory = "brand";
    }

    return { name, value, category: "color", subcategory };
  }

  // Spacing - t-shirt sizes
  if (name.match(/^--space-(3xs|2xs|xs|s|m|l|xl|2xl|3xl|4xl)(-|$)/)) {
    const hasPair = name.includes("-2xs") || name.includes("-xs") || 
                    name.includes("-s") || name.includes("-m") || 
                    name.includes("-l") || name.includes("-xl");
    // Check if it's a one-up pair like --space-xs-s
    if (name.match(/^--space-(3xs|2xs|xs|s|m|l|xl|2xl|3xl)-(2xs|xs|s|m|l|xl|2xl|3xl|4xl)$/)) {
      return { name, value, category: "spacing", subcategory: "fluid-pair" };
    }
    return { name, value, category: "spacing", subcategory: "t-shirt" };
  }

  // Spacing - numeric
  if (name.match(/^--space-\d+$/)) {
    return { name, value, category: "spacing", subcategory: "numeric" };
  }

  // Font sizes
  if (name.startsWith("--font-size-")) {
    return { name, value, category: "font-size" };
  }

  // Font families
  if (name.startsWith("--font-") && !name.startsWith("--font-size-")) {
    return { name, value, category: "font-family" };
  }

  // Line heights
  if (name.startsWith("--leading-")) {
    return { name, value, category: "leading" };
  }

  // Box shadows
  if (name.startsWith("--box-shadow-")) {
    return { name, value, category: "shadow" };
  }

  // Border radius
  if (name.startsWith("--border-radius-")) {
    return { name, value, category: "radius" };
  }

  return null;
}

/**
 * Get tokens grouped by category
 */
export function getTokensByCategory(tokens: DesignToken[]) {
  return {
    colors: tokens.filter((t) => t.category === "color"),
    spacing: tokens.filter((t) => t.category === "spacing"),
    fontSizes: tokens.filter((t) => t.category === "font-size"),
    fontFamilies: tokens.filter((t) => t.category === "font-family"),
    leading: tokens.filter((t) => t.category === "leading"),
    shadows: tokens.filter((t) => t.category === "shadow"),
    radii: tokens.filter((t) => t.category === "radius"),
  };
}
