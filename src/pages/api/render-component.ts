import type { APIRoute } from "astro";

// This endpoint should render on-demand, not be prerendered
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // Only allow in dev mode
  if (import.meta.env.PROD) {
    return new Response(
      JSON.stringify({ error: "API only available in development mode" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await request.json();
    const { componentCode, slug } = body;

    if (!componentCode) {
      return new Response(
        JSON.stringify({ error: "Missing componentCode" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // For now, we'll return placeholder HTML for known components
    // In the future, this could use Astro's experimental rendering APIs
    const html = renderComponentPlaceholder(componentCode, slug);

    return new Response(
      JSON.stringify({ html }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Render error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to render component",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Parse component and render appropriate HTML
function renderComponentPlaceholder(code: string, slug?: string): string {
  // Extract component name
  const nameMatch = code.match(/^<([A-Z][a-zA-Z0-9]*)/);
  if (!nameMatch) return `<div class="component-unknown">${escapeHtml(code)}</div>`;

  const componentName = nameMatch[1];

  switch (componentName) {
    case "Spacer":
      return renderSpacer(code);
    case "BasicImage":
      return renderBasicImage(code, slug);
    case "RemoteImage":
      return renderRemoteImage(code);
    case "IntroParagraph":
      return renderIntroParagraph(code);
    case "AssumedAudience":
      return renderAssumedAudience(code);
    case "QuoteCard":
      return renderQuoteCard(code);
    case "LinkCard":
      return renderLinkCard(code);
    case "Footnote":
      return renderFootnote(code);
    case "SimpleCard":
      return renderSimpleCard(code);
    case "GridColumns":
      return renderGridColumns(code);
    case "ResourceBook":
      return renderResourceBook(code);
    case "AcademicReference":
      return renderAcademicReference(code);
    case "Video":
      return renderVideo(code);
    case "TweetEmbed":
      return renderTweetEmbed(code);
    case "Alert":
      return renderAlert(code);
    case "Disclaimer":
      return renderDisclaimer(code);
    case "Draft":
      return renderDraft(code);
    case "BlockquoteCitation":
      return renderBlockquoteCitation(code);
    case "References":
      return renderReferences(code);
    case "ReferencesLink":
      return renderReferencesLink(code);
    case "Highlight":
      return renderHighlight(code);
    case "SmallCaps":
      return renderSmallCaps(code);
    case "Center":
      return renderCenter(code);
    case "ComingSoon":
      return renderComingSoon(code);
    case "Subtext":
      return renderSubtext(code);
    case "Title1":
    case "Title2":
    case "Title3":
    case "Title4":
      return renderTitle(code, componentName);
    case "Podcastiframe":
      return renderPodcastiframe(code);
    case "FullWidthSection":
    case "FullWidthBackground":
      return renderFullWidth(code, componentName);
    case "TalkSlide":
      return renderTalkSlide(code);
    case "ImageLink":
      return renderImageLink(code, slug);
    case "ButtonLink":
      return renderButtonLink(code);
    case "Accordion":
      return renderAccordion(code);
    default:
      return `<div class="component-placeholder-rendered">
        <span class="component-label">${componentName}</span>
      </div>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractProp(code: string, propName: string): string | null {
  // Match prop="value" or prop='value' or prop={value}
  const patterns = [
    new RegExp(`${propName}="([^"]*)"`, "i"),
    new RegExp(`${propName}='([^']*)'`, "i"),
    new RegExp(`${propName}=\\{["']([^"']*)["']\\}`, "i"),
    new RegExp(`${propName}=\\{([^}]*)\\}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function extractContent(code: string, componentName: string): string {
  // Extract content between opening and closing tags
  const pattern = new RegExp(`<${componentName}[^>]*>([\\s\\S]*)</${componentName}>`, "i");
  const match = code.match(pattern);
  return match ? match[1].trim() : "";
}

function hasProp(code: string, propName: string): boolean {
  return new RegExp(`\\b${propName}\\b`).test(code);
}

// Component renderers
function renderSpacer(code: string): string {
  const size = extractProp(code, "size") || "m";
  const sizeMap: Record<string, string> = {
    "3xs": "var(--space-3xs)",
    "2xs": "var(--space-2xs)",
    xs: "var(--space-xs)",
    small: "var(--space-s)",
    s: "var(--space-s)",
    m: "var(--space-m)",
    l: "var(--space-l)",
    xl: "var(--space-xl)",
    "2xl": "var(--space-2xl)",
  };
  const height = sizeMap[size] || "var(--space-m)";
  return `<div class="spacer-rendered" style="height: ${height};"></div>`;
}

// Convert /images/ paths to Vite's /@fs/ dev server paths
function resolveImagePath(src: string): string {
  if (src.startsWith("/images/")) {
    // In dev mode, images in src/images/ need to be served via /@fs/
    // The absolute path to the project root
    const projectRoot = process.cwd();
    return `/@fs${projectRoot}/src${src}`;
  }
  if (src.startsWith("../../images/")) {
    const projectRoot = process.cwd();
    return `/@fs${projectRoot}/src/images/${src.replace("../../images/", "")}`;
  }
  // Remote URLs or already absolute paths
  return src;
}

function renderBasicImage(code: string, slug?: string): string {
  const src = extractProp(code, "src") || "";
  const alt = extractProp(code, "alt") || "";
  const width = extractProp(code, "width") || "100%";
  const framed = hasProp(code, "framed");
  const showalt = hasProp(code, "showalt");

  const imageSrc = resolveImagePath(src);

  const frameClass = framed ? "image-framed" : "";
  const caption = showalt && alt ? `<figcaption class="image-caption">${escapeHtml(alt)}</figcaption>` : "";

  return `<figure class="basic-image-rendered ${frameClass}" style="max-width: ${width}; margin: 0 auto;">
    <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(alt)}" style="width: 100%; height: auto;" loading="lazy" />
    ${caption}
  </figure>`;
}

function renderRemoteImage(code: string): string {
  const src = extractProp(code, "src") || "";
  const alt = extractProp(code, "alt") || "";
  const width = extractProp(code, "width") || "100%";
  const framed = hasProp(code, "framed");
  const showalt = hasProp(code, "showalt");
  const margin = extractProp(code, "margin") || "0 auto";

  // RemoteImage might still have local paths, resolve them
  const imageSrc = resolveImagePath(src);

  const frameClass = framed ? "image-framed" : "";
  const caption = showalt && alt ? `<figcaption class="image-caption">${escapeHtml(alt)}</figcaption>` : "";

  return `<figure class="remote-image-rendered ${frameClass}" style="max-width: ${width}; margin: ${margin};">
    <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(alt)}" style="width: 100%; height: auto;" loading="lazy" />
    ${caption}
  </figure>`;
}

function renderIntroParagraph(code: string): string {
  const content = extractContent(code, "IntroParagraph");
  // Convert basic markdown in the content
  const htmlContent = content
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return `<p class="intro-paragraph-rendered">${htmlContent}</p>`;
}

function renderAssumedAudience(code: string): string {
  const content = extractContent(code, "AssumedAudience");
  return `<aside class="assumed-audience-rendered">
    <span class="assumed-audience-label">Assumed Audience</span>
    <p>${escapeHtml(content)}</p>
  </aside>`;
}

function renderQuoteCard(code: string): string {
  const author = extractProp(code, "author") || "";
  const year = extractProp(code, "year") || "";
  const sourceTitle = extractProp(code, "sourceTitle") || "";
  const content = extractContent(code, "QuoteCard");

  // Remove SmallCaps wrapper if present and just use the text
  const cleanContent = content
    .replace(/<SmallCaps>([^<]*)<\/SmallCaps>/gi, '<span class="small-caps">$1</span>')
    .replace(/<p[^>]*>/gi, "<p>")
    .replace(/<\/p>/gi, "</p>");

  const attribution = [author, sourceTitle, year].filter(Boolean).join(" · ");

  return `<blockquote class="quote-card-rendered">
    <div class="quote-content">${cleanContent}</div>
    ${attribution ? `<cite class="quote-attribution">${escapeHtml(attribution)}</cite>` : ""}
  </blockquote>`;
}

function renderLinkCard(code: string): string {
  const url = extractProp(code, "url") || "";
  const title = extractProp(code, "title") || "";
  const author = extractProp(code, "author") || "";
  const image = extractProp(code, "image") || "";
  const width = extractProp(code, "width") || "100%";

  return `<a href="${escapeHtml(url)}" class="link-card-rendered" style="max-width: ${width}; display: block; margin: var(--space-m) auto;">
    ${image ? `<img src="${escapeHtml(image)}" alt="" class="link-card-image" />` : ""}
    <div class="link-card-content">
      <span class="link-card-title">${escapeHtml(title)}</span>
      ${author ? `<span class="link-card-author">${escapeHtml(author)}</span>` : ""}
    </div>
  </a>`;
}

function renderFootnote(code: string): string {
  const idName = extractProp(code, "idName") || "?";
  const content = extractContent(code, "Footnote");

  return `<span class="footnote-rendered">
    <sup class="footnote-number">${escapeHtml(String(idName))}</sup>
    <span class="footnote-content">${escapeHtml(content)}</span>
  </span>`;
}

function renderSimpleCard(code: string): string {
  const content = extractContent(code, "SimpleCard");
  const padding = extractProp(code, "padding") || "var(--space-m)";
  const margin = extractProp(code, "margin") || "var(--space-m) auto";

  return `<div class="simple-card-rendered" style="padding: ${padding}; margin: ${margin};">
    ${content}
  </div>`;
}

function renderGridColumns(code: string): string {
  const content = extractContent(code, "GridColumns");
  const gridTemplateColumns = extractProp(code, "gridTemplateColumns") || "1fr 1fr";

  return `<div class="grid-columns-rendered" style="display: grid; grid-template-columns: ${gridTemplateColumns}; gap: var(--space-m);">
    ${content}
  </div>`;
}

function renderResourceBook(code: string): string {
  const url = extractProp(code, "url") || "#";
  const title = extractProp(code, "title") || "";
  const author = extractProp(code, "author") || "";
  const image = extractProp(code, "image") || "";
  const small = hasProp(code, "small");
  const content = extractContent(code, "ResourceBook");

  const imageSrc = resolveImagePath(image);
  const imgSize = small ? { width: 158, height: 228 } : { width: 220, height: 319 };

  return `<div class="book-card-rendered ${small ? "small" : ""}" style="display: flex; flex-direction: row; gap: var(--space-l); margin: var(--space-xs) auto var(--space-l); justify-content: center;">
    <div style="flex-shrink: 0; box-shadow: var(--box-shadow-lg);">
      <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(title)}" width="${imgSize.width}" height="${imgSize.height}" style="border-radius: var(--border-radius-sm);" />
    </div>
    <div class="book-metadata" style="display: flex; flex-direction: column; width: 34ch;">
      <a href="${escapeHtml(url)}" style="text-decoration: none;">
        <h3 style="font-family: var(--font-body); font-size: var(--font-size-md); margin-bottom: var(--space-2xs); color: var(--color-gray-800); line-height: var(--leading-tight);">${escapeHtml(title)}</h3>
      </a>
      <span style="color: var(--color-gray-600); font-size: var(--font-size-base);">${escapeHtml(author)}</span>
      <svg width="40" height="3" style="margin: var(--space-s) 0;"><rect width="40" height="3" fill="var(--color-gray-300)"></rect></svg>
      <div style="font-size: var(--font-size-sm); line-height: var(--leading-loose); color: var(--color-gray-800);">${content}</div>
    </div>
  </div>`;
}

function renderAcademicReference(code: string): string {
  const href = extractProp(code, "href") || "#";
  const title = extractProp(code, "title") || "";
  const authors = extractProp(code, "authors") || "";
  const year = extractProp(code, "year") || "";
  const content = extractContent(code, "AcademicReference");

  return `<span class="academic-reference-rendered" style="display: inline-flex; align-items: center; gap: 6px; color: var(--color-bright-crimson);">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
    <a href="${escapeHtml(href)}" style="color: inherit;" title="${escapeHtml(title)} - ${escapeHtml(authors)} (${escapeHtml(year)})">${content || title}</a>
  </span>`;
}

function renderVideo(code: string): string {
  const src = extractProp(code, "src") || "";
  const title = extractProp(code, "title") || "";
  const width = extractProp(code, "width") || "1000";
  const height = extractProp(code, "height") || "570";

  // Check if it's a YouTube/Vimeo embed or local video
  const isEmbed = src.includes("youtube") || src.includes("vimeo") || src.includes("embed");

  if (isEmbed) {
    return `<div class="video-rendered" style="width: 100%; max-width: 950px; aspect-ratio: 16/9; margin: var(--space-xs) auto var(--space-m); border-radius: 8px; overflow: hidden; box-shadow: var(--box-shadow-lg);">
      <iframe src="${escapeHtml(src)}" width="100%" height="100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="${escapeHtml(title)}" style="border: none;"></iframe>
    </div>`;
  }

  const videoSrc = resolveImagePath(src);
  return `<div class="video-rendered" style="width: 100%; max-width: 950px; aspect-ratio: 16/9; margin: var(--space-xs) auto var(--space-m); border-radius: 8px; overflow: hidden; box-shadow: var(--box-shadow-lg);">
    <video src="${escapeHtml(videoSrc)}" width="${width}" height="${height}" controls muted loop title="${escapeHtml(title)}" style="width: 100%; height: 100%; object-fit: cover;"></video>
  </div>`;
}

function renderTweetEmbed(code: string): string {
  const tweetId = extractProp(code, "tweetId") || "";

  return `<div class="tweet-embed-rendered" style="margin: var(--space-m) auto; padding: var(--space-m); border: 1px solid var(--color-gray-200); border-radius: var(--border-radius-base); background: var(--color-cream); text-align: center;">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="color: #1DA1F2;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
    <p style="margin: var(--space-xs) 0 0; color: var(--color-gray-600); font-size: var(--font-size-sm);">Tweet embed: ${escapeHtml(tweetId)}</p>
  </div>`;
}

function renderAlert(code: string): string {
  const title = extractProp(code, "title") || "";
  const content = extractContent(code, "Alert");

  return `<div class="alert-rendered" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: var(--space-s) var(--space-xs); margin: 0 auto var(--space-l); border: 1px solid var(--color-gray-100); border-radius: var(--border-radius-lg); box-shadow: var(--box-shadow-lg); max-width: 780px;">
    <svg width="80" height="70" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin: var(--space-s) auto;">
      <path fill-rule="evenodd" clip-rule="evenodd" d="M36.87 2.28c1.386-2.4 4.85-2.4 6.236 0L79.22 64.75c1.386 2.4-.346 5.4-3.117 5.4H3.873c-2.771 0-4.503-3-3.117-5.4L36.87 2.28z" fill="var(--color-salmon)"/>
      <rect x="36" y="22" width="8" height="28" rx="2" fill="white"/>
      <circle cx="40" cy="58" r="5" fill="white"/>
    </svg>
    ${title ? `<h2 style="font-size: var(--font-size-xl); font-weight: 600; margin: 0 auto var(--space-2xs);">${escapeHtml(title)}</h2>` : ""}
    <div style="font-size: var(--font-size-base); color: var(--color-gray-800); line-height: var(--leading-loose); max-width: 44ch; margin-bottom: var(--space-m);">${content}</div>
  </div>`;
}

function renderDisclaimer(code: string): string {
  const title = extractProp(code, "title") || "Disclaimer";
  const content = extractContent(code, "Disclaimer");

  return `<div class="disclaimer-rendered" style="padding: 1.5rem 1.75rem; border-radius: var(--border-radius-base); box-shadow: var(--box-shadow-sm); border: 1px solid var(--color-gray-100); margin: 0 0 var(--space-xs); display: flex; gap: var(--space-s); flex-direction: row; align-items: baseline;">
    <span style="color: var(--color-bright-crimson); font-family: var(--font-sans); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.05rem; flex-shrink: 0;">${escapeHtml(title)}</span>
    <p style="margin: 0; font-size: calc(var(--font-size-base) / 1.2); line-height: var(--leading-loose); color: var(--color-gray-800);">${content}</p>
  </div>`;
}

function renderDraft(code: string): string {
  return `<div class="draft-rendered" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; margin: var(--space-l) auto; box-shadow: var(--box-shadow-lg); border-radius: var(--border-radius-lg); border: 1px solid var(--color-tinted-cream); padding: var(--space-s); max-width: 100%; width: 100%;">
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="var(--color-sea-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
    <h1 style="font-weight: 600; font-size: var(--font-size-2xl); margin: var(--space-s) 0 0;">Draft in Progress</h1>
    <p style="font-size: var(--font-size-base); color: var(--color-gray-800); width: 50ch; max-width: 90%; font-weight: 300; margin: var(--space-m) auto;">The quality of writing below this point is haphazard, disjointed, and nonsensical. It's probably a good idea to come back later.</p>
  </div>`;
}

function renderBlockquoteCitation(code: string): string {
  const author = extractProp(code, "author") || "";
  const title = extractProp(code, "title") || "";
  const url = extractProp(code, "url") || "#";
  const small = hasProp(code, "small");
  const content = extractContent(code, "BlockquoteCitation");

  const fontSize = small ? "var(--font-size-base)" : "var(--font-size-md)";

  return `<figure class="blockquote-citation-rendered">
    <blockquote style="font-size: ${fontSize}; line-height: 1.4; margin: var(--space-m) auto var(--space-s); padding: 0; border: none;">
      ${content}
    </blockquote>
    <figcaption style="text-align: center;">
      <div style="width: 3rem; border-top: 2px solid rgba(0,0,0,0.1); margin: 0 auto var(--space-s);"></div>
      <cite style="font-size: var(--font-size-xs); color: var(--color-gray-600); font-style: normal;">
        <span>${escapeHtml(author)}</span>
        ${title ? `<a href="${escapeHtml(url)}" style="color: inherit;"> – ${escapeHtml(title)}</a>` : ""}
      </cite>
    </figcaption>
  </figure>`;
}

function renderReferences(code: string): string {
  const content = extractContent(code, "References");

  return `<div class="references-rendered" style="margin-top: var(--space-xl); padding-top: var(--space-m); border-top: 1px solid var(--color-gray-200);">
    <h3 style="font-size: var(--font-size-lg); font-weight: 600; margin-bottom: var(--space-m); color: var(--color-gray-800);">References</h3>
    <div style="font-size: var(--font-size-sm);">${content}</div>
  </div>`;
}

function renderReferencesLink(code: string): string {
  const href = extractProp(code, "href") || "#";
  const title = extractProp(code, "title") || "";
  const author = extractProp(code, "author") || "";
  const content = extractContent(code, "ReferencesLink");

  return `<a href="${escapeHtml(href)}" class="references-link-rendered" style="display: block; margin: var(--space-xs) 0; color: var(--color-bright-crimson);">
    ${content || title}${author ? ` - ${escapeHtml(author)}` : ""}
  </a>`;
}

function renderHighlight(code: string): string {
  const content = extractContent(code, "Highlight");
  return `<mark class="highlight-rendered" style="background: var(--color-light-cream); padding: 0.1em 0.2em; border-radius: 2px;">${content}</mark>`;
}

function renderSmallCaps(code: string): string {
  const content = extractContent(code, "SmallCaps");
  return `<span class="small-caps-rendered" style="font-variant: small-caps; letter-spacing: 0.05em;">${content}</span>`;
}

function renderCenter(code: string): string {
  const content = extractContent(code, "Center");
  return `<div class="center-rendered" style="text-align: center; margin: var(--space-m) auto;">${content}</div>`;
}

function renderComingSoon(code: string): string {
  return `<div class="coming-soon-rendered" style="padding: var(--space-l); text-align: center; background: var(--color-light-cream); border-radius: var(--border-radius-base); margin: var(--space-m) auto;">
    <p style="color: var(--color-gray-600); font-style: italic; margin: 0;">Coming soon...</p>
  </div>`;
}

function renderSubtext(code: string): string {
  const content = extractContent(code, "Subtext");
  return `<span class="subtext-rendered" style="font-size: var(--font-size-sm); color: var(--color-gray-600);">${content}</span>`;
}

function renderTitle(code: string, componentName: string): string {
  const content = extractContent(code, componentName);
  const level = componentName.replace("Title", "");
  const sizes: Record<string, string> = {
    "1": "var(--font-size-3xl)",
    "2": "var(--font-size-2xl)",
    "3": "var(--font-size-xl)",
    "4": "var(--font-size-lg)",
  };
  const size = sizes[level] || "var(--font-size-xl)";

  return `<h${level} class="title-${level}-rendered" style="font-size: ${size}; font-weight: 600; margin: var(--space-l) 0 var(--space-s);">${content}</h${level}>`;
}

function renderPodcastiframe(code: string): string {
  const src = extractProp(code, "src") || "";
  const title = extractProp(code, "title") || "Podcast";

  return `<div class="podcast-rendered" style="width: 100%; margin: var(--space-m) auto;">
    <iframe src="${escapeHtml(src)}" width="100%" height="180" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="${escapeHtml(title)}" style="border-radius: var(--border-radius-base);"></iframe>
  </div>`;
}

function renderFullWidth(code: string, componentName: string): string {
  const content = extractContent(code, componentName);
  const background = extractProp(code, "background") || "transparent";

  return `<div class="full-width-rendered" style="width: 100vw; margin-left: calc(-50vw + 50%); padding: var(--space-l); background: ${escapeHtml(background)};">
    <div style="max-width: 1200px; margin: 0 auto;">${content}</div>
  </div>`;
}

function renderTalkSlide(code: string): string {
  const src = extractProp(code, "src") || "";
  const alt = extractProp(code, "alt") || "";

  const imageSrc = resolveImagePath(src);

  return `<figure class="talk-slide-rendered" style="margin: var(--space-m) auto; max-width: 100%;">
    <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(alt)}" style="width: 100%; height: auto; border-radius: var(--border-radius-base); box-shadow: var(--box-shadow-lg);" />
  </figure>`;
}

function renderImageLink(code: string, slug?: string): string {
  const src = extractProp(code, "src") || "";
  const href = extractProp(code, "href") || "#";
  const alt = extractProp(code, "alt") || "";

  const imageSrc = resolveImagePath(src);

  return `<a href="${escapeHtml(href)}" class="image-link-rendered" style="display: block; margin: var(--space-m) auto;">
    <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(alt)}" style="width: 100%; height: auto; border-radius: var(--border-radius-base);" />
  </a>`;
}

function renderButtonLink(code: string): string {
  const href = extractProp(code, "href") || "#";
  const content = extractContent(code, "ButtonLink");

  return `<a href="${escapeHtml(href)}" class="button-link-rendered" style="display: inline-block; padding: var(--space-xs) var(--space-m); background: var(--color-bright-crimson); color: white; border-radius: var(--border-radius-base); text-decoration: none; font-weight: 500;">
    ${content}
  </a>`;
}

function renderAccordion(code: string): string {
  const title = extractProp(code, "title") || "Details";
  const content = extractContent(code, "Accordion");

  return `<details class="accordion-rendered" style="margin: var(--space-m) 0; padding: var(--space-s); border: 1px solid var(--color-gray-200); border-radius: var(--border-radius-base);">
    <summary style="cursor: pointer; font-weight: 500; color: var(--color-gray-800);">${escapeHtml(title)}</summary>
    <div style="padding-top: var(--space-s);">${content}</div>
  </details>`;
}
