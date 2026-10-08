/* Long-range plan model.
   Mirrors the annual logic of CaseStudy_BAv10.xlsx (FY26–FY30):
   - Software ARR from a sales-capacity build (US always; UK only when geographic expansion is on)
   - Volume ARR, subscription / volume / PS revenue, COGS, opex, EBITDA
   - Working capital, capex and cash flow
   Inputs come from the files in this folder; nothing here needs editing for a new set of assumptions.
   Works in the browser (window.LongRangeModel) and in Node (module.exports) for tie-out tests. */
(function (root) {
  const YEARS = ["FY26", "FY27", "FY28", "FY29", "FY30"];
  const ceil = Math.ceil, floor = Math.floor;

  function run(inp, opt) {
    const sc = opt.scenario || "base", withUK = !!opt.uk;
    const A = inp.assumptions[sc];               // {key: [5 values]}
    // Sales capacity covers new ARR plus expansion at the base-case retention rates.
    // With opt.upliftAddsARR (default), retention above base adds expansion ARR on top of capacity.
    // Set it to false to follow the source workbook, where capacity caps new + expansion in every scenario.
    const Cap = opt.upliftAddsARR === false ? A : (inp.assumptions.base || A);
    const O = inp.opening, P = inp.params;
    const usCap = inp.capacityUS, ukCap = inp.capacityUK;
    const out = { years: YEARS, rows: {} };
    const R = (k) => (out.rows[k] = out.rows[k] || []);

    // ---------- US sales capacity ----------
    let usBeg = O.software_arr_us, sales = O.sales_hc_us, mkt = O.marketing_hc_us, prevAE = O.ae_hc_us;
    const usHires = [];
    const us = [];
    const quotaUS = P.us.quota.enterprise * P.us.ae_split.enterprise + P.us.quota.midmarket * P.us.ae_split.midmarket;
    YEARS.forEach((y, i) => {
      sales = i === 0 ? floor(sales * (1 + P.us.sales_hc_growth)) : sales * (1 + P.us.sales_hc_growth);
      const aeEnt = ceil(sales * P.us.ae_share_of_sales) * P.us.ae_split.enterprise;
      const aeMM = ceil(sales * P.us.ae_share_of_sales) * P.us.ae_split.midmarket;
      const ae = aeEnt + aeMM;
      const hires = ae - prevAE; usHires.push(hires); prevAE = ae;
      const ramped = O.ae_hc_us + usHires.reduce((s, h, j) => s + h * (j === i ? P.us.hire_year_ramp : 1), 0);
      const cs = ceil(usBeg / P.us.arr_per_csm);
      mkt = ceil(mkt * (1 + P.us.marketing_hc_growth));
      const support = sales - ae - cs;
      const att = usCap.quota_attainment[i];
      const capacity = ramped * quotaUS * att;
      const exp = usBeg * (A.nrr[i] - A.grr[i]);
      const capExp = usBeg * (Cap.nrr[i] - Cap.grr[i]);
      const cancels = -usBeg * (1 - A.grr[0]);
      const nw = capacity - capExp;
      const end = usBeg + nw + exp + cancels;
      const comp = ramped * P.us.ae_split.enterprise * P.us.ote.enterprise + ramped * P.us.ae_split.midmarket * P.us.ote.midmarket
        + support * P.us.ote.support + cs * P.us.ote.customer_success + mkt * P.us.ote.marketing;
      const noncomp = comp * P.us.non_labor_pct_of_comp;
      us.push({ beg: usBeg, nw, exp, cancels, end, comp, noncomp, total: comp + noncomp, hc: sales + mkt, ae, ramped });
      usBeg = end;
    });

    // ---------- UK sales capacity (geographic expansion) ----------
    const uk = [];
    let ukBeg = 0, ukPrevAE = 0; const ukHires = [];
    const quotaUK = P.uk.quota.enterprise * P.uk.ae_split.enterprise + P.uk.quota.midmarket * P.uk.ae_split.midmarket;
    YEARS.forEach((y, i) => {
      if (!withUK) { uk.push({ beg: 0, nw: 0, exp: 0, cancels: 0, end: 0, comp: 0, noncomp: 0, total: 0, hc: 0, ae: 0, ramped: 0 }); return; }
      const ae = ukCap.ae_enterprise[i] + ukCap.ae_midmarket[i];
      const hires = ae - ukPrevAE; ukHires.push(hires); ukPrevAE = ae;
      const ramped = ukHires.reduce((s, h, j) => s + h * (j === i ? P.uk.hire_year_ramp : 1), 0);
      const sdr = ceil(ae * P.uk.sdr_per_ae), se = ceil(ae * P.uk.se_per_ae);
      const cs = i === 0 ? 0 : ceil(ukBeg / P.uk.arr_per_csm);
      const att = ukCap.quota_attainment[i];
      const capacity = ramped * quotaUK * att;
      const exp = i === 0 ? capacity * (1 - att) : ukBeg * (A.nrr[i] - A.grr[i]);
      const capExp = i === 0 ? exp : ukBeg * (Cap.nrr[i] - Cap.grr[i]);
      const cancels = i === 0 ? 0 : -ukBeg * (1 - A.grr[i]);
      const nw = capacity - capExp;
      const end = ukBeg + nw + exp + cancels;
      const o = P.uk.ote;
      const comp = ukCap.rvp[i] * o.rvp + ae * P.uk.ae_split.enterprise * o.enterprise + ae * P.uk.ae_split.midmarket * o.midmarket
        + sdr * o.sdr + se * o.se + ukCap.channel[i] * o.channel + cs * o.customer_success + ukCap.marketing[i] * o.marketing;
      const noncomp = comp * P.uk.non_labor_pct_of_comp;
      uk.push({ beg: ukBeg, nw, exp, cancels, end, comp, noncomp, total: comp + noncomp,
        hc: ukCap.rvp[i] + ae + sdr + se + ukCap.channel[i] + cs + ukCap.marketing[i], ae, ramped });
      ukBeg = end;
    });

    // ---------- P&L ----------
    const cl = O.cogs_lines, ox = O.opex, bs = O.balance_sheet, ci = O.cash_items;
    const subsLines = Object.values(cl.subs).reduce((a, b) => a + b, 0);
    const supportCompShare = cl.subs.support_comp / subsLines;
    const psCompShare = cl.ps.comp / (cl.ps.comp + cl.ps.noncomp);
    const smNCshare = ox.sm_noncomp / ox.sm_total;
    const rdComp = ox.rnd_comp / ox.rnd_total, rdNC = ox.rnd_noncomp / ox.rnd_total;
    const gaComp = ox.ga_comp / ox.ga_total, gaNC = ox.ga_noncomp / ox.ga_total;

    let prevVol = O.volume_arr, prevRev = O.revenue, prevTotalARR = O.software_arr_us + O.volume_arr;
    let prevCostTotal = O.comp_cost_total + O.noncomp_cost_total, prevFuncComp = ox.functional_comp_total, prevPrevFuncComp = null, capex = 0;
    let b = { ar: bs.accounts_receivable, pre: bs.prepaid, oca: bs.other_current_assets, ap: bs.accounts_payable, dr: bs.deferred_revenue,
      ae: bs.accrued_expenses, apay: bs.accrued_payroll, ocl: bs.other_current_liabilities, lta: bs.other_lt_assets, ltl: bs.other_lt_liabilities, cash: bs.cash };
    const ltlDecay = (bs.other_lt_liabilities - bs.other_lt_liabilities_prior) / bs.other_lt_liabilities_prior;
    const ocaPct = bs.other_current_assets / O.revenue;
    let ltaPct = bs.other_lt_assets / O.revenue;

    YEARS.forEach((y, i) => {
      const U = us[i], K = uk[i];
      const begSW = U.beg + K.beg, endSW = U.end + K.end;
      const nw = U.nw + K.nw, ex = U.exp + K.exp, cn = U.cancels + K.cancels;
      const vol = prevVol * (1 + A.volume_growth[i]);
      const totalARR = endSW + vol;
      const subsRev = (begSW + endSW) / 2, volRev = (prevVol + vol) / 2, psRev = subsRev * A.ps_pct[i];
      const rev = subsRev + volRev + psRev;
      const subsCOGS = subsRev * (1 - A.subs_gm[i]), volCOGS = volRev * (1 - A.volume_gm[i]), psCOGS = psRev * (1 - A.ps_gm[i]);
      const cogs = subsCOGS + volCOGS + psCOGS, gp = rev - cogs;
      const smTotal = U.total + K.total, smComp = U.comp + K.comp;
      const smNoncomp = i === 0 ? U.noncomp + K.noncomp : smTotal * smNCshare;
      const rd = rev * A.rnd_pct[i], ga = rev * A.ga_pct[i];
      const opex = smTotal + rd + ga, ebitda = gp - opex;
      const funcComp = smComp + rd * rdComp + ga * gaComp;
      const supComp = subsCOGS * supportCompShare, psComp = psCOGS * psCompShare;
      const compCost = supComp + psComp + funcComp;
      const noncompCost = (subsCOGS - supComp) + (psCOGS - psComp) + volCOGS + smNoncomp + rd * rdNC + ga * gaNC;
      const costTotal = compCost + noncompCost;

      // ---------- cash flow ----------
      const interest = ci.interest_expense + ci.interest_income;
      const otherCash = ci.ops_fee + ci.other_expense + rev * ci.bad_debt_pct_rev;
      const tax = rev * ci.tax_pct_rev;
      const nb = {
        ar: rev / 365 * A.dso[i], pre: b.pre * costTotal / prevCostTotal, oca: rev * ocaPct,
        ap: noncompCost / 365 * A.dpo[i], dr: b.dr + (totalARR + rev) / 2 - rev,
        ae: noncompCost / 365 * ci.accrued_expense_days, apay: compCost / 365 * ci.accrued_payroll_days, ocl: rev * ci.other_current_liab_pct_rev,
      };
      ltaPct += ci.other_lt_assets_step; nb.lta = rev * ltaPct; nb.ltl = b.ltl * (1 + ltlDecay);
      const dNWC = -(nb.ar - b.ar) - (nb.pre - b.pre) - (nb.oca - b.oca) + (nb.ap - b.ap) + (nb.dr - b.dr) + (nb.ae - b.ae) + (nb.apay - b.apay) + (nb.ocl - b.ocl);
      const dOther = -(nb.lta - b.lta) + (nb.ltl - b.ltl);
      const cfo = ebitda - interest - otherCash - tax + dNWC + dOther;
      // capex grows with the prior year's growth in functional comp (as in the workbook)
      capex = i === 0 ? ci.capex_first_year : capex * prevFuncComp / prevPrevFuncComp;
      const fcf = cfo - capex;
      const otherInvesting = i === 0 ? (ci.holdback_release_first_year || 0) : 0;
      nb.cash = b.cash + fcf + otherInvesting;

      // ---------- SaaS metrics ----------
      const recGM = 1 - (subsCOGS + volCOGS) / (subsRev + volRev);
      const grr = 1 + cn / begSW, nrr = 1 + (ex + cn) / begSW;
      const grossAdds = nw + ex + (vol - prevVol);
      const cac = smTotal / grossAdds;
      const ltv = recGM * Math.min(5, 1 / (1 - grr));
      const arrGrowth = totalARR / prevTotalARR - 1;

      const put = (k, v) => R(k).push(v);
      put("begin_sw_arr", begSW); put("new_arr", nw); put("expansion_arr", ex); put("churn_arr", cn); put("end_sw_arr", endSW);
      put("uk_arr", K.end); put("us_arr", U.end); put("volume_arr", vol); put("total_arr", totalARR); put("arr_growth", arrGrowth);
      put("grr", grr); put("nrr", nrr);
      put("subs_rev", subsRev); put("volume_rev", volRev); put("ps_rev", psRev); put("revenue", rev); put("rev_growth", rev / prevRev - 1);
      put("cogs", cogs); put("gross_profit", gp); put("gm", gp / rev);
      put("sm", smTotal); put("sm_uk", K.total); put("rnd", rd); put("ga", ga); put("opex", opex);
      put("ebitda", ebitda); put("ebitda_margin", ebitda / rev);
      put("interest", -interest); put("tax_other", -(otherCash + tax)); put("nwc", dNWC + dOther); put("cfo", cfo); put("capex", -capex);
      put("fcf", fcf); put("cash", nb.cash);
      put("rule40", arrGrowth + ebitda / rev); put("magic", grossAdds / smTotal); put("cac", cac); put("ltv_cac", ltv / cac);
      put("payback", cac / recGM * 12); put("sales_hc", U.hc + K.hc); put("uk_hc", K.hc);

      prevVol = vol; prevRev = rev; prevTotalARR = totalARR; prevCostTotal = costTotal; prevPrevFuncComp = prevFuncComp; prevFuncComp = funcComp; b = nb;
    });
    return out;
  }

  /* Turns the folder's CSV/JSON files into model inputs. */
  function prepare(files) {
    const yrs = YEARS;
    const assumptions = {};
    files.assumptions.forEach((r) => {
      const s = r.scenario.trim().toLowerCase();
      (assumptions[s] = assumptions[s] || {})[r.key.trim()] = yrs.map((y) => +r[y]);
    });
    const byKey = (rows) => { const o = {}; rows.forEach((r) => (o[r.key.trim()] = yrs.map((y) => +r[y]))); return o; };
    return { assumptions, opening: files.opening, params: files.params, capacityUS: byKey(files.capacityUS), capacityUK: byKey(files.capacityUK) };
  }

  const api = { run, prepare, YEARS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LongRangeModel = api;
})(typeof window !== "undefined" ? window : globalThis);
