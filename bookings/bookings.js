/* Bookings forecast workflow (current and next quarter).
   Data files in this folder:
   - pipeline.csv            one row per deal (stage, forecast category, aging, pushes, AI risk note)
   - sales-calls.csv         managers' commit / upside / stretch by quarter and booking type
   - aop.csv                 plan by quarter and booking type
   - conversion-rates.csv    historical win rates by forecast category and stage
   - quality-adjustments.csv multipliers for days in stage and close-date pushes
   - settings.json           quarters, page text, default AI risk haircut, expected not-yet-created bookings */
FPA.register("bookings", {
  render(panel, data) {
    const { esc, num, fmtK, fmtSignK, pct } = FPA;
    const S = data.settings, TYPES = S.booking_types;
    const Q = [S.current_quarter, S.next_quarter];
    const deals = data.pipeline.map((r) => ({ id: r.deal_id, acct: r.account, type: r.type, region: r.region, owner: r.owner, q: r.close_quarter,
      amt: num(r.amount_k), stage: r.stage, cat: r.forecast_category, age: num(r.days_in_stage), pushes: num(r.close_date_pushes), src: r.source,
      note: r.ai_risk_note, closed: /closed won/i.test(r.stage) }));
    const st = { q: Q[0], hair: S.ai_risk_haircut_default ?? 0.3, keep: {}, adj: {}, submitted: {} };
    deals.forEach((d) => { if (d.note) st.keep[d.id] = true; });
    Q.forEach((q) => { st.adj[q] = {}; TYPES.forEach((t) => (st.adj[q][t] = { v: 0, why: "" })); });

    const rateOf = (d) => {
      const col = d.q === Q[0] ? "current_quarter" : "next_quarter";
      const typed = data.rates.find((r) => r.type === d.type && r.forecast_category === d.cat && (r.stage === d.stage || /^any$/i.test(r.stage)));
      const gen = data.rates.find((r) => /^all$/i.test(r.type) && r.forecast_category === d.cat && r.stage === d.stage);
      const r = typed || gen; return r ? num(r[col]) : 0;
    };
    const bucket = (attr, v) => data.quality.find((r) => r.attribute === attr && v >= num(r.from) && v <= num(r.to));
    const qualOf = (d) => { const a = bucket("days_in_stage", d.age), p = bucket("close_date_pushes", d.pushes); return (a ? num(a.multiplier) : 1) * (p ? num(p.multiplier) : 1); };
    deals.forEach((d) => { if (!d.closed) { d.rate = rateOf(d); d.qual = qualOf(d); d.prob = Math.min(1, d.rate * d.qual); } });

    const callOf = (q, t) => data.calls.find((r) => r.quarter === q && r.type === t) || {};
    const aopOf = (q, t) => num((data.aop.find((r) => r.quarter === q && r.type === t) || {}).aop_k);
    const nyc = (q, t) => num(((S.not_yet_created_k || {})[q] || {})[t]);

    function compute(q) {
      const res = {};
      TYPES.forEach((t) => {
        const ds = deals.filter((d) => d.q === q && d.type === t);
        const closed = ds.filter((d) => d.closed).reduce((s, d) => s + d.amt, 0);
        const open = ds.filter((d) => !d.closed);
        const exp = open.reduce((s, d) => s + d.amt * d.prob, 0);
        const risk = open.filter((d) => d.note && st.keep[d.id]).reduce((s, d) => s + d.amt * d.prob * st.hair, 0);
        const c = callOf(q, t), a = st.adj[q][t];
        const stat = closed + exp + nyc(q, t);
        res[t] = { aop: aopOf(q, t), closed, openAmt: open.reduce((s, d) => s + d.amt, 0), commit: num(c.commit_k), upside: num(c.upside_k), stretch: num(c.stretch_k),
          note: c.manager_note || "", stat, risk, adj: a.v, fin: stat - risk + a.v, nyc: nyc(q, t) };
      });
      const tot = {}; ["aop", "closed", "openAmt", "commit", "upside", "stretch", "stat", "risk", "adj", "fin", "nyc"].forEach((k) => (tot[k] = TYPES.reduce((s, t) => s + res[t][k], 0)));
      return { res, tot };
    }

    panel.innerHTML = `
    <div class="panel-head"><div><h2>${esc(S.title)}</h2><p>${esc(S.description)}</p></div></div>
    <div class="explain">${(S.explainer || []).map((e) => `<div><b>${esc(e.name)}</b>${esc(e.text)}</div>`).join("")}</div>
    <div class="box">
      <div class="toolbar">
        <div><span class="lab">Quarter</span><span class="seg" data-o="qseg">${Q.map((q, i) => `<button data-q="${esc(q)}">${esc(q)}${i === 0 ? " (current)" : " (next)"}</button>`).join("")}</span></div>
        <div class="ctl" style="min-width:240px;flex:1;max-width:360px"><label for="b-hair">Haircut on AI-flagged deals <span class="num" data-o="hairv"></span></label><input type="range" id="b-hair" min="0" max="0.6" step="0.05" value="${st.hair}"></div>
        <span class="muted" style="font-size:13px">As of ${esc(S.as_of)} · ${esc(S.units)}</span>
      </div>
    </div>
    <div class="kpis" data-o="kpis"></div>
    <div class="grid2">
      <div class="box">
        <div class="box-head"><div class="left"><h3>Forecast views vs. AOP</h3></div><div class="legend"><span><i style="background:var(--fg);height:12px;width:2px"></i>AOP</span></div></div>
        <div data-o="chart"></div>
      </div>
      <div class="box">
        <div class="box-head"><div class="left"><h3>Forecast commentary draft</h3><span class="tag ai">LLM draft</span><span class="tag human">Finance review</span></div></div>
        <div class="narr" data-o="narr"></div>
      </div>
    </div>
    <div class="box">
      <div class="box-head"><div class="left"><h3>By booking type</h3></div><span class="muted" style="font-size:13px">${esc(S.units)}</span></div>
      <div class="tscroll"><table class="fin" data-o="types"></table></div>
    </div>
    <div class="grid2">
      <div class="box">
        <div class="box-head"><div class="left"><h3>AI deal-risk review</h3><span class="tag ai">LLM reads CRM notes and call transcripts</span><span class="tag human">Analyst decides</span></div></div>
        <p class="muted" style="font-size:13px;margin-bottom:10px">Flags the analyst keeps reduce the finance forecast by the haircut. Dismissed flags are ignored.</p>
        <div class="queue" data-o="risks"></div>
      </div>
      <div class="box">
        <div class="box-head"><div class="left"><h3>Finance adjustments</h3><span class="tag human">Analyst, with reason</span></div></div>
        <p class="muted" style="font-size:13px;margin-bottom:10px">Manual adjustments on top of the model, in $K. Each one needs a reason before the forecast can go to the CFO.</p>
        <div class="tscroll"><table class="fin" data-o="adj"></table></div>
        <div class="release" style="margin-top:14px"><span data-o="subMsg" style="font-size:14px"></span><button class="btn primary" data-o="subBtn">Submit for CFO review</button></div>
      </div>
    </div>
    <details class="box more">
      <summary>Show how the statistical forecast is built: win rates by stage and pipeline quality</summary>
      <div class="box-head"><div class="left"><h3>Pipeline quality</h3><span class="tag etl">Rules: historical win rates</span></div><span class="muted" style="font-size:13px">${esc(S.history_note || "")}</span></div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="tscroll"><table class="fin" data-o="matrix"></table></div>
        <h3>Quality adjustments: aging and slipped close dates</h3>
        <div class="tscroll"><table class="fin" data-o="qual"></table></div>
      </div>
    </details>
    <details class="box"><summary style="cursor:pointer;font-weight:650">All deals in this quarter</summary><div class="tscroll" style="margin-top:12px"><table class="fin" data-o="deals"></table></div></details>`;
    const o = (k) => panel.querySelector(`[data-o="${k}"]`);

    function chart(tot) {
      const bars = [["Sales commit", tot.commit, "var(--etl)"], ["Sales upside", tot.upside, "var(--etl)"], ["Sales stretch", tot.stretch, "var(--etl)"],
        ["Statistical", tot.stat, "var(--ai)"], ["Finance forecast", tot.fin, "var(--accent)"]];
      const W = 560, L = 128, R = 120, rowH = 34, T = 8, H = T + bars.length * rowH + 22;
      const max = Math.max(tot.aop, ...bars.map((b) => b[1])) * 1.05;
      const x = (v) => L + (W - L - R) * (v / max);
      let g = "";
      bars.forEach(([n, v, c], i) => {
        const y = T + i * rowH;
        g += `<text x="${L - 10}" y="${y + 19}" text-anchor="end" font-size="12.5" fill="var(--fg)" font-weight="${i === 4 ? 700 : 500}">${n}</text>`;
        g += `<rect x="${L}" y="${y + 6}" width="${Math.max(0, x(v) - L)}" height="18" rx="3" fill="${c}" fill-opacity="${i < 3 ? 0.35 + i * 0.2 : 1}"/>`;
        g += `<text x="${x(v) + 6}" y="${y + 19}" font-size="12" fill="var(--fg)" stroke="var(--surface)" stroke-width="4" paint-order="stroke" font-family="IBM Plex Mono, monospace">${FPA.fmtM(v)} · ${Math.round((v / tot.aop) * 100)}%</text>`;
      });
      g += `<line x1="${x(tot.aop)}" x2="${x(tot.aop)}" y1="${T}" y2="${H - 18}" stroke="var(--fg)" stroke-width="2" stroke-dasharray="4 3"/>`;
      g += `<text x="${x(tot.aop)}" y="${H - 4}" text-anchor="middle" font-size="11.5" fill="var(--muted)">AOP ${FPA.fmtM(tot.aop)}</text>`;
      o("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Forecast views compared with AOP">${g}</svg>`;
    }

    function render() {
      panel.querySelectorAll("[data-q]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.q === st.q));
      o("hairv").textContent = Math.round(st.hair * 100) + "%";
      const { res, tot } = compute(st.q);
      const isCur = st.q === Q[0];
      const remaining = Math.max(1, tot.aop - tot.closed);
      const flagged = deals.filter((d) => d.q === st.q && d.note && !d.closed);
      o("kpis").innerHTML = [
        [isCur ? "Closed to date" : "Closed to date", fmtK(tot.closed), ""],
        ["Open pipeline", fmtK(tot.openAmt), ""],
        ["Coverage of remaining AOP", (tot.openAmt / remaining).toFixed(1) + "x", tot.openAmt / remaining >= 3 ? "fav" : "unf"],
        ["Finance forecast vs. AOP", pct(tot.fin / tot.aop, 0), tot.fin >= tot.aop ? "fav" : "unf"],
        ["AI-flagged pipeline", fmtK(flagged.reduce((s, d) => s + d.amt, 0)) + ` (${flagged.length})`, ""],
      ].map(([l, v, c]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`).join("");
      chart(tot);

      const cols = [["aop", "AOP"], ["closed", "Closed"], ["commit", "Commit"], ["upside", "Upside"], ["stretch", "Stretch"], ["stat", "Statistical"], ["fin", "Finance"]];
      let h = `<thead><tr><th>Type</th>${cols.map(([, n]) => `<th class="r">${n}</th>`).join("")}<th class="r">Finance vs. AOP</th></tr></thead><tbody>`;
      const row = (n, r, cls) => `<tr class="${cls || ""}"><td class="lbl">${n}</td>${cols.map(([k]) => `<td class="r num"${k === "fin" ? ' style="font-weight:700"' : ""}>${Math.round(r[k]).toLocaleString()}</td>`).join("")}<td class="r num ${r.fin >= r.aop ? "fav" : "unf"}">${fmtSignK(r.fin - r.aop)}</td></tr>`;
      TYPES.forEach((t) => (h += row(esc(t), res[t])));
      h += row("Total", tot, "tot");
      o("types").innerHTML = h + "</tbody>";

      // AI risk review
      const rk = o("risks"); rk.innerHTML = flagged.length ? "" : '<p class="muted">No AI risk flags for this quarter.</p>';
      flagged.sort((a, b) => b.amt - a.amt).forEach((d) => {
        const keep = st.keep[d.id], hit = d.amt * d.prob * st.hair;
        const el = document.createElement("div"); el.className = "deal" + (keep ? "" : " dismissed");
        el.innerHTML = `<div class="meta"><b>${esc(d.acct)}</b><span class="pill">${esc(d.type)}</span><span class="num">${fmtK(d.amt)}</span><span class="muted">${esc(d.stage)} · ${esc(d.cat)} · ${d.age}d in stage${d.pushes ? ` · ${d.pushes} push${d.pushes > 1 ? "es" : ""}` : ""}</span></div>
          <div class="actions" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="num ${keep ? "unf" : "muted"}" style="font-size:13px">${keep ? "−" + fmtK(hit) : "no impact"}</span><button class="btn">${keep ? "Dismiss flag" : "Restore flag"}</button></div>
          <p class="note"><span class="tag ai" style="margin-right:6px">AI flag</span>${esc(d.note)}</p>`;
        el.querySelector("button").onclick = () => { st.keep[d.id] = !keep; st.submitted[st.q] = false; render(); };
        rk.appendChild(el);
      });

      // adjustments
      const A = st.adj[st.q], sub = st.submitted[st.q];
      o("adj").innerHTML = `<thead><tr><th>Type</th><th class="r">Adjustment ($K)</th><th>Reason</th></tr></thead><tbody>${TYPES.map((t) =>
        `<tr><td>${esc(t)}</td><td class="r"><input class="num-in" type="number" step="50" id="b-adj-${esc(t)}" data-t="${esc(t)}" value="${A[t].v}" ${sub ? "disabled" : ""} aria-label="${esc(t)} adjustment"></td><td><input class="txt-in" type="text" id="b-why-${esc(t)}" data-w="${esc(t)}" value="${esc(A[t].why)}" placeholder="${A[t].v ? "Required" : "Optional"}" ${sub ? "disabled" : ""} aria-label="${esc(t)} reason"></td></tr>`).join("")}</tbody>`;
      o("adj").querySelectorAll("[data-t]").forEach((i) => i.addEventListener("change", (e) => { A[e.target.dataset.t].v = num(e.target.value); render(); }));
      o("adj").querySelectorAll("[data-w]").forEach((i) => i.addEventListener("input", (e) => { A[e.target.dataset.w].why = e.target.value; updateSubmit(); }));
      updateSubmit();
      narrative(res, tot, flagged);
      tables();
    }

    function updateSubmit() {
      const A = st.adj[st.q], sub = st.submitted[st.q];
      const missing = TYPES.filter((t) => A[t].v && !A[t].why.trim());
      const btn = o("subBtn");
      if (sub) { o("subMsg").innerHTML = '<span class="pill ok">Submitted for CFO review</span> Adjustments and flag decisions are logged with this version.'; btn.textContent = "Reopen"; btn.disabled = false; btn.onclick = () => { st.submitted[st.q] = false; render(); }; return; }
      btn.textContent = "Submit for CFO review";
      btn.disabled = missing.length > 0;
      o("subMsg").innerHTML = missing.length ? `Add a reason for: <b>${missing.map(esc).join(", ")}</b>.` : "Ready to submit.";
      btn.onclick = () => { st.submitted[st.q] = true; render(); };
    }

    function narrative(res, tot, flagged) {
      const q = st.q, gap = tot.fin - tot.aop;
      const worst = TYPES.map((t) => [t, res[t].fin - res[t].aop]).sort((a, b) => a[1] - b[1])[0];
      const best = TYPES.map((t) => [t, res[t].fin - res[t].aop]).sort((a, b) => b[1] - a[1])[0];
      const kept = flagged.filter((d) => st.keep[d.id]);
      const ps = [];
      ps.push(`<p><b>${esc(q)} finance forecast: ${FPA.fmtM(tot.fin)}</b>, ${pct(tot.fin / tot.aop, 0)} of AOP (${gap >= 0 ? "+" : "−"}${FPA.fmtM(Math.abs(gap))}). That sits ${tot.fin < tot.commit ? "below sales commit" : tot.fin < tot.upside ? "between sales commit and upside" : "above sales upside"} (${FPA.fmtM(tot.commit)} to ${FPA.fmtM(tot.upside)}); the statistical view from pipeline history is ${FPA.fmtM(tot.stat)}.</p>`);
      ps.push(`<p><b>Where the gap is.</b> ${esc(worst[0])} is the largest shortfall to plan (${fmtSignK(worst[1])}); ${esc(best[0])} is ${best[1] >= 0 ? "ahead" : "closest to plan"} (${fmtSignK(best[1])}).${q === Q[1] ? ` About ${FPA.fmtM(tot.nyc)} assumes bookings from pipeline not yet created, based on the 8-quarter average.` : ""}</p>`);
      ps.push(`<p><b>Deal risk.</b> ${kept.length} of ${flagged.length} AI-flagged deals kept, reducing the forecast by ${FPA.fmtM(tot.risk, 2)} at a ${Math.round(st.hair * 100)}% haircut.${kept[0] ? ` Largest: ${esc(kept.sort((a, b) => b.amt - a.amt)[0].acct)} (${fmtK(kept[0].amt)}).` : ""}</p>`);
      if (tot.adj) ps.push(`<p class="over" style="font-size:13px">Includes ${fmtSignK(tot.adj)} of analyst adjustments.</p>`);
      o("narr").innerHTML = ps.join("");
    }

    function tables() {
      const qd = deals.filter((d) => d.q === st.q && !d.closed);
      const grp = (d) => d.type === "Renewal" ? ["Renewal · " + d.cat, "Any stage"] : [d.cat, d.stage];
      const cats = [...new Set(["Commit", "Best Case", "Pipeline", ...qd.map((d) => grp(d)[0])])], stages = [...new Set(qd.map((d) => grp(d)[1]))].sort();
      let h = `<thead><tr><th>Forecast category</th><th>Stage</th><th class="r">Deals</th><th class="r">Pipeline $K</th><th class="r">Hist. win rate</th><th class="r">Quality adj.</th><th class="r">Expected $K</th></tr></thead><tbody>`;
      cats.forEach((c) => stages.forEach((s) => {
        const g = qd.filter((d) => grp(d)[0] === c && grp(d)[1] === s); if (!g.length) return;
        const amt = g.reduce((a, d) => a + d.amt, 0), ex = g.reduce((a, d) => a + d.amt * d.prob, 0);
        const wr = g.reduce((a, d) => a + d.amt * d.rate, 0) / amt;
        h += `<tr><td>${esc(c)}</td><td>${esc(s)}</td><td class="r num">${g.length}</td><td class="r num">${Math.round(amt).toLocaleString()}</td><td class="r num">${pct(wr, 0)}</td><td class="r num">${(ex / (amt * wr || 1)).toFixed(2)}x</td><td class="r num">${Math.round(ex).toLocaleString()}</td></tr>`;
      }));
      o("matrix").innerHTML = h + "</tbody>";
      let q2 = `<thead><tr><th>Pipeline attribute</th><th class="r">Deals</th><th class="r">$K</th><th class="r">Multiplier</th></tr></thead><tbody>`;
      data.quality.forEach((b) => {
        const g = qd.filter((d) => { const v = b.attribute === "days_in_stage" ? d.age : d.pushes; return v >= num(b.from) && v <= num(b.to); });
        q2 += `<tr><td>${esc(b.attribute === "days_in_stage" ? "Days in stage: " : "Close date: ")}${esc(b.bucket)}</td><td class="r num">${g.length}</td><td class="r num">${Math.round(g.reduce((a, d) => a + d.amt, 0)).toLocaleString()}</td><td class="r num">${num(b.multiplier).toFixed(2)}x</td></tr>`;
      });
      o("qual").innerHTML = q2 + "</tbody>";
      const all = deals.filter((d) => d.q === st.q).sort((a, b) => (a.closed - b.closed) || b.amt - a.amt);
      o("deals").innerHTML = `<thead><tr><th>Deal</th><th>Partner</th><th>Type</th><th>Region</th><th>Stage</th><th>Category</th><th class="r">$K</th><th class="r">Days in stage</th><th class="r">Pushes</th><th>Source</th><th class="r">Probability</th></tr></thead><tbody>${all.map((d) =>
        `<tr><td class="num">${esc(d.id)}</td><td>${esc(d.acct)}${d.note ? ' <span class="tag ai">flag</span>' : ""}</td><td>${esc(d.type)}</td><td>${esc(d.region)}</td><td>${esc(d.stage)}</td><td>${esc(d.cat)}</td><td class="r num">${d.amt.toLocaleString()}</td><td class="r num">${d.closed ? "—" : d.age}</td><td class="r num">${d.closed ? "—" : d.pushes}</td><td>${esc(d.src)}</td><td class="r num">${d.closed ? "100%" : pct(d.prob, 0)}</td></tr>`).join("")}</tbody>`;
    }

    panel.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { st.q = b.dataset.q; render(); }));
    panel.querySelector("#b-hair").addEventListener("input", (e) => { st.hair = +e.target.value; render(); });
    render();
  },
});
