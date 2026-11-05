/* Controls tab. All text is in content.json. */
FPA.register("controls", {
  render(panel, data) {
    const { esc } = FPA, C = data.content;
    panel.innerHTML = `
      <div class="panel-head"><div><h2>${esc(C.title)}</h2><p>${esc(C.intro)}</p></div></div>
      <div class="gov">${C.cards.map((c) => `<div class="box"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`).join("")}</div>
      <div class="box">
        <div class="box-head"><div class="left"><h3>What is AI here, and what is not</h3></div></div>
        <div class="tscroll"><table class="whatis"><thead><tr><th>Tool</th><th>Type</th><th>Job in these workflows</th></tr></thead><tbody>
        ${C.whatis.map((w) => `<tr><td><b>${esc(w.tool)}</b></td><td><span class="tag ${esc(w.type)}">${esc(w.type_label)}</span></td><td>${esc(w.job)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>`;
  },
});
