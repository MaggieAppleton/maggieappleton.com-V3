function mountMaps(root) {
  const abort = new AbortController();
  const listen = (element, event, fn) => element.addEventListener(event, fn, { signal: abort.signal });
  const $ = selector => root.querySelector(selector);
  const tiles = [...root.querySelectorAll("[data-domain]")];
  const data = JSON.parse($("[data-map-data]").textContent);
  const detail = $("[data-detail]");
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const percent = share => share === null ? "—" : `${Math.round(share * 100)}%`;
  const escape = text => String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let selected = null;
  let origin = null;
  let motion;

  function highlight(id) {
    tiles.forEach(tile => { tile.dataset.highlighted = String(tile.dataset.domain === id); });
  }

  function updateUrl(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("domain", id); else url.searchParams.delete("domain");
    // Remove the earlier fingerprint experiment's controls from shared URLs.
    url.searchParams.delete("view"); url.searchParams.delete("scope");
    history.replaceState(history.state, "", url);
  }

  function select(id, { trigger = null, animate = true } = {}) {
    const domain = data.domains.find(domain => domain.id === id);
    if (!domain) return;
    motion?.cancel();
    selected = id;
    origin = trigger ?? tiles.find(tile => tile.dataset.domain === id);
    tiles.forEach(tile => tile.setAttribute("aria-expanded", String(tile.dataset.domain === id)));
    $("[data-detail-scope]").textContent = `${domain.scope === "daily" ? "Daily" : "Episodic"} · three responsibilities`;
    $("[data-detail-title]").textContent = domain.label;
    $("[data-task-comparison]").innerHTML = domain.tasks.map(task => `<div class="rm-task-row" data-task-id="${task.id}">
      <div class="rm-task-wording">${escape(task.wording)}</div>
      ${["mothers", "fathers"].map(gender => {
        const value = task.values[gender];
        const label = `${gender === "mothers" ? "Mothers" : "Fathers"}: ${percent(value.share)}. ${value.n.toLocaleString()} with applicable answers out of ${value.total.toLocaleString()}.`;
        return `<div class="rm-task-value rm-${gender}" data-task-gender="${gender}" style="--share:${value.share ?? 0}" aria-label="${label}" title="${label}"><span class="rm-tile-fill" aria-hidden="true"></span><strong aria-hidden="true">${percent(value.share)}</strong></div>`;
      }).join("")}
    </div>`).join("");
    detail.hidden = false;
    updateUrl(id);
    $("[data-live]").textContent = `${domain.label}: ${percent(domain.values.mothers.share)} for mothers, ${percent(domain.values.fathers.share)} for fathers. Three task comparisons expanded below.`;
    if (animate && !media.matches) motion = detail.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(.16,1,.3,1)" });
    if (trigger) {
      detail.focus({ preventScroll: true });
      const bounds = detail.getBoundingClientRect();
      if (bounds.top > innerHeight - 160 || bounds.top < 0) detail.scrollIntoView({ behavior: media.matches || !animate ? "instant" : "smooth", block: "start" });
    }
  }

  function close({ animate = true } = {}) {
    if (!selected) return;
    motion?.cancel();
    selected = null;
    tiles.forEach(tile => tile.setAttribute("aria-expanded", "false"));
    updateUrl(null);
    origin?.focus({ preventScroll: true });
    if (animate && !media.matches) {
      motion = detail.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-4px)" }], { duration: 140, easing: "ease-out" });
      motion.onfinish = () => { detail.hidden = true; };
    } else detail.hidden = true;
    $("[data-live]").textContent = "Task comparison closed.";
  }

  for (const tile of tiles) {
    listen(tile, "pointerenter", event => { if (event.pointerType !== "touch") highlight(tile.dataset.domain); });
    listen(tile, "pointerleave", () => highlight(null));
    listen(tile, "focus", () => highlight(tile.dataset.domain));
    listen(tile, "blur", () => highlight(null));
    listen(tile, "click", event => { if (selected === tile.dataset.domain) close({ animate: event.detail !== 0 }); else select(tile.dataset.domain, { trigger: tile, animate: event.detail !== 0 }); });
  }
  listen($("[data-close-detail]"), "click", event => close({ animate: event.detail !== 0 }));
  listen(root, "keydown", event => { if (event.key === "Escape" && selected) { event.preventDefault(); close({ animate: false }); } });
  listen(media, "change", () => { if (media.matches) { motion?.cancel(); detail.hidden = !selected; } });
  const requested = new URLSearchParams(location.search).get("domain");
  if (requested) select(requested, { animate: false });
  return () => { abort.abort(); motion?.cancel(); };
}

let cleanup;
function mount() { cleanup?.(); cleanup = undefined; const root = document.querySelector("[data-responsibility-maps]"); if (root) cleanup = mountMaps(root); }
mount();
document.addEventListener("astro:page-load", mount);
document.addEventListener("astro:before-swap", () => { cleanup?.(); cleanup = undefined; });
