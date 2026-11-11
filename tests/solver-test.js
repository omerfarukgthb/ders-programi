// Yerleştiriciyi örnek okullarla dener: node tests/solver-test.js
const { create } = require('../js/solver.js');

// 8 şube, şube başına 30 saat; öğretmenler branşa göre paylaştırılır.
const SUBS = [[6, [2, 2, 2], 2], [5, [2, 2, 1], 2], [4, [2, 2], 2], [3, [2, 1], 1], [4, [2, 2], 2], [2, [2], 1], [2, [2], 1], [1, [1], 1], [1, [1], 1], [2, [2], 1]];

function school(kind, nClass) {
  const shifts = kind === 'ikili' ? [6, 6] : kind === 'tamgun' ? [8] : [6];
  const lunchAt = kind === 'tamgun' ? 4 : -1;
  const periods = [];
  shifts.forEach((n, si) => { for (let k = 0; k < n; k++) periods.push({ shift: si, lunchBefore: k === lunchAt }); });
  const D = 5, N = periods.length, z = () => new Uint8Array(D * N);
  const classes = [];
  for (let c = 0; c < nClass; c++) { const sh = shifts.length > 1 ? (c < nClass / 2 ? 0 : 1) : 0; classes.push({ shift: sh, first: sh * 6, un: z() }); }
  const teachers = [], lessons = []; let a = 0;
  SUBS.forEach(([h, blocks, nT], si) => {
    const t0 = teachers.length;
    const need = Math.max(nT, Math.ceil(nClass * h / 24));
    for (let k = 0; k < need; k++) teachers.push({ maxDaily: 0, un: z() });
    for (let c = 0; c < nClass; c++) {
      for (const len of blocks) lessons.push({ assign: a, classes: [c], teachers: [t0 + (c % need)], room: si === 6 ? 2 * (c >> 4) : si === 9 ? 2 * (c >> 4) + 1 : -1, len, fixed: -1 });
      a++;
    }
  });
  // Bir öğretmenin izin günü olsun
  for (let p = 0; p < N; p++) teachers[0].un[2 * N + p] = 1;
  return { days: D, periods, classes, teachers, rooms: Array.from({ length: 2 * Math.ceil(nClass / 16) }, () => ({ un: z() })), assignCount: a, lessons };
}

function verify(P, res) {
  const N = P.periods.length, seen = {};
  let bad = 0;
  res.pos.forEach((s, i) => {
    if (s < 0) return;
    const l = P.lessons[i];
    for (let k = 0; k < l.len; k++) {
      const pp = P.periods[(s % N) + k];
      if (!pp || (k > 0 && pp.lunchBefore)) bad++;
      for (const c of l.classes) { const key = 'c' + c + '@' + (s + k); if (seen[key] || P.classes[c].shift !== pp.shift || P.classes[c].un[s + k]) bad++; seen[key] = 1; }
      for (const t of l.teachers) { const key = 't' + t + '@' + (s + k); if (seen[key] || P.teachers[t].un[s + k]) bad++; seen[key] = 1; }
      if (l.room >= 0) { const key = 'r' + l.room + '@' + (s + k); if (seen[key]) bad++; seen[key] = 1; }
    }
  });
  return bad;
}

let fail = false;
for (const [kind, n] of [['tamgun', 8], ['ikili', 8], ['sabah', 8], ['ikili', 24], ['tamgun', 32]]) {
  const P = school(kind, n), t0 = Date.now();
  const sv = create(P, { seed: 7, improveMs: 3000 });
  while (!sv.done) sv.step(100);
  const r = sv.result(), hours = P.lessons.reduce((s, l) => s + l.len, 0);
  const left = r.unplaced.reduce((s, i) => s + P.lessons[i].len, 0), bad = verify(P, r);
  console.log(`${kind} ${n} sube, ${P.teachers.length} ogretmen, ${hours} saat: acikta ${left}, kural ihlali ${bad}, sinif boslugu ${r.classGaps}, ogretmen boslugu ${r.teacherGaps}, ayni gune dusen ${r.sameDay}, ${Date.now() - t0} ms`);
  if (bad || left) fail = true;
}
process.exit(fail ? 1 : 0);
