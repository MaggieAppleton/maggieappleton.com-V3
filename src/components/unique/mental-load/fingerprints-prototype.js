// Throwaway visual experiment. Source records remain immutable throughout.
const domains = [
  ["cleaning", "Cleaning"], ["scheduling", "Scheduling"], ["childcare", "Childcare"],
  ["social_relationships", "Relationships"], ["food", "Food"],
  ["maintenance", "Maintenance"], ["finances", "Finances"],
];
const responses = ["Not applicable", "Mostly me", "Mostly partner", "Shared equally", "Someone else"];
const colours = { mothers: "#ac6347", fathers: "#397482" };
const singular = { mothers: "Mother", fathers: "Father" };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

function start(root) {
  const abort = new AbortController();
  const listen = (element, name, fn) => element.addEventListener(name, fn, { signal: abort.signal });
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const source = JSON.parse($("[data-fingerprint-data]").textContent);
  const tasks = domains.flatMap(([domain]) => source.tasks.filter(t => t.domain === domain));
  const records = source.records.map(([id, gender, answers], ordinal) => ({ id, gender, answers, ordinal }));
  const groups = Object.fromEntries(Object.keys(colours).map(g => [g, records.filter(r => r.gender === g)]));
  const byId = new Map(records.map(r => [r.id, r]));
  const params = new URLSearchParams(location.search);
  const state = {
    view: params.get("view") === "all" ? "all" : "one",
    scope: ["daily", "episodic"].includes(params.get("scope")) ? params.get("scope") : "all",
    sort: "responsibility", zoom: 1, exampleGroup: "mothers",
  };
  const examples = Object.fromEntries(Object.entries(groups).map(([g, list]) => [g,
    list.find(r => r.answers.every(a => a !== 0) && r.answers.filter(a => a === 1).length === (g === "mothers" ? 14 : 9)) ?? list[0],
  ]));
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const active = task => state.scope === "all" || (state.scope === "daily" ? !["maintenance", "finances"].includes(task.domain) : ["maintenance", "finances"].includes(task.domain));
  const counts = record => tasks.reduce((sum, task) => {
    if (active(task)) { const answer = record.answers[task.id - 1]; sum.owned += Number(answer === 1); sum.applicable += Number(answer !== 0); }
    return sum;
  }, { owned: 0, applicable: 0 });
  const countText = record => { const c = counts(record); return `${c.owned} of ${c.applicable} applicable ${state.scope === "all" ? "" : `${state.scope} `}tasks mostly their responsibility`; };
  const mark = code => `<i class="fp-mark" data-code="${code}" aria-hidden="true"></i>`;
  const taskColumns = domains.map(([key, label], index) => ({ key, label, dimension: index < 5 ? "daily" : "episodic", tasks: tasks.filter(t => t.domain === key) }));
  const ordered = gender => [...groups[gender]].sort((a, b) => state.sort === "survey" ? a.id - b.id : counts(a).owned - counts(b).owned || a.id - b.id);
  const panels = Object.keys(groups).map(gender => ({ gender, canvas: $(`[data-canvas="${gender}"]`), positions: new Map(), focused: null, order: [], layout: null }));
  const dialog = $("[data-dialog]");
  let selected = null;
  let animation = 0;
  let lastExample = null;
  let hoverId = null;

  function animateIn(element) {
    if (!media.matches) element.animate([{ opacity: .4, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 200, easing: "cubic-bezier(.2,.8,.2,1)" });
  }

  function renderExample() {
    const record = examples[state.exampleGroup];
    $("[data-one]").style.setProperty("--fp-group", colours[record.gender]);
    $("[data-example-id]").textContent = `Survey respondent ${record.id.toLocaleString()} · an individual example`;
    $("[data-example-title]").textContent = `One ${singular[record.gender].toLowerCase()}’s account`;
    const c = counts(record);
    $("[data-example-count]").innerHTML = `<strong>${c.owned} of ${c.applicable}</strong> applicable ${state.scope === "all" ? "" : `${state.scope} `}tasks mostly their responsibility`;
    if (lastExample !== record.id) {
      $("[data-anatomy]").innerHTML = taskColumns.map(domain => `<div class="fp-domain" data-domain="${domain.key}" data-dimension="${domain.dimension}">
        <h3>${domain.label}</h3>${domain.tasks.map(task => {
          const code = record.answers[task.id - 1];
          return `<div class="fp-task" data-code="${code}" title="${escape(task.wording)} — ${responses[code]}">${mark(code)}<span>${escape(task.label)}<span class="fp-sr-only">: ${responses[code]}</span></span></div>`;
        }).join("")}</div>`).join("");
      lastExample = record.id;
      animateIn($("[data-anatomy]"));
    }
    $$(".fp-domain").forEach(element => { element.dataset.inactive = String(state.scope !== "all" && element.dataset.dimension !== state.scope); });
    $$("[data-example-group]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.exampleGroup === state.exampleGroup)));
  }

  // Render each respondent once into an atlas, then move the resulting fingerprints.
  // Sort animations draw 3,000 small images instead of rebuilding 63,000 paths per frame.
  const atlas = document.createElement("canvas");
  atlas.width = 50 * 32 * 2;
  atlas.height = Math.ceil(records.length / 50) * 16 * 2;
  const atlasContext = atlas.getContext("2d");

  function rebuildAtlas() {
    const ctx = atlasContext;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, atlas.width / 2, atlas.height / 2);
    for (const record of records) {
      const ox = record.ordinal % 50 * 32, oy = Math.floor(record.ordinal / 50) * 16;
      tasks.forEach((task, index) => {
        const x = ox + 3 + Math.floor(index / 3) * 3.6, y = oy + 3 + index % 3 * 3.2;
        const code = record.answers[task.id - 1];
        ctx.globalAlpha = active(task) ? 1 : .11;
        ctx.fillStyle = colours[record.gender];
        ctx.strokeStyle = code === 2 || code === 0 ? "#b4ada0" : colours[record.gender];
        ctx.lineWidth = .55;
        if (code === 0) {
          ctx.beginPath(); ctx.moveTo(x-.65,y-.65); ctx.lineTo(x+.65,y+.65); ctx.moveTo(x+.65,y-.65); ctx.lineTo(x-.65,y+.65); ctx.stroke();
        } else if (code === 4) {
          ctx.fillStyle = "#938c7f"; ctx.beginPath(); ctx.arc(x,y,.45,0,Math.PI*2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(x,y,1.05,0,Math.PI*2);
          if (code === 1) ctx.fill(); else ctx.stroke();
          if (code === 3) { ctx.beginPath(); ctx.arc(x,y,1.05,Math.PI/2,Math.PI*1.5); ctx.closePath(); ctx.fill(); }
        }
      });
    }
    ctx.globalAlpha = 1;
  }

  function drawPanel(panel, positions = panel.positions) {
    if (!panel.layout) return;
    const ctx = panel.canvas.getContext("2d"), { dpr, width, height } = panel.layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (const record of panel.order) {
      const p = positions.get(record.id);
      if (!p) continue;
      ctx.drawImage(atlas, record.ordinal % 50 * 64, Math.floor(record.ordinal / 50) * 32, 64, 32, p.x, p.y, p.scale * 32, p.scale * 16);
      if (record.id === panel.focused) {
        ctx.strokeStyle = colours[record.gender]; ctx.lineWidth = 1;
        ctx.strokeRect(p.x, p.y, p.scale * 29, p.scale * 14);
      }
    }
  }

  function renderPopulation(animate = false) {
    if (state.view !== "all") return;
    cancelAnimationFrame(animation);
    const begins = panels.map(panel => new Map(panel.positions));
    const ends = [];
    for (const panel of panels) {
      panel.order = ordered(panel.gender);
      const width = Math.max(180, panel.canvas.parentElement.clientWidth - 6);
      const targetHeight = matchMedia("(max-width:640px)").matches ? 350 : 560;
      const scale = Math.min(1.1, Math.sqrt(width * targetHeight / (1658 * 32 * 16))) * state.zoom;
      const columns = Math.max(1, Math.floor(width / (32 * scale)));
      const height = Math.ceil(Math.ceil(1658 / columns) * 16 * scale + 12);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const left = (width - columns * 32 * scale) / 2;
      panel.layout = { width, height, scale, columns, dpr, left };
      panel.canvas.width = Math.ceil(width * dpr); panel.canvas.height = Math.ceil(height * dpr);
      panel.canvas.style.width = `${width}px`; panel.canvas.style.height = `${height}px`;
      const targets = new Map(panel.order.map((record, index) => [record.id, { x: left + index % columns * 32 * scale, y: 6 + Math.floor(index / columns) * 16 * scale, scale }]));
      ends.push(targets);
      let sum = 0, n = 0;
      for (const record of groups[panel.gender]) { const c = counts(record); if (c.applicable) { sum += c.owned / c.applicable; n++; } }
      $(`[data-average="${panel.gender}"]`).textContent = `${Math.round(sum / n * 100)}%`;
      $(`[data-average="${panel.gender}"]`).title = `${n.toLocaleString()} respondents with applicable tasks; mean ${((sum / n) * 100).toFixed(2)}%`;
      $(`[data-field-summary="${panel.gender}"]`).textContent = state.sort === "responsibility" ? "Fewer → more responsibilities" : "Original survey order";
      panel.canvas.setAttribute("aria-label", `${groups[panel.gender].length.toLocaleString()} ${panel.gender}' fingerprints. ${state.scope} tasks. Arrow keys explore; Enter opens answers.`);
    }
    $("[data-scope-name]").textContent = state.scope === "all" ? "surveyed" : state.scope;
    const shouldAnimate = animate && !media.matches && begins.every(map => map.size);
    const startTime = performance.now();
    function frame(now) {
      const t = shouldAnimate ? Math.min(1, (now - startTime) / 240) : 1;
      const eased = t * t * (3 - 2 * t);
      panels.forEach((panel, index) => {
        panel.positions = new Map([...ends[index]].map(([id, end]) => {
          const begin = begins[index].get(id) ?? end;
          return [id, { x: begin.x + (end.x-begin.x)*eased, y: begin.y + (end.y-begin.y)*eased, scale: begin.scale + (end.scale-begin.scale)*eased }];
        }));
        drawPanel(panel);
      });
      if (t < 1) animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
  }

  function renderDialog() {
    if (!selected) return;
    const record = selected;
    dialog.style.setProperty("--fp-group", colours[record.gender]);
    $("[data-dialog-id]").textContent = `Survey respondent ${record.id.toLocaleString()}`;
    $("[data-dialog-title]").textContent = `One ${singular[record.gender].toLowerCase()}’s fingerprint`;
    $("[data-dialog-count]").textContent = countText(record);
    $("[data-dialog-glyph]").innerHTML = tasks.map(task => `<span style="opacity:${active(task) ? 1 : .15}">${mark(record.answers[task.id-1])}</span>`).join("");
    $("[data-answers]").innerHTML = taskColumns.map(domain => `<section class="fp-answer-domain"><h3>${domain.label} · ${domain.dimension === "daily" ? "Daily" : "Episodic"}</h3>${domain.tasks.map(task => {
      const code = record.answers[task.id-1];
      return `<div class="fp-answer-row">${mark(code)}<span>${escape(task.wording)}</span><span class="fp-response">${responses[code]}</span></div>`;
    }).join("")}</section>`).join("");
  }

  function openRecord(record) {
    selected = record;
    renderDialog();
    $("[data-hover]").hidden = true;
    if (!dialog.open) { dialog.showModal(); animateIn(dialog); }
    dialog.scrollTop = 0;
  }

  function hit(panel, event) {
    if (!panel.layout) return null;
    const rect = panel.canvas.getBoundingClientRect(), { scale, columns, left } = panel.layout;
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (x < left || y < 6) return null;
    const column = Math.floor((x-left) / (32*scale)), row = Math.floor((y-6) / (16*scale));
    if (column >= columns) return null;
    return panel.order[row * columns + column] ?? null;
  }

  function update(animate = true) {
    $("[data-one]").hidden = state.view !== "one";
    $("[data-population]").hidden = state.view !== "all";
    $("[data-hover]").hidden = true;
    $$("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    $$("[data-scope]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scope === state.scope)));
    const url = new URL(location.href);
    url.searchParams.set("view", state.view); url.searchParams.set("scope", state.scope);
    history.replaceState(history.state, "", url);
    renderExample(); rebuildAtlas(); renderPopulation(animate);
    if (dialog.open) renderDialog();
  }

  $$("[data-view]").forEach(button => listen(button, "click", () => { state.view = button.dataset.view; update(false); animateIn(state.view === "all" ? $("[data-population]") : $("[data-one]")); }));
  listen($("[data-expand]"), "click", () => { state.view = "all"; update(false); $("[data-view=all]").focus(); animateIn($("[data-population]")); });
  $$("[data-scope]").forEach(button => listen(button, "click", () => { state.scope = button.dataset.scope; update(); }));
  $$("[data-example-group]").forEach(button => listen(button, "click", () => { state.exampleGroup = button.dataset.exampleGroup; renderExample(); }));
  listen($("[data-another]"), "click", () => {
    const group = groups[state.exampleGroup], index = group.indexOf(examples[state.exampleGroup]);
    examples[state.exampleGroup] = group[(index + 137) % group.length]; renderExample();
  });
  listen($("[data-sort]"), "change", event => { state.sort = event.target.value; renderPopulation(true); });
  listen($("[data-zoom]"), "input", event => { state.zoom = Number(event.target.value); renderPopulation(false); });
  listen($("[data-close]"), "click", () => dialog.close());
  listen(dialog, "click", event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  for (const [selector, delta] of [["[data-prev]", -1], ["[data-next]", 1]]) listen($(selector), "click", () => {
    const list = ordered(selected.gender), index = list.findIndex(r => r.id === selected.id);
    selected = list[(index + delta + list.length) % list.length]; renderDialog(); dialog.scrollTop = 0;
  });

  for (const panel of panels) {
    listen(panel.canvas, "pointermove", event => {
      if (event.pointerType === "touch") return;
      const record = hit(panel, event), hover = $("[data-hover]");
      hover.hidden = !record;
      if (!record) return;
      hover.textContent = `${singular[record.gender]} · ${record.id.toLocaleString()} — ${countText(record)}`;
      hover.style.left = `${Math.max(8, Math.min(event.clientX+14, innerWidth-230))}px`;
      hover.style.top = `${Math.max(8, Math.min(event.clientY+14, innerHeight-80))}px`;
      if (hoverId !== record.id) { hoverId = record.id; panel.focused = record.id; drawPanel(panel); }
    });
    listen(panel.canvas, "pointerleave", () => { $("[data-hover]").hidden = true; hoverId = null; });
    listen(panel.canvas.parentElement, "scroll", () => { $("[data-hover]").hidden = true; });
    listen(panel.canvas, "click", event => { const record = hit(panel, event); if (record) openRecord(record); });
    listen(panel.canvas, "keydown", event => {
      const deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -panel.layout.columns, ArrowDown: panel.layout.columns };
      let index = Math.max(0, panel.order.findIndex(r => r.id === panel.focused));
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRecord(panel.order[index]); return; }
      if (!(event.key in deltas) && !["Home", "End"].includes(event.key)) return;
      event.preventDefault();
      index = event.key === "Home" ? 0 : event.key === "End" ? panel.order.length - 1 : Math.max(0, Math.min(panel.order.length-1, index + deltas[event.key]));
      const record = panel.order[index]; panel.focused = record.id; drawPanel(panel);
      $("[data-live]").textContent = `${singular[record.gender]} ${record.id}. ${countText(record)}`;
      const position = panel.positions.get(record.id), scroll = panel.canvas.parentElement;
      if (position.y < scroll.scrollTop) scroll.scrollTop = position.y;
      else if (position.y + position.scale*16 > scroll.scrollTop+scroll.clientHeight) scroll.scrollTop = position.y + position.scale*16 - scroll.clientHeight;
    });
    listen($(`[data-inspect-group="${panel.gender}"]`), "click", () => openRecord(byId.get(panel.focused) ?? panel.order[Math.floor(panel.order.length/2)]));
  }
  const observer = new ResizeObserver(() => renderPopulation(false));
  panels.forEach(panel => observer.observe(panel.canvas.parentElement));
  listen(media, "change", () => renderPopulation(false));
  update(false);
  return () => { abort.abort(); observer.disconnect(); cancelAnimationFrame(animation); if (dialog.open) dialog.close(); };
}

let cleanup;
function mount() { cleanup?.(); cleanup = undefined; const root = document.querySelector("[data-fingerprints]"); if (root) cleanup = start(root); }
mount();
document.addEventListener("astro:page-load", mount);
document.addEventListener("astro:before-swap", () => { cleanup?.(); cleanup = undefined; });
