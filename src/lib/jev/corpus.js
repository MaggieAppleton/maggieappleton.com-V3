import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const markdown = new MarkdownIt();
const collections = ['essays', 'notes', 'patterns', 'talks', 'now', 'smidgeons'];
export const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function extractParagraphs(body) {
  const prepared = body
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?[^\S\n]*$/gm, '')
    .replace(/^import\s[^\n]*["'][^"'\n]+["'];?[^\S\n]*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, (tag) => {
      const alt = tag.match(/\balt\s*=\s*(["'])([\s\S]*?)\1/)?.[2];
      if (alt) return `\n\n![${alt.replace(/[\[\]]/g, '')}](#image-description)\n\n`;
      const url = tag.match(/(?:href|url)\s*=\s*(["'])(https?:\/\/[\s\S]*?)\1/)?.[2];
      return url ? ` [reference](${url}) ` : '\n';
    })
    .replace(/\[\[([^\]]+)\]\]/g, '$1');
  const paragraphs = [];
  let heading = '';
  const tokens = markdown.parse(prepared, {});
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'inline') continue;
    const children = token.children || [];
    const text = children.filter((t) => ['text', 'image', 'code_inline', 'softbreak', 'hardbreak'].includes(t.type))
      .map((t) => t.type.includes('break') ? ' ' : t.content).join('').replace(/\s+/g, ' ').trim();
    if (tokens[i - 1]?.type === 'heading_open') { heading = text; continue; }
    if (!text || /^[{}]/.test(text)) continue;
    const citations = children.filter((t) => t.type === 'link_open')
      .map((t) => t.attrGet('href')).filter((url) => /^https?:\/\//.test(url || ''));
    paragraphs.push({ id: `p${paragraphs.length + 1}`, text, heading, citations,
      ...(children.some((t) => t.type === 'image') ? { source: 'image_alt' } : {}) });
  }
  return paragraphs;
}

export function canonicalDocuments(entries) {
  const latest = new Map();
  for (const { file, data, content } of entries) {
    if (data.draft || !data.title) continue;
    const relative = file.replace(/\.mdx?$/, '');
    const base = relative.includes('/') ? relative.split('/')[0] : relative.replace(/-v\d+$/, '');
    const id = data.type === 'now' ? `now-${base}` : base;
    const version = data.version || Number(relative.match(/-v(\d+)$/)?.[1] || 1);
    if ((latest.get(id)?.version || 0) > version) continue;
    latest.set(id, { id, data, content, version });
  }
  const docs = [...latest.values()].map(({ id, data, content }) => ({
    id, title: data.title, description: data.description || '', type: data.type,
    topics: data.topics || [], growthStage: data.growthStage || (data.type === 'now' ? 'evergreen' : ''), url: `/${id}`,
    updated: new Date(data.updated || data.startDate).toISOString().slice(0, 10),
    wordCount: extractParagraphs(content).reduce((n, p) => n + p.text.split(/\s+/).length, 0),
    imageCount: (content.match(/!\[|<(?:RemoteImage|BasicImage|ImageLink|img)\b/g) || []).length,
    codeBlocks: (content.match(/^```/gm) || []).length / 2,
    paragraphs: extractParagraphs(content), aliases: data.aliases || [],
    rawLinks: [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]),
    pathLinks: [...content.matchAll(/\]\((?:https:\/\/maggieappleton\.com)?\/([^\s)#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]),
    outbound: [], inbound: [], lenses: {}, tending: {}, epistemic: [],
  }));
  const names = new Map(docs.flatMap((d) => [d.title, ...d.aliases].map((n) => [n.toLowerCase().replace(/\s+/g, ' ').trim(), d.id])));
  const ids = new Set(docs.map((d) => d.id));
  for (const doc of docs) {
    doc.outbound = [...new Set([...doc.rawLinks.map((n) => names.get(n.toLowerCase().replace(/\s+/g, ' ').trim())), ...doc.pathLinks])]
      .filter((id) => id && ids.has(id) && id !== doc.id);
    doc.unresolvedLinks = doc.rawLinks.filter((n) => !names.has(n.toLowerCase().replace(/\s+/g, ' ').trim()));
    delete doc.rawLinks; delete doc.pathLinks; delete doc.aliases;
  }
  for (const doc of docs) for (const target of doc.outbound) docs.find((d) => d.id === target).inbound.push(doc.id);
  return docs.sort((a, b) => a.title.localeCompare(b.title));
}

export async function loadCorpus(root = process.cwd()) {
  const entries = [];
  async function walk(dir, collection, prefix = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), collection, `${prefix}${entry.name}/`);
      else if (entry.name.endsWith('.mdx')) {
        const { data, content } = matter(await fs.readFile(path.join(dir, entry.name), 'utf8'));
        entries.push({ file: prefix + entry.name, data, content });
      }
    }
  }
  for (const collection of collections) await walk(path.join(root, 'src/content', collection), collection);
  return canonicalDocuments(entries);
}
