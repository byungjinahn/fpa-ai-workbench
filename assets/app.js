/* Shared page shell.
   1. Reads site.json (header text) and workflows.json (list of tabs).
   2. When a tab is opened for the first time, loads that workflow's scripts and data files from its folder,
      then calls the workflow's render function.
   Workflows register themselves with FPA.register("id", { render(panel, data, ctx) { ... } }). */
(function () {
  const FPA = (window.FPA = { modules: {} });
  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- helpers shared by all workflows ---------- */
  FPA.esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  FPA.num = (v) => { const n = parseFloat(String(v).replace(/[$,%\s]/g, "")); return isNaN(n) ? 0 : n; };
  FPA.fmtK = (v, d = 0) => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) + "K";
  FPA.fmtM = (k, d = 1) => (k < 0 ? "−" : "") + "$" + (Math.abs(k) / 1000).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) + "M";
  FPA.fmtSignK = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 }) + "K";
  FPA.pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
  FPA.sPct = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(d) + "%";

  /* CSV parser: handles quoted fields, commas and line breaks inside quotes. Returns an array of row objects. */
  FPA.parseCSV = function (text) {
    const rows = []; let row = [], f = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); f = ""; if (row.some((x) => x !== "")) rows.push(row); row = [];
      } else f += c;
    }
    row.push(f); if (row.some((x) => x !== "")) rows.push(row);
    const head = rows.shift().map((h) => h.trim());
    return rows.map((r) => { const o = {}; head.forEach((h, i) => (o[h] = (r[i] || "").trim())); return o; });
  };

  async function getFile(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Could not load ${path} (${res.status}). Check that the file exists with this exact name.`);
    const t = await res.text();
    if (path.endsWith(".json")) { try { return JSON.parse(t); } catch (e) { throw new Error(`${path} is not valid JSON: ${e.message}`); } }
    if (path.endsWith(".csv")) return FPA.parseCSV(t);
    return t;
  }
  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement("script"); s.src = src + (src.includes("?") ? "&" : "?") + "v=" + Date.now(); s.onload = ok;
      s.onerror = () => fail(new Error(`Could not load ${src}.`)); document.body.appendChild(s);
    });
  }
  FPA.register = (id, mod) => (FPA.modules[id] = mod);

  /* ---------- shell ---------- */
  let workflows = [], current = null;
  const loaded = {};

  async function openTab(id) {
    current = id;
    workflows.forEach((w) => {
      $("#tab-" + w.id).setAttribute("aria-selected", w.id === id);
      $("#panel-" + w.id).hidden = w.id !== id;
    });
    if (loaded[id]) return;
    loaded[id] = true;
    const w = workflows.find((x) => x.id === id), panel = $("#panel-" + id);
    panel.innerHTML = '<div class="loading">Loading…</div>';
    try {
      for (const s of w.scripts || []) await loadScript(`${w.folder}/${s}`);
      const data = {};
      await Promise.all(Object.entries(w.data || {}).map(async ([k, f]) => (data[k] = await getFile(`${w.folder}/${f}`))));
      const mod = FPA.modules[w.id];
      if (!mod) throw new Error(`${w.folder} scripts loaded, but none registered the id "${w.id}".`);
      panel.innerHTML = "";
      mod.render(panel, data, { folder: w.folder, workflow: w });
    } catch (e) {
      loaded[id] = false;
      panel.innerHTML = `<div class="error">${FPA.esc(e.message)}</div>`;
      console.error(e);
    }
  }

  async function boot() {
    let site, list;
    try {
      [site, list] = await Promise.all([getFile("site.json"), getFile("workflows.json")]);
    } catch (e) {
      const local = location.protocol === "file:";
      $("#panels").innerHTML = `<div class="error">${local ? "This page reads its data files from the same folder, which browsers block when a file is opened directly from your computer. Open it from GitHub Pages instead (or a local web server)." : FPA.esc(e.message)}</div>`;
      return;
    }
    document.title = site.title || document.title;
    $("#siteTitle").textContent = site.title || "";
    $("#siteEyebrow").textContent = site.eyebrow || "";
    $("#siteLede").textContent = site.lede || "";
    $("#siteNotice").innerHTML = site.notice || "";
    $("#res-h").textContent = site.results_title || "";
    $("#siteFooter").textContent = site.footer || "";
    const tagName = { etl: "Rules / ETL", ai: "LLM", human: "Human" };
    $("#sitePipeline").innerHTML = (site.steps || []).map((s, i) =>
      `<div class="step"><span class="n">${i + 1}</span><h3>${FPA.esc(s.name)}</h3><span class="tag ${s.tag}">${tagName[s.tag] || s.tag}</span><p>${FPA.esc(s.text)}</p></div>`).join("");
    $("#siteResults").innerHTML = (site.results || []).map((r) =>
      `<div class="result"><div class="big">${FPA.esc(r.big)}</div><p>${FPA.esc(r.text)}</p></div>`).join("");

    // author, principles, start-here, application notes
    const au = site.author || {};
    const links = (au.links || []).filter((l) => l.url);
    $("#siteAuthor").innerHTML = au.name ? `<b>${FPA.esc(au.name)}</b>${au.role ? `<span>${FPA.esc(au.role)}</span>` : ""}${links.map((l) => `<a href="${FPA.esc(l.url)}" target="_blank" rel="noopener">${FPA.esc(l.label)}</a>`).join("")}` : "";
    $("#siteAuthor").hidden = !au.name;
    $("#sitePrinciples").innerHTML = (site.principles || []).map((p) => `<li>${FPA.esc(p)}</li>`).join("");
    $("#start-h").textContent = site.start_title || "";
    $("#startNote").textContent = site.start_note || "";
    if (site.video_url) { $("#siteVideo").href = site.video_url; $("#siteVideo").hidden = false; }
    $("#siteTries").innerHTML = (site.tries || []).map((t, i) =>
      `<button class="try" data-tab="${FPA.esc(t.tab)}"><span class="n">${i + 1}</span><b>${FPA.esc(t.title)}</b><span>${FPA.esc(t.text)}</span><span class="go">Open →</span></button>`).join("");
    document.querySelectorAll("#siteTries .try").forEach((b) => b.addEventListener("click", () => {
      openTab(b.dataset.tab);
      $("#workflowsTop").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }));
    const ap = site.apply;
    if (ap) {
      $("#apply-h").textContent = ap.title;
      $("#siteApply").innerHTML = ap.items.map((x) => `<div><b>${FPA.esc(x.head)}</b><p>${FPA.esc(x.text)}</p></div>`).join("");
    } else $("#apply-h").parentElement.hidden = true;

    workflows = list.workflows || [];
    const tabs = $("#tabs"), panels = $("#panels");
    tabs.style.setProperty("--cols", Math.min(workflows.length, 4));
    workflows.forEach((w) => {
      const b = document.createElement("button");
      b.role = "tab"; b.id = "tab-" + w.id; b.setAttribute("aria-controls", "panel-" + w.id);
      b.innerHTML = `<b>${FPA.esc(w.title)}</b><span>${FPA.esc(w.subtitle || "")}</span>`;
      b.addEventListener("click", () => openTab(w.id));
      tabs.appendChild(b);
      const p = document.createElement("section");
      p.className = "panel"; p.id = "panel-" + w.id; p.setAttribute("role", "tabpanel"); p.setAttribute("aria-labelledby", "tab-" + w.id); p.hidden = true;
      panels.appendChild(p);
    });
    // first visit opens the first workflow in workflows.json; a #tab-id link opens that tab
    let start = (location.hash || "").slice(1);
    if (!workflows.some((w) => w.id === start)) start = workflows[0] && workflows[0].id;
    if (start) openTab(start);
  }
  boot();
})();
