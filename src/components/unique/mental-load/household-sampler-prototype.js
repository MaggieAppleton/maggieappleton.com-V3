import { householdIcon, taskRows, percent } from "./sampler-art.js";

function startSampler(root) {
  const abort = new AbortController();
  const listen = (element, event, fn) => element.addEventListener(event, fn, { signal: abort.signal });
  const $ = selector => root.querySelector(selector);
  const tiles = [...root.querySelectorAll("[data-domain]")];
  const data = JSON.parse($("[data-sampler-data]").textContent);
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const list = $("[data-task-list]");
  let selected = data.domains.find(domain => domain.id === "scheduling");
  let pinned = null;
  let animations = [];

  function highlight(id) {
    tiles.forEach(tile => { tile.dataset.highlighted = String(tile.dataset.domain === id); });
  }

  function readout(item) {
    $("[data-readout-caption]").textContent = item?.label ?? "More coloured stitches, more responsibility.";
    $("[data-readout-values]").hidden = !item;
    if (item) {
      for (const gender of ["mothers", "fathers"]) {
        const value = item.values[gender];
        const target = $(`[data-readout-${gender}]`);
        target.textContent = `${gender === "mothers" ? "Mothers" : "Fathers"} ${percent(value.share)}`;
        target.title = `${value.n.toLocaleString()} applicable respondents out of ${value.total.toLocaleString()}`;
      }
    }
  }

  function itemFor(element) {
    if (element.dataset.domain) {
      const domain = data.domains.find(domain => domain.id === element.dataset.domain);
      return { label: `${domain.label} · average responsibility`, values: domain.values };
    }
    if (element.dataset.summary) {
      const scope = element.dataset.summary;
      return { label: `${scope === "daily" ? "Daily" : "Episodic"} responsibilities · overall average`, values: data.scopes[scope].values };
    }
    const task = selected.tasks.find(task => task.id === Number(element.dataset.inspectTask));
    return task ? { label: task.wording, values: task.values } : null;
  }

  function inspect(element, pin = false) {
    const item = itemFor(element);
    if (pin) pinned = item;
    readout(item);
    root.querySelectorAll("[data-task-row]").forEach(row => { row.dataset.inspected = String(row.dataset.taskRow === element.dataset.inspectTask); });
  }

  function select(id, animate = true, pin = true) {
    const domain = data.domains.find(domain => domain.id === id);
    if (!domain) return;
    const changed = domain.id !== selected.id;
    selected = domain;
    tiles.forEach(tile => tile.setAttribute("aria-pressed", String(tile.dataset.domain === id)));
    if (changed) {
      animations.forEach(animation => animation.cancel());
      $("[data-detail-title]").textContent = domain.label;
      $("[data-detail-scope]").textContent = domain.scope === "daily" ? "Daily" : "Episodic";
      $("[data-detail-icon]").innerHTML = householdIcon(domain.id);
      list.innerHTML = taskRows(domain);
      if (animate && !media.matches) animations = [$("[data-detail-heading]"), list].map(element => element.animate([{ opacity: .25, transform: "translateX(5px)" }, { opacity: 1, transform: "translateX(0)" }], { duration: 200, easing: "cubic-bezier(.16,1,.3,1)" }));
    }
    if (pin) {
      pinned = { label: `${domain.label} · average responsibility`, values: domain.values };
      readout(pinned);
    }
    const url = new URL(location.href);
    url.searchParams.set("domain", id);
    url.searchParams.delete("view"); url.searchParams.delete("scope");
    history.replaceState(history.state, "", url);
  }

  // Delegated inspection also covers the three task rows as their contents change.
  const inspectable = target => target instanceof Element ? target.closest("[data-domain], [data-inspect-task], [data-summary]") : null;
  listen(root, "pointerover", event => {
    if (event.pointerType === "touch") return;
    const element = inspectable(event.target);
    if (!element || element.contains(event.relatedTarget)) return;
    if (element.dataset.domain) highlight(element.dataset.domain);
    inspect(element);
  });
  listen(root, "pointerout", event => {
    if (event.pointerType === "touch") return;
    const element = inspectable(event.target);
    if (!element || element.contains(event.relatedTarget)) return;
    highlight(null); readout(pinned);
    root.querySelectorAll("[data-task-row]").forEach(row => { row.dataset.inspected = "false"; });
  });
  listen(root, "focusin", event => {
    const element = inspectable(event.target);
    if (!element) return;
    if (element.dataset.domain) highlight(element.dataset.domain);
    inspect(element);
  });
  listen(root, "focusout", () => { highlight(null); readout(pinned); });
  listen(root, "click", event => {
    const element = inspectable(event.target);
    if (!element) return;
    if (element.dataset.domain) select(element.dataset.domain, event.detail !== 0);
    else inspect(element, true);
  });
  listen(root, "keydown", event => {
    if (event.key === "Escape") { pinned = null; readout(null); highlight(null); }
  });
  listen(media, "change", () => { if (media.matches) animations.forEach(animation => animation.cancel()); });
  const requested = new URLSearchParams(location.search).get("domain");
  if (requested) select(requested, false, false);
  return () => { abort.abort(); animations.forEach(animation => animation.cancel()); };
}

let cleanup;
function mount() { cleanup?.(); cleanup = undefined; const root = document.querySelector("[data-household-sampler]"); if (root) cleanup = startSampler(root); }
mount();
document.addEventListener("astro:page-load", mount);
document.addEventListener("astro:before-swap", () => { cleanup?.(); cleanup = undefined; });
