/* Variance commentary workflow.
   Data: data.csv (one row per GL line, with the LLM's draft commentary) and settings.json (title, thresholds).
   To refresh: replace data.csv with a new month's lines and commentary; keep the same column names. */
FPA.register("variance", {
  render(panel, data) {
    const { esc, num, fmtSignK } = FPA;
    const S = data.settings;
    const revSecs = S.revenue_sections || ["Revenue"];
    const V = data.lines.map((r) => {
      const b = num(r.budget_k), a = num(r.actual_k), v = a - b;
      return { id: r.line_id, sec: r.section, bu: r.business_unit, gl: r.gl_line, b, a, v, p: b ? (v / b) * 100 : 0,
        fav: revSecs.includes(r.section) ? v > 0 : v < 0, cat: r.driver, inv: /^y/i.test(r.needs_investigation),
        txt: r.ai_commentary, status: "draft", edited: false };
    });
    const sections = [...new Set(V.map((r) => r.sec))];
    const st = { d: S.dollar_threshold_k || 50, p: S.percent_threshold || 10, sec: "" };
    const isFlag = (r) => Math.abs(r.v) >= st.d || Math.abs(r.p) >= st.p;
    const maxAbs = Math.max(...V.map((r) => Math.abs(r.v)), 1);

    panel.innerHTML = `
    <div class="panel-head"><div><h2>${esc(S.title)}</h2><p>${esc(S.description)}</p></div></div>
    <div class="box">
      <div class="box-head"><div class="left"><h3>Materiality rule</h3><span class="tag etl">Rules</span></div><span class="muted" style="font-size:13px">Flag if over the dollar <b>or</b> the percent threshold</span></div>
      <div class="controls">
        <div class="ctl"><label for="v-thrD">Dollar threshold <span class="num" data-o="thrD"></span></label><input type="range" id="v-thrD" min="25" max="150" step="5" value="${st.d}"></div>
        <div class="ctl"><label for="v-thrP">Percent threshold <span class="num" data-o="thrP"></span></label><input type="range" id="v-thrP" min="5" max="25" step="1" value="${st.p}"></div>
        <div class="ctl"><label for="v-sec">P&amp;L section</label><select id="v-sec"><option value="">All sections</option>${sections.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
      </div>
    </div>
    <div class="kpis" data-o="kpis"></div>
    <div class="box">
      <div class="box-head"><div class="left"><h3>Variance register</h3><span class="tag etl">Power Query</span><span class="tag ai">LLM classification</span></div><span class="muted" style="font-size:13px">${esc(S.units || "$K")} · favorable in green</span></div>
      <div class="tscroll"><table data-o="table"></table></div>
    </div>
    <div class="box">
      <div class="box-head"><div class="left"><h3>Commentary review queue</h3><span class="tag ai">LLM draft</span><span class="tag human">Analyst approval</span></div></div>
      <div class="queue" data-o="queue"></div>
      <div class="release" style="margin-top:14px">
        <span data-o="relMsg" style="font-size:14px"></span>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="toast" data-o="relToast" hidden>Released to leadership dashboard (demo)</span><button class="btn primary" data-o="relBtn">Release management pack</button></div>
      </div>
    </div>`;
    const o = (k) => panel.querySelector(`[data-o="${k}"]`);
    const pctTxt = (r) => (r.p > 0 ? "+" : "") + r.p.toFixed(1) + "%";

    function render() {
      o("thrD").textContent = "$" + st.d + "K"; o("thrP").textContent = st.p + "%";
      const rows = V.filter((r) => !st.sec || r.sec === st.sec).sort((x, y) => (isFlag(y) - isFlag(x)) || Math.abs(y.v) - Math.abs(x.v));
      let h = '<thead><tr><th>Section</th><th>Business unit</th><th>GL line</th><th class="r">Budget</th><th class="r">Actual</th><th class="r">Var $</th><th class="r">Var %</th><th>Variance</th><th>Driver</th><th>Status</th></tr></thead><tbody>';
      rows.forEach((r) => {
        const f = isFlag(r), cls = r.fav ? "fav" : "unf", w = (Math.abs(r.v) / maxAbs) * 50;
        const bar = `<span class="bar" aria-hidden="true"><i style="background:var(--${r.fav ? "good" : "bad"});${r.v >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`}"></i></span>`;
        const s = !f ? '<span class="pill">Below threshold</span>' : r.status === "approved" ? '<span class="pill ok">Approved</span>' : r.inv ? '<span class="pill inv">Investigate</span>' : '<span class="pill flag">Flagged</span>';
        h += `<tr class="${f ? "" : "dim"}"><td>${esc(r.sec)}</td><td>${esc(r.bu)}</td><td>${esc(r.gl)}</td><td class="r num">${r.b.toLocaleString()}</td><td class="r num">${r.a.toLocaleString()}</td><td class="r num ${cls}">${fmtSignK(r.v).replace("$", "").replace("K", "")}</td><td class="r num ${cls}">${pctTxt(r)}</td><td>${bar}</td><td>${f ? esc(r.cat) : "—"}</td><td>${s}</td></tr>`;
      });
      o("table").innerHTML = h + "</tbody>";

      const all = V.filter(isFlag), fl = all.filter((r) => !st.sec || r.sec === st.sec);
      const revNet = all.filter((r) => revSecs.includes(r.sec)).reduce((s, r) => s + r.v, 0);
      const costNet = all.filter((r) => !revSecs.includes(r.sec)).reduce((s, r) => s + r.v, 0);
      const appr = all.filter((r) => r.status === "approved").length;
      o("kpis").innerHTML = [["Lines reviewed", V.length, ""], ["Flagged as material", all.length, ""],
        ["Flagged revenue, net", fmtSignK(revNet), revNet >= 0 ? "fav" : "unf"], ["Flagged cost, net", fmtSignK(costNet), costNet <= 0 ? "fav" : "unf"],
        ["Approved", appr + " of " + all.length, appr === all.length && all.length ? "fav" : ""]]
        .map(([l, v, c]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${c}">${v}</div></div>`).join("");

      const q = o("queue");
      q.innerHTML = fl.length ? "" : '<p class="muted">No lines meet the threshold in this section.</p>';
      fl.forEach((r) => {
        const d = document.createElement("div");
        d.className = "qitem" + (r.status === "approved" ? " approved" : "");
        const badges = [`<span class="pill">${esc(r.cat)}</span>`];
        if (r.inv) badges.push('<span class="pill inv">Needs investigation</span>');
        if (r.edited) badges.push('<span class="over">Edited by analyst</span>');
        d.innerHTML = `<div class="meta"><b>${esc(r.bu)} · ${esc(r.gl)}</b><span class="num ${r.fav ? "fav" : "unf"}">${fmtSignK(r.v)} (${pctTxt(r)})</span>${badges.join("")}</div><div class="actions"></div><p class="text">${esc(r.txt)}</p>`;
        const act = d.querySelector(".actions");
        if (r.status === "approved") {
          act.innerHTML = '<span class="pill ok">Approved by analyst</span>';
          const u = document.createElement("button"); u.className = "btn"; u.textContent = "Reopen";
          u.onclick = () => { r.status = "draft"; render(); }; act.appendChild(u);
        } else {
          const e = document.createElement("button"); e.className = "btn"; e.textContent = "Edit";
          const ap = document.createElement("button"); ap.className = "btn primary"; ap.textContent = "Approve";
          ap.onclick = () => { r.status = "approved"; render(); };
          e.onclick = () => {
            const p = d.querySelector(".text"), ta = document.createElement("textarea");
            ta.id = "v-ta-" + r.id; ta.value = r.txt; ta.setAttribute("aria-label", "Edit commentary"); p.replaceWith(ta); ta.focus();
            e.textContent = "Save"; e.onclick = () => { const nv = ta.value.trim(); if (nv && nv !== r.txt) { r.txt = nv; r.edited = true; } render(); };
          };
          act.append(e, ap);
        }
        q.appendChild(d);
      });
      const left = all.length - appr;
      o("relBtn").disabled = left > 0;
      o("relMsg").innerHTML = left > 0 ? `<b>${left}</b> flagged item${left === 1 ? "" : "s"} still need approval before the pack can be released.` : `All ${all.length} flagged items approved. The pack can be released.`;
      if (left > 0) o("relToast").hidden = true;
    }
    panel.querySelector("#v-thrD").addEventListener("input", (e) => { st.d = +e.target.value; render(); });
    panel.querySelector("#v-thrP").addEventListener("input", (e) => { st.p = +e.target.value; render(); });
    panel.querySelector("#v-sec").addEventListener("change", (e) => { st.sec = e.target.value; render(); });
    o("relBtn").addEventListener("click", () => (o("relToast").hidden = false));
    render();
  },
});
