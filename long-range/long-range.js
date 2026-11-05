/* Long-range plan workflow: page and charts. The calculations are in model.js. */
FPA.register("long-range", {
  render(panel, data) {
    const { esc, pct } = FPA;
    const S = data.settings, M = window.LongRangeModel, Y = M.YEARS;
    const inp = M.prepare(data);
    const st = { sc: S.scenarios[0].key, uk: true };
    const ref = M.run(inp, { scenario: S.reference.scenario, uk: S.reference.uk, upliftAddsARR: S.nrr_uplift_adds_arr !== false }).rows;
    const m = (k, d = 1) => (k < 0 ? "−" : "") + "$" + (Math.abs(k) / 1000).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) + "M";
    const label = { grr: "pct", nrr: "pct", volume_growth: "pct", ps_pct: "pct", subs_gm: "pct", volume_gm: "pct", ps_gm: "pct", rnd_pct: "pct", ga_pct: "pct", dso: "days", dpo: "days" };

    panel.innerHTML = `
    <div class="panel-head"><div><h2>${esc(S.title)}</h2><p>${esc(S.description)}</p></div></div>
    <div class="box"><div class="toolbar">
      <div><span class="lab">Scenario</span><span class="seg">${S.scenarios.map((s) => `<button data-sc="${esc(s.key)}">${esc(s.name)}</button>`).join("")}</span></div>
      <label class="switch" for="lr-uk"><input type="checkbox" id="lr-uk" checked>${esc(S.expansion_label)}</label>
      <span class="muted" style="font-size:13px;flex:1;min-width:220px">${esc(S.expansion_note)}</span>
    </div></div>
    <div class="kpis" data-o="kpis"></div>
    <p class="muted" style="font-size:12.5px;margin-top:-10px">FY30 figures. Change shown vs. ${esc(S.reference.label)}.</p>
    <div class="grid2 wl">
      <div class="box">
        <div class="box-head"><div class="left"><h3>Ending ARR by source</h3><span class="tag etl">Model</span></div>
          <div class="legend"><span><i class="sq" style="background:var(--accent)"></i>US software</span><span><i class="sq" style="background:var(--ai)"></i>UK software</span><span><i class="sq" style="background:var(--etl)"></i>Volume-based</span></div></div>
        <div data-o="chart"></div>
      </div>
      <div class="box">
        <div class="box-head"><div class="left"><h3>Plan summary draft</h3><span class="tag ai">LLM draft</span><span class="tag human">FP&amp;A review</span></div></div>
        <div class="narr" data-o="narr"></div>
      </div>
    </div>
    <div class="box">
      <div class="box-head"><div class="left"><h3>P&amp;L summary</h3></div><span class="muted" style="font-size:13px">${esc(S.units_note)}</span></div>
      <div class="tscroll"><table class="fin" data-o="pl"></table></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:20px">
      <div class="box"><div class="box-head"><div class="left"><h3>ARR bridge and SaaS metrics</h3></div></div><div class="tscroll"><table class="fin" data-o="saas"></table></div></div>
      <div class="box"><div class="box-head"><div class="left"><h3>Cash flow</h3></div></div><div class="tscroll"><table class="fin" data-o="cf"></table></div>
        <p class="muted" style="font-size:12.5px;margin-top:8px">Interest on the existing term debt; no repayment or new financing assumed, as in the workbook.</p></div>
    </div>
    <div class="box">
      <div class="box-head"><div class="left"><h3>Model checks</h3><span class="tag etl">Rules</span></div></div>
      <div class="checks" data-o="checks"></div>
    </div>
    <details class="box more">
      <summary>Show assumptions and the UK sales team</summary>
      <div class="box-head"><div class="left"><h3>Assumptions</h3><span class="tag human">Set by FP&amp;A</span></div><span class="muted" style="font-size:13px">From assumptions.csv</span></div>
      <div class="tscroll"><table class="fin" data-o="assm"></table></div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">${esc(S.sm_note)} Values marked <span class="chg">▲▼</span> differ from Base.</p>
      <div data-o="ukcap" style="margin-top:14px"></div>
    </details>`;
    const o = (k) => panel.querySelector(`[data-o="${k}"]`);

    function chart(r) {
      const W = 600, H = 270, L = 48, R = 10, T = 16, B = 28;
      const tot = r.total_arr, max = Math.ceil(Math.max(...tot) / 1000 / 100) * 100 * 1000;
      const bw = (W - L - R) / Y.length * 0.56;
      const x = (i) => L + (W - L - R) * (i + 0.5) / Y.length, y = (v) => T + (H - T - B) * (1 - v / max);
      let g = "";
      for (let k = 0; k <= 4; k++) { const v = (max / 4) * k; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="IBM Plex Mono, monospace">${Math.round(v / 1000)}</text>`; }
      Y.forEach((yr, i) => {
        const parts = [[r.us_arr[i], "var(--accent)"], [r.uk_arr[i], "var(--ai)"], [r.volume_arr[i], "var(--etl)"]];
        let acc = 0;
        parts.forEach(([v, c]) => { if (v <= 0) return; g += `<rect x="${x(i) - bw / 2}" y="${y(acc + v)}" width="${bw}" height="${y(acc) - y(acc + v)}" fill="${c}"/>`; acc += v; });
        g += `<text x="${x(i)}" y="${y(acc) - 6}" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--fg)" font-family="IBM Plex Mono, monospace">${Math.round(acc / 1000)}</text>`;
        g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${yr}</text>`;
      });
      o("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Ending ARR by year, $M">${g}</svg>`;
    }

    const tbl = (rows, r) => `<thead><tr><th></th>${Y.map((y) => `<th class="r">${y}</th>`).join("")}</tr></thead><tbody>${rows.map(([n, k, f, cls]) =>
      `<tr class="${cls || ""}"><td class="lbl">${n}</td>${r[k].map((v) => `<td class="r num">${f(v)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    const P = (v) => pct(v, 1), X = (v) => v.toFixed(2) + "x", MO = (v) => v.toFixed(1);

    function render() {
      panel.querySelectorAll("[data-sc]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sc === st.sc));
      const r = M.run(inp, { scenario: st.sc, uk: st.uk, upliftAddsARR: S.nrr_uplift_adds_arr !== false }).rows, i = 4;
      const kp = [["Ending ARR", m(r.total_arr[i]), r.total_arr[i] - ref.total_arr[i], (d) => m(d)],
        ["Revenue", m(r.revenue[i]), r.revenue[i] - ref.revenue[i], (d) => m(d)],
        ["EBITDA margin", pct(r.ebitda_margin[i]), r.ebitda_margin[i] - ref.ebitda_margin[i], (d) => (d * 100).toFixed(1) + " pts"],
        ["Rule of 40", pct(r.rule40[i]), r.rule40[i] - ref.rule40[i], (d) => (d * 100).toFixed(1) + " pts"],
        ["Ending cash", m(r.cash[i]), r.cash[i] - ref.cash[i], (d) => m(d)]];
      o("kpis").innerHTML = kp.map(([l, v, d, f]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="num ${Math.abs(d) < 1e-6 ? "muted" : d > 0 ? "fav" : "unf"}" style="font-size:12px">${Math.abs(d) < 1e-6 ? "no change" : (d > 0 ? "+" : "−") + f(Math.abs(d))}</div></div>`).join("");
      chart(r);
      o("pl").innerHTML = tbl([
        ["Subscription revenue", "subs_rev", m, "sub"], ["Volume-based revenue", "volume_rev", m, "sub"], ["Professional services", "ps_rev", m, "sub"],
        ["Total revenue", "revenue", m, "tot"], ["Growth", "rev_growth", P, "sub"],
        ["Gross profit", "gross_profit", m], ["Gross margin", "gm", P, "sub"],
        ["S&M", "sm", m], ["of which UK", "sm_uk", m, "sub"], ["R&D", "rnd", m], ["G&A", "ga", m],
        ["EBITDA", "ebitda", m, "tot"], ["EBITDA margin", "ebitda_margin", P, "sub"]], r);
      o("saas").innerHTML = tbl([
        ["Beginning software ARR", "begin_sw_arr", m], ["New", "new_arr", m, "sub"], ["Expansion", "expansion_arr", m, "sub"], ["Churn", "churn_arr", m, "sub"],
        ["Ending software ARR", "end_sw_arr", m], ["Volume-based ARR", "volume_arr", m], ["Total ARR", "total_arr", m, "tot"],
        ["ARR growth", "arr_growth", P], ["Net retention (NRR)", "nrr", P], ["Gross retention (GRR)", "grr", P], ["Rule of 40", "rule40", P],
        ["Magic number", "magic", X], ["LTV / CAC", "ltv_cac", X], ["CAC payback (months)", "payback", MO]], r);
      o("cf").innerHTML = tbl([
        ["EBITDA", "ebitda", m], ["Cash interest", "interest", m, "sub"], ["Taxes and other", "tax_other", m, "sub"], ["Working capital and other", "nwc", m, "sub"],
        ["Operating cash flow", "cfo", m, "tot"], ["Capex", "capex", m, "sub"], ["Free cash flow", "fcf", m, "tot"], ["Ending cash", "cash", m]], r);

      // assumptions
      const A = inp.assumptions[st.sc], B = inp.assumptions.base;
      const fmtA = (k, v) => label[k] === "days" ? v.toFixed(1) : pct(v, 1);
      o("assm").innerHTML = `<thead><tr><th>${esc(S.scenarios.find((s) => s.key === st.sc).name)} assumption</th>${Y.map((y) => `<th class="r">${y}</th>`).join("")}</tr></thead><tbody>${data.assumptions.filter((x) => x.scenario.toLowerCase() === st.sc).map((row) =>
        `<tr><td class="lbl">${esc(row.assumption)}</td>${A[row.key].map((v, j) => { const d = v - B[row.key][j]; return `<td class="r num">${fmtA(row.key, v)}${Math.abs(d) > 1e-9 ? `<span class="chg">${d > 0 ? "▲" : "▼"}</span>` : ""}</td>`; }).join("")}</tr>`).join("")}</tbody>`;
      const U = inp.capacityUK;
      o("ukcap").innerHTML = st.uk ? `<h3 style="margin-bottom:8px">UK sales team (from sales-capacity-uk.csv)</h3><div class="tscroll"><table class="fin"><thead><tr><th></th>${Y.map((y) => `<th class="r">${y}</th>`).join("")}</tr></thead><tbody>${data.capacityUK.map((row) =>
        `<tr><td class="lbl">${esc(row.item)}</td>${U[row.key].map((v) => `<td class="r num">${row.key === "quota_attainment" ? pct(v, 0) : v}</td>`).join("")}</tr>`).join("")}<tr><td class="lbl">UK ending ARR</td>${r.uk_arr.map((v) => `<td class="r num">${m(v)}</td>`).join("")}</tr></tbody></table></div>` : `<p class="muted" style="font-size:13px">UK expansion is off: no UK headcount, ARR or S&amp;M cost.</p>`;

      // checks
      const negNew = Y.filter((_, j) => r.new_arr[j] < 0), lowCash = Y.filter((_, j) => r.cash[j] < 0), lowLtv = Y.filter((_, j) => r.ltv_cac[j] < 3);
      const ck = [
        ["ok", "Ties to the Excel model", S.tie_out],
        ...(st.sc !== "base" && S.nrr_uplift_adds_arr !== false ? [["ok", "Upside retention logic", S.upside_note]] : []),
        [negNew.length ? "warn" : "ok", "New ARR stays positive", negNew.length ? `New ARR is negative in ${negNew.join(", ")}. In this model, sales capacity caps new plus expansion ARR, so a higher NRR shifts ARR from new to expansion instead of adding to it.` : "New ARR is positive in every year."],
        [lowCash.length ? "warn" : "ok", "Cash stays positive", lowCash.length ? `Ending cash is negative in ${lowCash.join(", ")}.` : `Lowest ending cash: ${m(Math.min(...r.cash))} (${Y[r.cash.indexOf(Math.min(...r.cash))]}).`],
        [lowLtv.length ? "warn" : "ok", "LTV / CAC at least 3x", lowLtv.length ? `Below 3x in ${lowLtv.join(", ")}.` : "At or above 3x in every year."],
      ];
      o("checks").innerHTML = ck.map(([c, t, d]) => `<div class="check ${c}"><span class="dot" aria-hidden="true">${c === "ok" ? "✓" : "!"}</span><div><b>${esc(t)}</b><div class="muted" style="font-size:13px">${esc(d)}</div></div></div>`).join("");

      // narrative
      const scName = S.scenarios.find((s) => s.key === st.sc).name;
      const cagr = Math.pow(r.total_arr[4] / r.total_arr[0], 1 / 4) - 1;
      const ukShare = r.uk_arr[4] / r.total_arr[4];
      const ps = [
        `<p><b>${esc(scName)}${st.uk ? " with UK expansion" : " without UK expansion"}.</b> ARR grows from ${m(r.total_arr[0])} in FY26 to ${m(r.total_arr[4])} in FY30 (${pct(cagr)} a year). Revenue reaches ${m(r.revenue[4])} with EBITDA margin expanding from ${pct(r.ebitda_margin[0])} to ${pct(r.ebitda_margin[4])}, as S&amp;M falls from ${pct(r.sm[0] / r.revenue[0], 0)} to ${pct(r.sm[4] / r.revenue[4], 0)} of revenue.</p>`,
        st.uk ? `<p><b>UK expansion</b> contributes ${m(r.uk_arr[4])} of FY30 ARR (${pct(ukShare)}) for ${m(r.sm_uk.reduce((a, b) => a + b, 0))} of cumulative S&amp;M over five years. UK ARR at gross margin first covers the UK team's annual S&amp;M cost in ${(() => { const j = r.uk_arr.findIndex((v, k) => v * (r.gm[k]) > r.sm_uk[k]); return j < 0 ? "no year of the plan" : Y[j]; })()}.</p>`
          : `<p><b>Without UK expansion</b>, FY30 ARR is ${m(r.total_arr[4])} and cumulative EBITDA over five years is ${m(r.ebitda.reduce((a, b) => a + b, 0))}.</p>`,
        `<p><b>Cash.</b> Free cash flow turns positive in ${Y[r.fcf.findIndex((v) => v > 0)] || "no year of the plan"}; ending cash reaches ${m(r.cash[4])} by FY30 with term debt unchanged. Lowest year-end cash is ${m(Math.min(...r.cash))} (${Y[r.cash.indexOf(Math.min(...r.cash))]}).</p>`,
      ];
      if (r.new_arr.some((v) => v < 0)) ps.push(`<p class="over" style="font-size:13px">Review before use: new ARR turns negative in this scenario (see model checks).</p>`);
      o("narr").innerHTML = ps.join("");
    }
    panel.querySelectorAll("[data-sc]").forEach((b) => b.addEventListener("click", () => { st.sc = b.dataset.sc; render(); }));
    panel.querySelector("#lr-uk").addEventListener("change", (e) => { st.uk = e.target.checked; render(); });
    render();
  },
});
