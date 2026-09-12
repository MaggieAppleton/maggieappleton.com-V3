// A fixed, shared 100-stitch vocabulary. Marks are percentage units, not people.
export const stitches = [
  [17, 12], [25, 20], [33, 28], [41, 40],
].flatMap(([radius, count], ring) => Array.from({ length: count }, (_, index) => {
  const angle = (index + .5) / count * Math.PI * 2;
  return { x: 50 + Math.sin(angle) * radius, y: 50 - Math.cos(angle) * radius, angle, ring };
})).sort((a, b) => a.angle - b.angle || a.ring - b.ring);

export const percent = share => share === null ? "—" : `${Math.round(share * 100)}%`;
export const escape = text => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cross = ({ x, y }) => `M${(x-1.65).toFixed(2)},${(y-1.65).toFixed(2)}l3.3,3.3m0,-3.3l-3.3,3.3`;
const allStitches = stitches.map(cross).join("");

const icons = {
  cleaning: '<path d="M5 9h14l-2 12H7L5 9Zm3-1V6a4 4 0 0 1 8 0v2M8 13h8M9 16h6"/>',
  scheduling: '<path d="M4 5h16v16H4V5Zm0 5h16M8 2v5m8-5v5M8 13h2m4 0h2m-8 4h2m4 0h2"/>',
  childcare: '<path d="m3 7 5-4 4 4-2 4-2-1v11H3V10L1 11l-1-4M13 8l4-4 5 3-1 5-2-1v10h-5V11l-2 1" transform="translate(1 0) scale(.95 1)"/>',
  social_relationships: '<path d="M12 12c-7 0-6-7-2-5-2-6 6-6 4 0 5-2 6 5-2 5Zm0 0v10m0-5c-5 0-6-4-6-4 5 0 6 4 6 4Zm0 3c5 0 6-4 6-4-5 0-6 4-6 4Z"/>',
  food: '<path d="M3 11h18c-1 7-5 9-9 9s-8-2-9-9Zm-1 0h20M9 3c-3 2 3 3 0 5m6-5c-3 2 3 3 0 5M7 22h10"/>',
  maintenance: '<path d="m4 20 9-9c-2-5 3-9 7-7l-4 4 2 2 4-4c2 4-2 9-7 7l-9 9-2-2Zm1 0h.01"/>',
  finances: '<path d="M7 8h10l4 12H3L7 8Zm0 0 3-4m7 4-3-4M10 4a2 2 0 1 1 4 0M8 12h8m-9 5h10"/>',
};

export function householdIcon(id) {
  return `<svg class="sp-household-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id] ?? icons.scheduling}</svg>`;
}

export function motif(share, domain) {
  const count = share === null ? 0 : Math.max(0, Math.min(100, Math.round(share * 100)));
  return `<svg class="sp-rosette" viewBox="0 0 100 100" aria-hidden="true" data-stitches="100" data-coloured="${count}">
    <path class="sp-empty-thread" d="${allStitches}"/>
    <path class="sp-coloured-thread" d="${stitches.slice(0, count).map(cross).join("")}"/>
    <g class="sp-centre-motif" transform="translate(40 40) scale(.8333)" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${icons[domain] ?? icons.scheduling}</g>
  </svg>`;
}

export function taskRows(domain) {
  return domain.tasks.map(task => `<div class="sp-task-row" data-task-row="${task.id}">
    <button class="sp-task-label" data-inspect-task="${task.id}" aria-label="${escape(task.wording)}. Mothers ${percent(task.values.mothers.share)}, fathers ${percent(task.values.fathers.share)}.">${escape(task.label)}</button>
    ${["mothers", "fathers"].map(gender => `<button class="sp-task-glyph sp-${gender}" data-inspect-task="${task.id}" data-task-gender="${gender}" aria-label="${escape(task.wording)}. ${gender === "mothers" ? "Mothers" : "Fathers"}: ${percent(task.values[gender].share)}, ${task.values[gender].n.toLocaleString()} applicable respondents.">${motif(task.values[gender].share, domain.id)}</button>`).join("")}
  </div>`).join("");
}
