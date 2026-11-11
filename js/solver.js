/* Ders programı yerleştirici.
 * Girdi (P): { days, periods:[{shift,lunchBefore}], classes:[{shift,first,un}], teachers:[{maxDaily,un}],
 *              rooms:[{un}], assignCount, lessons:[{assign,classes,teachers,room,len,fixed}] }
 * "un" dizileri days*periods uzunluğunda 0/1 (kapalı saat). Konum = gün*periodSayısı + ders saati.
 * Yöntem: en zor ders önce + yerinden etme (ejection) ile kurulum, sonra tavlama ile boşluk azaltma.
 */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function uni(a, b) {
    const o = a.slice();
    for (const x of b) if (!o.includes(x)) o.push(x);
    return o;
  }

  function create(P, opts) {
    opts = opts || {};
    const D = P.days, N = P.periods.length, DN = D * N, L = P.lessons, nL = L.length;
    const W = { cGap: 40, cLate: 15, tGap: 5, sameDay: 150 };
    const rnd = rng(opts.seed || 12345);
    const improveMs = opts.improveMs == null ? 4000 : opts.improveMs;
    const maxAttempts = opts.maxAttempts || 8;
    const nC = P.classes.length, nT = P.teachers.length, nR = P.rooms.length;
    let cO, tO, rO, pos, aDay, tLoad;

    const totalHours = L.reduce((s, l) => s + l.len, 0);
    const tHours = new Float64Array(nT);
    for (const l of L) for (const t of l.teachers) tHours[t] += l.len;

    // Her ders için kurala uyan (devre, öğle arası, kapalı saat) başlangıç konumları
    const cand = [], candOK = [];
    for (let i = 0; i < nL; i++) {
      const l = L[i], ok = new Uint8Array(DN), list = [];
      let sh = -2;
      for (const c of l.classes) {
        const s = P.classes[c].shift;
        if (sh === -2) sh = s; else if (sh !== s) sh = -3;
      }
      if (sh !== -3) {
        for (let d = 0; d < D; d++) for (let p = 0; p + l.len <= N; p++) {
          let good = !l.dayOK || !!l.dayOK[d]; // kurs dersleri yalnız kurs günlerine, ötekiler ders günlerine
          for (let k = 0; k < l.len && good; k++) {
            const pp = P.periods[p + k], s = d * N + p + k;
            if (sh >= 0 && pp.shift !== sh) good = false;
            else if ((l.kurs ? pp.okC : pp.okN) === false) good = false; // o gün türünde bu ders saati yok
            else if (k > 0 && (pp.shift !== P.periods[p].shift || (l.kurs ? pp.lunchC : pp.lunchBefore))) good = false;
            else {
              for (const c of l.classes) if (P.classes[c].un[s]) good = false;
              for (const t of l.teachers) if (P.teachers[t].un[s]) good = false;
              if (l.room >= 0 && P.rooms[l.room].un[s]) good = false;
            }
          }
          if (good) { ok[d * N + p] = 1; list.push(d * N + p); }
        }
      }
      cand.push(list); candOK.push(ok);
    }

    const mk = n => Array.from({ length: n }, () => new Int32Array(DN).fill(-1));

    function put(i, s, v) {
      const l = L[i];
      for (let k = 0; k < l.len; k++) {
        for (const c of l.classes) cO[c][s + k] = v;
        for (const t of l.teachers) tO[t][s + k] = v;
        if (l.room >= 0) rO[l.room][s + k] = v;
      }
    }
    function place(i, s) {
      put(i, s, i); pos[i] = s;
      const d = (s / N) | 0, l = L[i];
      aDay[l.assign][d]++;
      for (const t of l.teachers) tLoad[t][d] += l.len;
    }
    function unplace(i) {
      const s = pos[i], d = (s / N) | 0, l = L[i];
      put(i, s, -1); pos[i] = -1;
      aDay[l.assign][d]--;
      for (const t of l.teachers) tLoad[t][d] -= l.len;
    }
    function conflicts(i, s) {
      const l = L[i], out = [];
      for (let k = 0; k < l.len; k++) {
        let v;
        for (const c of l.classes) { v = cO[c][s + k]; if (v >= 0 && v !== i && !out.includes(v)) out.push(v); }
        for (const t of l.teachers) { v = tO[t][s + k]; if (v >= 0 && v !== i && !out.includes(v)) out.push(v); }
        if (l.room >= 0) { v = rO[l.room][s + k]; if (v >= 0 && v !== i && !out.includes(v)) out.push(v); }
      }
      return out;
    }
    function loadOK(i, s, removed) {
      const l = L[i], d = (s / N) | 0;
      for (const t of l.teachers) {
        const mx = P.teachers[t].maxDaily;
        if (!mx) continue;
        let cur = tLoad[t][d];
        if (removed) for (const j of removed) if (((pos[j] / N) | 0) === d && L[j].teachers.includes(t)) cur -= L[j].len;
        if (cur + l.len > mx) return false;
      }
      return true;
    }

    function gaps(o, d) {
      const b = d * N; let first = -1, last = -1, cnt = 0;
      for (let p = 0; p < N; p++) if (o[b + p] >= 0) { if (first < 0) first = p; last = p; cnt++; }
      return cnt ? [last - first + 1 - cnt, first] : [0, -1];
    }
    function cDay(c, d) {
      const g = gaps(cO[c], d);
      return g[1] < 0 ? 0 : g[0] * W.cGap + (g[1] - P.classes[c].first) * W.cLate;
    }
    function tDay(t, d) { return gaps(tO[t], d)[0] * W.tGap; }
    function ents(i, j) {
      const l = L[i];
      if (j < 0) return [l.classes, l.teachers, [l.assign]];
      const m = L[j];
      return [uni(l.classes, m.classes), uni(l.teachers, m.teachers), uni([l.assign], [m.assign])];
    }
    function cost(e, d1, d2) {
      let s = 0;
      for (let q = 0; q < 2; q++) {
        const d = q ? d2 : d1;
        if (q && d1 === d2) break;
        for (const c of e[0]) s += cDay(c, d);
        for (const t of e[1]) s += tDay(t, d);
        for (const a of e[2]) if (aDay[a][d] > 1) s += (aDay[a][d] - 1) * W.sameDay;
      }
      return s;
    }
    function total() {
      let s = 0;
      for (let d = 0; d < D; d++) {
        for (let c = 0; c < nC; c++) s += cDay(c, d);
        for (let t = 0; t < nT; t++) s += tDay(t, d);
        for (let a = 0; a < P.assignCount; a++) if (aDay[a][d] > 1) s += (aDay[a][d] - 1) * W.sameDay;
      }
      return s;
    }

    function reset() {
      cO = mk(nC); tO = mk(nT); rO = mk(nR);
      pos = new Int32Array(nL).fill(-1);
      aDay = Array.from({ length: P.assignCount }, () => new Int16Array(D));
      tLoad = Array.from({ length: nT }, () => new Int16Array(D));
      for (let i = 0; i < nL; i++) if (L[i].fixed >= 0) {
        if (conflicts(i, L[i].fixed).length === 0) place(i, L[i].fixed); else L[i].fixed = -1;
      }
    }
    function restore(snap) {
      reset();
      for (let i = 0; i < nL; i++) if (pos[i] < 0 && snap[i] >= 0) place(i, snap[i]);
    }

    // ---- 1. aşama: kurulum ----
    let phase = 'construct', attempt = 0, best = null;
    let queue, failed, iter, maxIter, tabu;
    function startAttempt() {
      reset();
      queue = [];
      for (let i = 0; i < nL; i++) if (pos[i] < 0) queue.push(i);
      const key = new Float64Array(nL);
      for (const i of queue) {
        let th = 0;
        for (const t of L[i].teachers) th = Math.max(th, tHours[t]);
        key[i] = cand[i].length - L[i].len * 4 - th * 0.3 - L[i].classes.length * 2 + rnd() * (1 + attempt * 4);
      }
      queue.sort((a, b) => key[b] - key[a]); // en zor olan sonda, önce o alınır
      failed = []; iter = 0; maxIter = queue.length * 40 + 500;
      tabu = new Uint16Array(nL * DN);
    }
    function constructStep() {
      if (!queue.length || iter >= maxIter) { finishAttempt(); return; }
      iter++;
      const i = queue.pop(), cl = cand[i];
      let bs = -1, bsc = Infinity, bconf = null;
      for (let q = 0; q < cl.length; q++) {
        const s = cl[q], conf = conflicts(i, s);
        let bad = false, kick = 0;
        for (const j of conf) { if (L[j].fixed >= 0) { bad = true; break; } kick += L[j].len; }
        if (bad || !loadOK(i, s, conf)) continue;
        let sc = conf.length * 1000 + kick * 100 + tabu[i * DN + s] * 400 + rnd() * 3;
        if (!conf.length) {
          const d = (s / N) | 0, e = ents(i, -1), b = cost(e, d, d);
          place(i, s); sc += cost(e, d, d) - b; unplace(i);
        }
        if (sc < bsc) { bsc = sc; bs = s; bconf = conf; }
      }
      if (bs < 0) { failed.push(i); return; }
      for (const j of bconf) { unplace(j); queue.push(j); }
      tabu[i * DN + bs]++;
      place(i, bs);
    }
    function finishAttempt() {
      let fh = 0;
      for (let i = 0; i < nL; i++) if (pos[i] < 0) fh += L[i].len;
      if (!best || fh < best.fh) best = { fh, pos: pos.slice() };
      attempt++;
      if (best.fh === 0 || attempt >= maxAttempts) startImprove(); else startAttempt();
    }

    // ---- 2. aşama: iyileştirme (tavlama) ----
    let movable, cur, bestCost, bestPos, spent = 0, T = 30;
    function startImprove() {
      restore(best.pos);
      movable = [];
      for (let i = 0; i < nL; i++) if (pos[i] >= 0 && L[i].fixed < 0 && cand[i].length > 1) movable.push(i);
      cur = total(); bestCost = cur; bestPos = pos.slice();
      phase = (movable.length && cur > 0 && improveMs > 0) ? 'improve' : 'done';
      if (phase === 'done') finish();
    }
    function accept(dl) { return dl <= 0 || rnd() < Math.exp(-dl / T); }
    function improveStep() {
      const i = movable[(rnd() * movable.length) | 0], cl = cand[i];
      const s = cl[(rnd() * cl.length) | 0], o = pos[i];
      if (s === o) return;
      const conf = conflicts(i, s), d1 = (o / N) | 0, d2 = (s / N) | 0;
      if (!conf.length) {
        const e = ents(i, -1), b = cost(e, d1, d2);
        unplace(i);
        if (!loadOK(i, s)) { place(i, o); return; }
        place(i, s);
        const dl = cost(e, d1, d2) - b;
        if (accept(dl)) cur += dl; else { unplace(i); place(i, o); }
      } else if (conf.length === 1) {
        const j = conf[0], oj = pos[j];
        if (L[j].fixed >= 0 || !candOK[j][o]) return;
        const e = ents(i, j), b = cost(e, d1, d2);
        unplace(i); unplace(j);
        let ok = false;
        if (!conflicts(i, s).length && loadOK(i, s)) {
          place(i, s);
          if (!conflicts(j, o).length && loadOK(j, o)) { place(j, o); ok = true; } else unplace(i);
        }
        if (ok) {
          const dl = cost(e, d1, d2) - b;
          if (accept(dl)) cur += dl; else { unplace(i); unplace(j); ok = false; }
        }
        if (!ok) { place(i, o); place(j, oj); }
      }
      if (cur < bestCost - 1e-9) { bestCost = cur; bestPos = pos.slice(); }
    }

    function finish() {
      if (phase === 'construct') {
        let fh = 0;
        for (let i = 0; i < nL; i++) if (pos[i] < 0) fh += L[i].len;
        if (!best || fh < best.fh) best = { fh, pos: pos.slice() };
        restore(best.pos);
      } else if (bestPos) restore(bestPos);
      // Açıkta kalanlar için çakışmasız yer varsa koy
      for (let i = 0; i < nL; i++) if (pos[i] < 0) {
        for (const s of cand[i]) if (!conflicts(i, s).length && loadOK(i, s)) { place(i, s); break; }
      }
      phase = 'done';
    }

    startAttempt();

    return {
      get done() { return phase === 'done'; },
      step(ms) {
        const t0 = Date.now();
        let n = 0;
        while (phase !== 'done') {
          if (phase === 'construct') { constructStep(); if (++n % 10 === 0 && Date.now() - t0 >= ms) break; }
          else {
            improveStep();
            if (++n % 200 === 0) {
              const el = Date.now() - t0;
              const f = Math.min(1, (spent + el) / improveMs);
              T = 30 * (1 - f) * (1 - f) + 0.3;
              if (f >= 1 || bestCost <= 0) { finish(); break; }
              if (el >= ms) break;
            }
          }
        }
        if (phase === 'improve') spent += Date.now() - t0;
      },
      finish,
      progress() {
        let placed = 0;
        for (let i = 0; i < nL; i++) if (pos[i] >= 0) placed += L[i].len;
        return { phase, attempt: attempt + 1, placed, total: totalHours, frac: phase === 'improve' ? Math.min(1, spent / improveMs) : 0 };
      },
      result() {
        let cg = 0, tg = 0, same = 0;
        for (let d = 0; d < D; d++) {
          for (let c = 0; c < nC; c++) cg += gaps(cO[c], d)[0];
          for (let t = 0; t < nT; t++) tg += gaps(tO[t], d)[0];
          for (let a = 0; a < P.assignCount; a++) if (aDay[a][d] > 1) same += aDay[a][d] - 1;
        }
        const unplaced = [];
        for (let i = 0; i < nL; i++) if (pos[i] < 0) unplaced.push(i);
        return { pos: Array.from(pos), unplaced, classGaps: cg, teacherGaps: tg, sameDay: same, cost: total() };
      },
    };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Solver = api;
})(typeof self !== 'undefined' ? self : this);
