'use strict';
/* Ders Programı — sunucusuz tek sayfa uygulama. Veri tarayıcıda (localStorage) durur. */

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DSHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const PALETTE = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fed7aa', '#a5f3fc', '#fbcfe8', '#d9f99d', '#e9d5ff', '#c7d2fe', '#fecdd3', '#99f6e4', '#e5e7eb'];
const KEY = 'dersprog.v1', GHKEY = 'dersprog.gh';
const TABS = [['okul', 'Okul'], ['dersler', 'Dersler'], ['ogretmenler', 'Öğretmenler'], ['siniflar', 'Sınıflar'], ['derslikler', 'Derslikler'], ['dagitim', 'Ders Dağıtımı'], ['program', 'Program'], ['cikti', 'Çıktı'], ['yedek', 'Yedek']];
const PRESETS = {
  tamgun: { label: 'Tam gün, öğle aralı', desc: 'Sabah başlar, öğle arası verilir, öğleden sonra sürer.', shifts: [{ name: 'Tam gün', start: '08:30', periods: 8, lessonMin: 40, breakMin: 10, lunchAfter: 4, lunchMin: 45 }] },
  ikili: { label: 'İkili öğretim', desc: 'Sabahçı ve öğlenci devreleri; her sınıf bir devrede, öğretmen ikisinde de olabilir.', shifts: [{ name: 'Sabahçı', start: '07:00', periods: 6, lessonMin: 40, breakMin: 10, lunchAfter: 0, lunchMin: 0 }, { name: 'Öğlenci', start: '12:40', periods: 6, lessonMin: 40, breakMin: 10, lunchAfter: 0, lunchMin: 0 }] },
  sabah: { label: 'Yalnız sabah', desc: 'Dersler öğleye kadar biter, öğle arası yok.', shifts: [{ name: 'Sabah', start: '08:00', periods: 6, lessonMin: 40, breakMin: 10, lunchAfter: 0, lunchMin: 0 }] },
  ogle: { label: 'Yalnız öğleden sonra', desc: 'Dersler öğleden sonra başlar.', shifts: [{ name: 'Öğleden sonra', start: '13:00', periods: 6, lessonMin: 40, breakMin: 10, lunchAfter: 0, lunchMin: 0 }] },
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : 480; };
const fmt = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const sum = a => a.reduce((x, y) => x + y, 0);
const trSort = (a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true });

function mkShifts(type) { return PRESETS[type].shifts.map(s => Object.assign({ id: uid() }, s)); }
function blank(type) {
  return { v: 1, school: { name: '', year: '2026-2027', type, days: [0, 1, 2, 3, 4], courseDays: [], shifts: mkShifts(type) }, subjects: [], teachers: [], classes: [], rooms: [], assignments: [], placements: {}, updated: null };
}
function migrate(s) {
  const b = blank('tamgun');
  for (const k in b) if (s[k] == null) s[k] = b[k];
  for (const k in b.school) if (s.school[k] == null) s.school[k] = b.school[k];
  s.started = !!(s.started || s.school.name || s.subjects.length || s.teachers.length || s.classes.length);
  return s;
}

let S;
try { const j = localStorage.getItem(KEY); S = j ? migrate(JSON.parse(j)) : blank('tamgun'); } catch (e) { S = blank('tamgun'); }
let lastJSON = JSON.stringify(S);
const undo = [];
const ui = { tab: (location.hash || '#okul').slice(1), view: 'c', ent: '', sel: null, drag: null, fAsg: '', out: 'c', un: null, stop: false };
if (!TABS.some(t => t[0] === ui.tab)) ui.tab = 'okul';

// ---------- veri yardımcıları ----------
const coll = n => n === 'shifts' ? S.school.shifts : S[n];
const get = (n, id) => coll(n).find(x => x.id === id);
const nm = x => x ? (x.short || x.name || '?') : '?';
const names = (n, ids, full) => ids.map(id => { const x = get(n, id); return x ? (full ? x.name : nm(x)) : '?'; }).join(', ');

/** k. dersten sonraki teneffüs süresi: devreye özel süre girilmişse o, yoksa devrenin genel süresi. */
const breakOf = (sh, k) => sh.breaks && sh.breaks[k] != null ? sh.breaks[k] : sh.breakMin;
function periods() {
  const out = [];
  // Kurs günlerinin ders sayısı ve süreleri ayrı olabilir. Devrenin satır sayısı ikisinin büyüğüdür;
  // okN / okC o ders saatinin ders günlerinde / kurs günlerinde var olup olmadığını söyler.
  S.school.shifts.forEach((sh, si) => {
    const cn = Math.min(20, sh.coursePeriods || sh.periods), span = Math.max(sh.periods, cn);
    const cl = sh.courseLessonMin || sh.lessonMin, cb = sh.courseBreakMin || 0;
    let t = toMin(sh.start), ct = toMin(sh.courseStart || sh.start);
    for (let k = 0; k < span; k++) {
      let lunchBefore = false, lunchC = false;
      if (k > 0) {
        const lunch = sh.lunchAfter === k && sh.lunchMin > 0;
        if (lunch) { t += sh.lunchMin; lunchBefore = true; } else t += breakOf(sh, k);
        if (cb) ct += cb; else if (lunch) { ct += sh.lunchMin; lunchC = true; } else ct += breakOf(sh, k);
      }
      out.push({ idx: out.length, shiftId: sh.id, si, no: k + 1, start: t, end: t + sh.lessonMin, lunchBefore, okN: k < sh.periods, cstart: ct, cend: ct + cl, lunchC, okC: k < cn });
      t += sh.lessonMin; ct += cl;
    }
  });
  return out;
}
/** Ders saati o gün var mı (kurs gününde kurs çizelgesine, öteki günlerde ders çizelgesine bakılır). */
const pOK = (p, d) => isCDay(d) ? p.okC : p.okN;
const cDiff = p => p.cstart !== p.start || p.cend !== p.end;
/** Görünecek satırlar: ders günlerinde olanlar ve kurs günü seçiliyse yalnız kursta olanlar. */
const visP = (P, shiftId) => P.filter(p => (!shiftId || p.shiftId === shiftId) && (p.okN || (cDays().length && p.okC)));
// Kurs günleri: ders günlerinden ayrı tutulur; kurs dersleri yalnız bu günlere, normal dersler yalnız ders günlerine konur.
const cDays = () => S.school.courseDays || [];
const allDays = () => S.school.days.concat(cDays()).sort((a, b) => a - b);
const isCDay = d => cDays().includes(d);
/** Ders saatinin o gündeki saat aralığı; kurs günlerinde kurs çizelgesinden gelir. */
const tOf = (p, d) => isCDay(d) ? fmt(p.cstart) + '–' + fmt(p.cend) : fmt(p.start) + '–' + fmt(p.end);
function parseBlocks(a) {
  const h = +a.hours || 0;
  const b = String(a.blocks || '').split('+').map(x => parseInt(x, 10)).filter(x => x > 0);
  if (b.length && sum(b) === h) return b;
  const out = []; let r = h;
  while (r >= 2) { out.push(2); r -= 2; }
  if (r) out.push(1);
  return out;
}
function units() {
  const u = [];
  for (const a of S.assignments) parseBlocks(a).forEach((len, k) => u.push({ key: a.id + ':' + k, a, len }));
  return u;
}
function staticBad(u, p, P, d) {
  if (p < 0 || p + u.len > P.length) return 'Ders saati programın dışında kalıyor.';
  for (let k = 0; k < u.len; k++) {
    const pp = P[p + k];
    if (!pOK(pp, d)) return isCDay(d) ? 'Kurs günlerinde bu ders saati yok.' : 'Bu ders saati yalnızca kurs günlerinde var.';
    if (k > 0 && pp.shiftId !== P[p].shiftId) return 'Blok ders iki devreye bölünemez.';
    if (k > 0 && (isCDay(d) ? pp.lunchC : pp.lunchBefore)) return 'Blok ders öğle arasıyla bölünemez.';
    for (const cid of u.a.classIds) { const c = get('classes', cid); if (c && c.shiftId !== pp.shiftId) return c.name + ' bu devrede değil.'; }
  }
  return '';
}
function buildOcc() {
  const occ = { c: {}, t: {}, r: {} };
  const set = (m, id, k, u) => { (m[id] = m[id] || {})[k] = u; };
  for (const u of units()) {
    const pl = S.placements[u.key];
    if (!pl) continue;
    for (let k = 0; k < u.len; k++) {
      const key = pl.d + '-' + (pl.p + k);
      u.a.classIds.forEach(id => set(occ.c, id, key, u));
      u.a.teacherIds.forEach(id => set(occ.t, id, key, u));
      if (u.a.roomId) set(occ.r, u.a.roomId, key, u);
    }
  }
  return occ;
}
/** Bir dersin (u) verilen gün/saate konup konamayacağını söyler; konamazsa nedenini döndürür. */
function checkPlace(u, d, p, occ, P) {
  const sb = staticBad(u, p, P, d);
  if (sb) return sb;
  const a = u.a;
  if (isCDay(d) !== !!a.kurs) return a.kurs ? 'Kurs dersleri yalnızca kurs günlerine konur.' : 'Bu gün kurs günü; normal dersler buraya konmaz.';
  for (let k = 0; k < u.len; k++) {
    const key = d + '-' + (p + k);
    for (const [n, m, ids] of [['classes', occ.c, a.classIds], ['teachers', occ.t, a.teacherIds], ['rooms', occ.r, a.roomId ? [a.roomId] : []]]) {
      for (const id of ids) {
        const e = get(n, id);
        if (e && e.un && e.un[key]) return e.name + ' için bu saat kapalı.';
        const o = m[id] && m[id][key];
        if (o && o.key !== u.key) return e.name + ' bu saatte dolu (' + nm(get('subjects', o.a.subjectId)) + ').';
      }
    }
  }
  for (const id of a.teacherIds) {
    const t = get('teachers', id);
    if (!t || !t.maxDaily) continue;
    let n = u.len; const seen = {};
    for (const k in (occ.t[id] || {})) {
      const o = occ.t[id][k];
      if (k.split('-')[0] == d && o.key !== u.key && !seen[o.key]) { seen[o.key] = 1; n += o.len; }
    }
    if (n > t.maxDaily) return t.name + ' için günlük en çok ' + t.maxDaily + ' saat aşılır.';
  }
  return '';
}
function prune() {
  const P = periods(), us = {};
  for (const u of units()) us[u.key] = u;
  for (const k in S.placements) {
    const u = us[k], pl = S.placements[k];
    if (!u || !allDays().includes(pl.d) || isCDay(pl.d) !== !!u.a.kurs || staticBad(u, pl.p, P, pl.d)) delete S.placements[k];
  }
}
/** Devre yapısı değişince yerleşimleri ve kapalı saatleri yeni ders saati numaralarına taşır. */
function withShiftChange(fn) {
  const old = periods(); fn(); const nw = periods(), map = {};
  old.forEach(o => { const n = nw.find(x => x.shiftId === o.shiftId && x.no === o.no); map[o.idx] = n ? n.idx : -1; });
  for (const k in S.placements) { const pl = S.placements[k], n = map[pl.p]; if (n == null || n < 0) delete S.placements[k]; else pl.p = n; }
  for (const n of ['teachers', 'classes', 'rooms']) for (const e of S[n]) {
    if (!e.un) continue;
    const un = {};
    for (const k in e.un) { const [d, p] = k.split('-'); if (map[p] >= 0) un[d + '-' + map[p]] = 1; }
    e.un = un;
  }
}
/** kurs: true yalnız kurs dersleri, false yalnız normal dersler, verilmezse hepsi. */
const hoursOf = (field, id, kurs) => sum(S.assignments.filter(a => (kurs == null || !!a.kurs === kurs) && (field === 'roomId' ? a.roomId === id : a[field].includes(id))).map(a => +a.hours || 0));
const capacity = (c, kurs) => { const sh = get('shifts', c.shiftId); return sh ? (kurs ? (sh.coursePeriods || sh.periods) * cDays().length : sh.periods * S.school.days.length) : 0; };
function dropPlacements(aid) { for (const k in S.placements) if (k.startsWith(aid + ':')) delete S.placements[k]; }

function commit(rerender = true, clean = false) {
  prune();
  if (!clean) S.dirty = true;
  S.updated = new Date().toISOString();
  const j = JSON.stringify(S);
  if (j !== lastJSON) { undo.push(lastJSON); if (undo.length > 40) undo.shift(); }
  lastJSON = j;
  try { localStorage.setItem(KEY, j); } catch (e) { toast('Tarayıcıya kaydedilemedi: ' + e.message, true); }
  if (rerender) render(); else header();
}
function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.h); toast.h = setTimeout(() => { t.className = ''; }, bad ? 5000 : 3000);
}
function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime || 'application/json' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function warnings() {
  const w = [], P = periods(), sh = S.school.shifts;
  for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
    const a = P.filter(p => p.okN && p.shiftId === sh[i].id), b = P.filter(p => p.okN && p.shiftId === sh[j].id);
    if (a.length && b.length && a[0].start < b[b.length - 1].end && b[0].start < a[a.length - 1].end)
      w.push(`"${sh[i].name}" ve "${sh[j].name}" devrelerinin saatleri çakışıyor; iki devrede dersi olan öğretmen aynı anda iki yerde görünebilir.`);
  }
  for (const c of S.classes) {
    const h = hoursOf('classIds', c.id, false), cap = capacity(c), hk = hoursOf('classIds', c.id, true), capk = capacity(c, true);
    if (h > cap) w.push(`${c.name}: haftalık ${h} saat ders var, programda ${cap} saatlik yer var.`);
    if (hk > capk && cDays().length) w.push(`${c.name}: ${hk} saat kurs dersi var, kurs günlerinde ${capk} saatlik yer var.`);
  }
  if (!cDays().length && S.assignments.some(a => a.kurs)) w.push('Kurs dersi tanımlı ama kurs günü seçilmemiş; Okul adımından kurs günü seçin.');
  const nt = S.assignments.filter(a => !a.teacherIds.length).length;
  if (nt) w.push(`${nt} derse öğretmen atanmamış.`);
  return w;
}

// ---------- çizim ----------
// Kurulum adımları: sekmeler bu sırayla numaralanır, her sayfanın başındaki yönlendirme buradan gelir.
const STEPS = [
  { k: 'okul', t: 'Okul', q: 'Okulun adını yazın, öğretim şeklini seçin ve ders saatlerini okulunuza göre ayarlayın.', tip: 'Öğretim şeklini sonradan değiştirmek yerleştirilmiş programı siler; önce bunu kesinleştirin.' },
  { k: 'dersler', t: 'Dersler', q: 'Okulda okutulan dersleri ekleyin.', tip: 'Kısa ad çizelgedeki kutularda görünür; 3–4 harf yeterlidir.' },
  { k: 'ogretmenler', t: 'Öğretmenler', q: 'Öğretmenleri ekleyin; izin günlerini ve gelemedikleri saatleri "Kapalı saatler" ile işaretleyin.', tip: 'Her öğretmeni bir kez ekleyin. Birden çok derse giren öğretmen için ayrı kayıt gerekmez; dersleri Ders Dağıtımı adımında seçilir.' },
  { k: 'siniflar', t: 'Sınıflar', q: 'Şubeleri ekleyin.', tip: 'İkili öğretimde her sınıfın devresini (sabahçı / öğlenci) seçmeyi unutmayın.' },
  { k: 'derslikler', t: 'Derslikler', opt: true, q: 'Birden çok sınıfın sırayla kullandığı özel yerleri ekleyin: laboratuvar, spor salonu, atölye.', tip: 'Her sınıfın kendi dersliği için kayıt gerekmez. Paylaşılan özel yeriniz yoksa bu adımı atlayın.' },
  { k: 'dagitim', t: 'Ders Dağıtımı', q: 'Hangi sınıfın hangi dersini kimin, haftada kaç saat okutacağını girin.', tip: 'Bir sınıfın haftalık toplam saati programdaki yerden fazla olamaz; fazla olursa burada uyarı görünür.' },
  { k: 'program', t: 'Program', q: 'Dersleri çizelgeye yerleştirin: otomatik yerleştirin, sonra gerekirse elle düzeltin.', tip: 'Yeri belli olan dersleri önce elle koyup kilitleyin (🔓), sonra "Otomatik yerleştir"e basın; kilitli dersler yerinde kalır.' },
  { k: 'cikti', t: 'Çıktı', last: true, q: 'Sınıf, öğretmen ve derslik programlarını ya da çarşaf programı yazdırın; Excel için indirin.', tip: 'Program bittiğinde Yedek sekmesinden yedek almayı unutmayın; veriler yalnızca bu tarayıcıda durur.' },
];
const hasData = () => !!(S.school.name || S.subjects.length || S.teachers.length || S.classes.length);
const needsBackup = () => hasData() && (S.dirty || !S.lastBackup);
function stepState() {
  const us = units(), total = sum(us.map(u => u.len)), placed = sum(us.filter(u => S.placements[u.key]).map(u => u.len)), P = periods();
  return {
    okul: { done: !!S.school.name, txt: `${S.school.shifts.length} devre, günde ${P.filter(p => p.okN).length} ders saati, haftada ${S.school.days.length} gün${cDays().length ? ' + ' + cDays().length + ' kurs günü' : ''}`, miss: 'Okul adını yazın.' },
    dersler: { done: S.subjects.some(x => x.name), txt: S.subjects.length + ' ders tanımlı', miss: 'En az bir ders ekleyin.' },
    ogretmenler: { done: S.teachers.some(x => x.name), txt: S.teachers.length + ' öğretmen tanımlı', miss: 'En az bir öğretmen ekleyin.' },
    siniflar: { done: S.classes.some(x => x.name), txt: S.classes.length + ' sınıf tanımlı', miss: 'En az bir sınıf ekleyin.' },
    derslikler: { done: S.rooms.length > 0, txt: S.rooms.length + ' derslik tanımlı' },
    dagitim: { done: S.assignments.length > 0, txt: `${S.assignments.length} ders, toplam ${total} saat dağıtıldı`, miss: '"+ Ders ekle" ile dersleri sınıflara ve öğretmenlere dağıtın.' },
    program: { done: total > 0 && placed === total, txt: `${total} ders saatinin hepsi yerleşti`, miss: total ? `${total - placed} ders saati yerleşmeyi bekliyor; "Otomatik yerleştir"e basın.` : 'Önce ders dağıtımını girin.' },
    cikti: { done: false },
  };
}
function guideHtml(st) {
  if (!S.started) return '';
  if (ui.tab === 'yedek') {
    const nb = needsBackup();
    return `<div class="guide ${nb ? 'todo' : 'done'}"><div class="g-main"><h1>Yedek</h1><p class="g-status">${nb ? '● Yedeklenmemiş değişiklik var. Veriler yalnızca bu tarayıcıda duruyor; aşağıdan yedek alın.' : hasData() ? '✓ Veriler yedekli.' : 'Henüz yedeklenecek veri yok.'}</p></div></div>`;
  }
  const i = STEPS.findIndex(s => s.k === ui.tab), s = STEPS[i], x = st[s.k], prev = STEPS[i - 1], next = STEPS[i + 1];
  const status = s.last ? '' : x.done ? '✓ ' + x.txt : s.opt ? 'Bu adım isteğe bağlı; atlayabilirsiniz.' : '● Eksik: ' + x.miss;
  return `<div class="guide ${x.done ? 'done' : s.opt || s.last ? '' : 'todo'}">
    <div class="g-main"><div class="g-step">Adım ${i + 1} / ${STEPS.length}${s.opt ? ' · isteğe bağlı' : ''}</div><h1>${s.t}</h1><p>${s.q}</p>
      ${status ? `<p class="g-status">${esc(status)}</p>` : ''}<p class="g-tip"><b>Önemli</b>${s.tip}</p></div>
    <div class="g-nav">${prev ? `<a class="btn" href="#${prev.k}">‹ Geri</a>` : ''}${next ? `<a class="btn ${x.done || s.opt ? 'primary' : ''}" href="#${next.k}">${s.opt && !x.done ? 'Atla' : 'Sonraki'}: ${next.t} ›</a>` : `<a class="btn primary" href="#yedek">Yedek al ›</a>`}</div></div>`;
}
function header() {
  $('#schoolName').textContent = S.school.name ? '· ' + S.school.name : '';
  $('#saveState').textContent = S.updated ? 'Kaydedildi ' + new Date(S.updated).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
  $('#undoBtn').disabled = !undo.length;
  document.body.classList.toggle('fresh', !S.started);
  if (!S.started) { $('#progress').innerHTML = $('#tabs').innerHTML = $('#guide').innerHTML = ''; return; }
  const st = stepState(), req = STEPS.filter(s => !s.opt && !s.last), nd = req.filter(s => st[s.k].done).length;
  const todo = req.find(s => !st[s.k].done);
  $('#progress').innerHTML = `Kurulum ${nd} / ${req.length}<i><b style="width:${nd / req.length * 100}%"></b></i>`;
  $('#tabs').innerHTML = STEPS.map((s, i) => `<a href="#${s.k}" class="${ui.tab === s.k ? 'on' : ''} ${st[s.k].done ? 'done' : ''} ${todo && todo.k === s.k ? 'todo' : ''}" ${todo && todo.k === s.k ? 'title="Sıradaki adım"' : ''}><span class="num">${st[s.k].done ? '✓' : i + 1}</span>${s.t}</a>`).join('')
    + `<span class="grow"></span><a href="#yedek" class="${ui.tab === 'yedek' ? 'on' : ''}">Yedek${needsBackup() ? '<span class="dirty" title="Yedeklenmemiş değişiklik var"></span>' : ''}</a>`;
  $('#guide').innerHTML = guideHtml(st);
}
function vWelcome() {
  return `<section class="welcome"><h1>Ders programınızı üç aşamada hazırlayın</h1>
    <p class="lead">Program sizi adım adım yönlendirir. Verileriniz bu tarayıcıda kalır; istediğiniz zaman ara verip kaldığınız yerden sürdürebilirsiniz.</p>
    <div class="phases">
      <div><span>1</span><b>Tanımlayın</b><p>Okulun öğretim şeklini, derslerini, öğretmenlerini ve sınıflarını girin.</p></div>
      <div><span>2</span><b>Dağıtın</b><p>Hangi sınıfın hangi dersini kimin, haftada kaç saat okutacağını belirtin.</p></div>
      <div><span>3</span><b>Yerleştirin</b><p>Program dersleri çakışmadan yerleştirir; siz düzeltir ve yazdırırsınız.</p></div>
    </div>
    <div class="row center"><button class="primary big" data-act="start">Kuruluma başla</button><button class="big" data-act="startSample">Önce örnek okulla dene</button></div>
    <p class="hint center"><a href="#" data-act="startRestore">Daha önce aldığım yedeği geri yükleyeceğim</a></p></section>`;
}
function go(tab) { ui.tab = tab; ui.sel = null; if (location.hash === '#' + tab) render(); else location.hash = tab; }
function render() {
  header();
  if (!S.started) { $('#view').innerHTML = vWelcome(); return; }
  const V = { okul: vOkul, dersler: vDersler, ogretmenler: vOgretmenler, siniflar: vSiniflar, derslikler: vDerslikler, dagitim: vDagitim, program: vProgram, cikti: vCikti, yedek: vYedek };
  $('#view').innerHTML = V[ui.tab]();
  if (ui.tab === 'program' && ui.sel) markCells(ui.sel);
}

function zil() {
  const P = periods();
  return `<div class="zil">${S.school.shifts.map(sh => {
    const ps = P.filter(p => p.shiftId === sh.id && p.okN), cs = P.filter(p => p.shiftId === sh.id && p.okC);
    return `<div><b>${esc(sh.name)}</b><ol>${ps.map((p, i) => (p.lunchBefore ? `<li class="lunch">Öğle arası <span data-lt="${p.idx}">${fmt(ps[i - 1].end)}–${fmt(p.start)}</span></li>`
      : i ? `<li class="brk">teneffüs <span><input type="number" min="0" data-brk="${sh.id}:${i}" value="${breakOf(sh, i)}" class="${sh.breaks && sh.breaks[i] != null ? 'own' : ''}" aria-label="${i}. dersten sonraki teneffüs, dakika"> dk</span></li>` : '')
      + `<li>${p.no}. ders <span data-pt="${p.idx}">${fmt(p.start)}–${fmt(p.end)}</span></li>`).join('')}</ol>
</div>` + (cDays().length ? `<div class="czil"><b>${esc(sh.name)} · kurs günleri</b><ol>${cs.map(p => `<li>${p.no}. ders <span data-ct="${p.idx}">${fmt(p.cstart)}–${fmt(p.cend)}</span></li>`).join('')}</ol></div>` : '');
  }).join('')}</div>` + warnBox();
}
/** Zil çizelgesindeki saatleri, kutuları yeniden çizmeden günceller (yazarken odak kaybolmasın). */
function refreshTimes() {
  const P = periods();
  P.forEach((p, i) => {
    const s = $(`[data-pt="${p.idx}"]`); if (s) s.textContent = fmt(p.start) + '–' + fmt(p.end);
    const l = $(`[data-lt="${p.idx}"]`); if (l && i) l.textContent = fmt(P[i - 1].end) + '–' + fmt(p.start);
    const c = $(`[data-ct="${p.idx}"]`); if (c) c.textContent = fmt(p.cstart) + '–' + fmt(p.cend);
  });
}
const warnBox = () => { const w = warnings(); return w.length ? `<div class="warn">${w.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : ''; };

function vOkul() {
  const sc = S.school;
  const num = (s, f, min, w) => `<td><input type="number" min="${min}" style="width:${w || 70}px" data-coll="shifts" data-id="${s.id}" data-f="${f}" value="${s[f]}"></td>`;
  return `<section class="panel"><h2>Okul bilgileri</h2><div class="row">
    <label>Okul adı<input data-chg="name" value="${esc(sc.name)}" placeholder="Örn. Cumhuriyet Ortaokulu" style="width:320px"></label>
    <label>Öğretim yılı<input data-chg="year" value="${esc(sc.year)}" style="width:120px"></label></div></section>
  <section class="panel"><h2>Öğretim şekli</h2><p class="hint">Okulunuza en yakın şablonu seçin; saatleri aşağıdan değiştirebilirsiniz.</p>
    <div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="preset ${sc.type === k ? 'on' : ''}" data-act="preset" data-type="${k}"><b>${p.label}</b><span>${p.desc}</span></button>`).join('')}</div></section>
  <section class="panel"><h2>Ders günleri</h2><div class="row">${DAYS.map((d, i) => `<label class="chk"><input type="checkbox" data-day="${i}" ${sc.days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
    <h4>Kurs günleri <small>isteğe bağlı</small></h4><div class="row">${DAYS.map((d, i) => `<label class="chk"><input type="checkbox" data-day="${i}" data-kind="c" ${isCDay(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
    <p class="hint">Kurs günlerine yalnızca Ders Dağıtımı'nda "Kurs dersi" olarak işaretlenen dersler yerleşir; normal dersler bu günlere konmaz. Bir gün ya ders günü ya kurs günü olabilir. Kursun başlangıç saatini aşağıdaki "Kurs başlangıcı" alanından değiştirebilirsiniz.</p></section>
  <section class="panel"><h2>Devreler ve ders saatleri</h2>
    <p class="hint">Öğle arası istemiyorsanız "kaçıncı dersten sonra" alanına 0 yazın. Sınıflar bir devreye bağlanır; öğretmenler bütün devrelerde ders verebilir.</p>
    <table class="tbl"><tr><th>Devre adı</th><th>Başlangıç</th><th>Ders sayısı</th><th>Ders (dk)</th><th>Teneffüs (dk)</th><th>Öğle arası: kaçıncı dersten sonra</th><th>Öğle arası (dk)</th><th></th></tr>
    ${sc.shifts.map(s => `<tr><td><input data-coll="shifts" data-id="${s.id}" data-f="name" value="${esc(s.name)}"></td>
      <td><input type="time" data-coll="shifts" data-id="${s.id}" data-f="start" value="${esc(s.start)}"></td>
      ${num(s, 'periods', 1)}${num(s, 'lessonMin', 10)}${num(s, 'breakMin', 0)}${num(s, 'lunchAfter', 0, 90)}${num(s, 'lunchMin', 0)}
      <td>${sc.shifts.length > 1 ? `<button class="x" data-act="delShift" data-id="${s.id}" title="Devreyi sil">✕</button>` : ''}</td></tr>`).join('')}</table>
    <button data-act="addShift">+ Devre ekle</button>
    ${cDays().length ? `<h4>Kurs günleri çizelgesi <small>${cDays().map(d => DAYS[d]).join(', ')}</small></h4>
    <p class="hint">Kurs günlerinde ders sayısı, ders süresi, teneffüs ve başlangıç saati hafta içinden farklı olabilir. Boş bıraktığınız alan hafta içiyle aynı kalır. Teneffüs süresi yazarsanız kurs günlerinde öğle arası verilmez, bütün aralar bu süre olur.</p>
    <table class="tbl"><tr><th>Devre</th><th>Kurs başlangıcı</th><th>Ders sayısı</th><th>Ders (dk)</th><th>Teneffüs (dk)</th></tr>
    ${sc.shifts.map(s => `<tr><td>${esc(s.name)}</td><td><input type="time" data-coll="shifts" data-id="${s.id}" data-f="courseStart" value="${esc(s.courseStart || '')}"></td>
      ${['coursePeriods', 'courseLessonMin', 'courseBreakMin'].map((f, i) => `<td><input type="number" min="0" style="width:80px" data-coll="shifts" data-id="${s.id}" data-f="${f}" value="${s[f] || ''}" placeholder="${[s.periods, s.lessonMin, s.breakMin][i]}"></td>`).join('')}</tr>`).join('')}</table>` : ''}
    <h4>Zil çizelgesi</h4><p class="hint">Bir teneffüsü ötekilerden uzun ya da kısa yapmak için aşağıdaki kutuya süresini yazın; değiştirdikleriniz koyu çerçeveli görünür. Kutuyu boşaltırsanız yukarıdaki genel teneffüs süresine döner.</p>
    <div id="zil">${zil()}</div></section>`;
}

function crud(n, title, hint, cols, addLabel) {
  const list = coll(n);
  return `<section class="panel"><h2>${title} <small>${list.length}</small></h2><p class="hint">${hint}</p>
  ${list.length ? `<div class="scroll"><table class="tbl"><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}<th></th></tr>
  ${list.map(o => `<tr>${cols.map(c => `<td>${c.cell ? c.cell(o) : c.type === 'select'
    ? `<select data-coll="${n}" data-id="${o.id}" data-f="${c.f}">${c.opts().map(([v, l]) => `<option value="${v}" ${o[c.f] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    : `<input type="${c.type || 'text'}" ${c.type === 'number' ? 'min="0"' : ''} style="width:${c.w || 160}px" data-coll="${n}" data-id="${o.id}" data-f="${c.f}" value="${esc(o[c.f] == null ? '' : o[c.f])}" placeholder="${c.ph || ''}">`}</td>`).join('')}
    <td><button class="x" data-act="del" data-coll="${n}" data-id="${o.id}" title="Sil">✕</button></td></tr>`).join('')}</table></div>` : '<p class="empty">Henüz kayıt yok.</p>'}
  <div class="row"><button data-act="add" data-coll="${n}">+ ${addLabel}</button></div>
  <details><summary>Toplu ekle</summary><p class="hint">Her satıra bir ad yazın.</p><textarea id="bulk" rows="6" cols="40"></textarea><br><button data-act="bulk" data-coll="${n}">Listeyi ekle</button></details></section>`;
}
const unBtn = n => o => `<button data-act="un" data-coll="${n}" data-id="${o.id}">Kapalı saatler${o.un && Object.keys(o.un).length ? ' (' + Object.keys(o.un).length + ')' : ''}</button>`;
const vDersler = () => crud('subjects', 'Dersler', 'Kısa ad çizelgedeki kutularda görünür.', [{ f: 'name', label: 'Ders adı', w: 240 }, { f: 'short', label: 'Kısa ad', w: 80 }, { f: 'color', label: 'Renk', type: 'color', w: 50 }], 'Ders ekle');
const vOgretmenler = () => crud('teachers', 'Öğretmenler', 'Günlük en çok saat boşsa ya da 0 ise sınır uygulanmaz. İzin günü ya da gelemediği saatler için "Kapalı saatler"i kullanın.',
  [{ f: 'name', label: 'Adı soyadı', w: 220 }, { f: 'short', label: 'Kısa ad', w: 70 }, { f: 'branch', label: 'Branş', w: 150 }, { f: 'maxDaily', label: 'Günlük en çok', type: 'number', w: 70 },
    { label: 'Kapalı saatler', cell: unBtn('teachers') }, { label: 'Haftalık yük', cell: o => hoursOf('teacherIds', o.id) + ' saat' }], 'Öğretmen ekle');
const vSiniflar = () => crud('classes', 'Sınıflar', 'İkili öğretimde her sınıfın devresini seçin.',
  [{ f: 'name', label: 'Sınıf / şube', w: 120, ph: '5/A' }, { f: 'shiftId', label: 'Devre', type: 'select', opts: () => S.school.shifts.map(s => [s.id, s.name]) },
    { label: 'Kapalı saatler', cell: unBtn('classes') }, { label: 'Haftalık ders', cell: o => { const h = hoursOf('classIds', o.id, false), c = capacity(o), hk = hoursOf('classIds', o.id, true); return `<span class="${h > c ? 'over' : ''}">${h} / ${c} saat</span>${hk ? ` + ${hk} saat kurs` : ''}`; } }], 'Sınıf ekle');
const vDerslikler = () => crud('rooms', 'Derslikler', 'Yalnızca paylaşılan özel yerleri girin (laboratuvar, spor salonu, atölye). Her sınıfın kendi dersliği için kayıt gerekmez.',
  [{ f: 'name', label: 'Derslik adı', w: 220 }, { label: 'Kapalı saatler', cell: unBtn('rooms') }, { label: 'Haftalık kullanım', cell: o => hoursOf('roomId', o.id) + ' saat' }], 'Derslik ekle');

function vDagitim() {
  if (!S.subjects.length || !S.classes.length) return `<section class="panel"><h2>Ders Dağıtımı</h2><p class="empty">Önce dersleri, öğretmenleri ve sınıfları tanımlayın. Denemek için Yedek sekmesinden örnek veri yükleyebilirsiniz.</p></section>`;
  const [ft, fid] = ui.fAsg.split(':');
  const list = S.assignments.filter(a => !ft || (ft === 'c' ? a.classIds.includes(fid) : a.teacherIds.includes(fid)));
  const opt = (p, l) => l.slice().sort(trSort).map(o => `<option value="${p}:${o.id}" ${ui.fAsg === p + ':' + o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
  return `<section class="panel"><h2>Ders Dağıtımı <small>${list.length} ders, ${sum(list.map(a => +a.hours || 0))} saat</small></h2>
  <p class="hint">Hangi sınıfın hangi dersini kimin, haftada kaç saat okutacağını girin. Dağılım haftalık saatin günlere bölünüşüdür: 5 saat için 2+2+1 üç ayrı güne iki blok ve bir tek ders koyar.</p>
  <div class="toolbar"><select data-ui="fAsg"><option value="">Tümü</option><optgroup label="Sınıflar">${opt('c', S.classes)}</optgroup><optgroup label="Öğretmenler">${opt('t', S.teachers)}</optgroup></select>
  <button class="primary" data-act="asg">+ Ders ekle</button></div>
  ${list.length ? `<div class="scroll"><table class="tbl lines"><tr><th>Sınıf</th><th>Ders</th><th>Öğretmen</th><th>Saat</th><th>Dağılım</th><th>Derslik</th><th>Yerleşen</th><th></th></tr>
  ${list.map(a => { const bl = parseBlocks(a), pl = sum(bl.filter((b, k) => S.placements[a.id + ':' + k])); const sub = get('subjects', a.subjectId);
    return `<tr><td>${esc(names('classes', a.classIds, true))}</td><td><span class="dot" style="background:${sub ? sub.color : '#ccc'}"></span>${esc(sub ? sub.name : '?')}${a.kurs ? ' <span class="tag">kurs</span>' : ''}</td>
    <td>${a.teacherIds.length ? esc(names('teachers', a.teacherIds, true)) : '<span class="over">atanmadı</span>'}</td><td>${a.hours}</td><td>${bl.join('+')}</td><td>${a.roomId ? esc(names('rooms', [a.roomId], true)) : ''}</td><td>${pl}/${a.hours}</td>
    <td class="nowrap"><button data-act="asg" data-id="${a.id}">Düzenle</button> <button class="x" data-act="delAsg" data-id="${a.id}" title="Sil">✕</button></td></tr>`; }).join('')}</table></div>` : '<p class="empty">Bu görünümde ders yok.</p>'}
  ${warnBox()}</section>`;
}

function card(u, style) {
  const a = u.a, sub = get('subjects', a.subjectId), pl = S.placements[u.key];
  const cls = names('classes', a.classIds, true), tch = names('teachers', a.teacherIds), room = a.roomId ? nm(get('rooms', a.roomId)) : '';
  const kp = pl && isCDay(pl.d) ? periods()[pl.p] : null; // kurs günündeki kutuda başlangıç saati de görünsün
  const l2 = (a.kurs ? 'Kurs ' + (kp && cDiff(kp) ? tOf(kp, pl.d).split('–')[0] + ' ' : '') + '· ' : '') + (ui.view === 'c' ? tch : ui.view === 't' ? cls : cls + ' · ' + tch) + (room && ui.view !== 'r' ? ' · ' + room : '');
  const tip = `${sub ? sub.name : '?'}${a.kurs ? ' (kurs)' : ''} — ${cls} — ${names('teachers', a.teacherIds, true)}${room ? ' — ' + room : ''} (${u.len} saat)`;
  return `<div class="card ${pl && pl.locked ? 'locked' : ''} ${ui.sel === u.key ? 'sel' : ''}" draggable="true" data-u="${u.key}" style="background:${sub ? sub.color : '#e5e7eb'};${style || ''}" title="${esc(tip)}">
    <b>${esc(nm(sub))}</b><span>${esc(l2)}</span>${pl ? `<i data-act="lock" title="Kilitle / kilidi aç">${pl.locked ? '🔒' : '🔓'}</i><i class="rm" data-act="unplace" title="Programdan çıkar">✕</i>` : `<em>${u.len} saat</em>`}</div>`;
}
const entUnits = (us, v, id) => us.filter(u => v === 'c' ? u.a.classIds.includes(id) : v === 't' ? u.a.teacherIds.includes(id) : u.a.roomId === id);

function vProgram() {
  const lists = { c: S.classes, t: S.teachers, r: S.rooms }, list = lists[ui.view];
  if (!list.some(x => x.id === ui.ent)) ui.ent = list[0] ? list[0].id : '';
  const ent = list.find(x => x.id === ui.ent), us = units();
  const total = sum(us.map(u => u.len)), placed = sum(us.filter(u => S.placements[u.key]).map(u => u.len));
  let h = `<div class="toolbar"><div class="seg">${[['c', 'Sınıf'], ['t', 'Öğretmen'], ['r', 'Derslik']].map(([v, l]) => `<button class="${ui.view === v ? 'on' : ''}" data-act="pview" data-v="${v}">${l}</button>`).join('')}</div>
    <button data-act="pstep" data-n="-1" title="Önceki">‹</button><select data-ui="ent">${list.map(o => `<option value="${o.id}" ${o.id === ui.ent ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select><button data-act="pstep" data-n="1" title="Sonraki">›</button>
    <span class="grow"></span><span class="stat ${placed < total ? 'over' : ''}">${placed} / ${total} ders saati yerleşti</span>
    <select id="svTime" title="Yerleştirme süresi"><option value="1500">Hızlı</option><option value="5000" selected>Normal</option><option value="20000">Titiz</option></select>
    <button class="primary" data-act="solve" data-mode="all">Otomatik yerleştir</button><button data-act="solve" data-mode="fill">Kalanları yerleştir</button><button data-act="clearSched">Temizle</button></div>${warnBox()}`;
  if (!ent) return h + `<section class="panel"><p class="empty">Bu görünümde gösterilecek kayıt yok. Önce tanımları ve ders dağıtımını girin.</p></section>`;
  const P = periods(), vis = visP(P, ui.view === 'c' ? ent.shiftId : ''), days = allDays();
  const mine = entUnits(us, ui.view, ent.id), rowOf = {};
  let r = 1, g = `<div class="grid" style="grid-template-columns:84px repeat(${days.length},minmax(96px,1fr))"><div class="gh" style="grid-row:1;grid-column:1"></div>` + days.map((d, i) => `<div class="gh ${isCDay(d) ? 'kd' : ''}" style="grid-row:1;grid-column:${i + 2}">${DAYS[d]}${isCDay(d) ? ' <small>kurs</small>' : ''}</div>`).join('');
  vis.forEach((p, i) => {
    const prev = vis[i - 1];
    if (prev && (p.shiftId !== prev.shiftId || (p.lunchBefore && p.okN))) { r++; g += `<div class="sep" style="grid-row:${r};grid-column:1/-1">${p.shiftId !== prev.shiftId ? esc(get('shifts', p.shiftId).name) + ' devresi' : 'Öğle arası ' + fmt(prev.end) + '–' + fmt(p.start)}</div>`; }
    r++; rowOf[p.idx] = r;
    g += `<div class="gt" style="grid-row:${r};grid-column:1"><b>${p.no}</b><small>${p.okN ? fmt(p.start) + '–' + fmt(p.end) : 'yalnız kurs'}</small></div>`;
    days.forEach((d, ci) => {
      const st = `style="grid-row:${r};grid-column:${ci + 2}"`;
      g += !pOK(p, d) ? `<div class="na" ${st}></div>`
        : `<div class="cell ${ent.un && ent.un[d + '-' + p.idx] ? 'off' : ''} ${isCDay(d) ? 'kd' : ''}" data-d="${d}" data-p="${p.idx}" ${st}>${isCDay(d) && cDiff(p) ? `<small>${tOf(p, d)}</small>` : ''}</div>`;
    });
  });
  let hrs = 0; const perDay = {};
  for (const u of mine) {
    const pl = S.placements[u.key];
    if (!pl || rowOf[pl.p] == null) continue;
    hrs += u.len; (perDay[pl.d] = perDay[pl.d] || []).push(pl.p, pl.p + u.len - 1);
    g += card(u, `grid-row:${rowOf[pl.p]}/span ${u.len};grid-column:${days.indexOf(pl.d) + 2}`);
  }
  g += '</div>';
  let gap = 0; const occ = buildOcc()[ui.view][ent.id] || {};
  for (const d in perDay) { const lo = Math.min(...perDay[d]), hi = Math.max(...perDay[d]); for (let p = lo; p <= hi; p++) if (!occ[d + '-' + p]) gap++; }
  const pool = mine.filter(u => !S.placements[u.key]);
  return h + `<div class="prog"><div class="scroll">${g}<p class="hint">${esc(ent.name)}: ${hrs} saat yerleşti, arada ${gap} boş saat. Dersi sürükleyin ya da tıklayıp hedef saate tıklayın; yeşil saatler uygundur. Kilitli dersler otomatik yerleştirmede yerinde kalır. Esc seçimi bırakır.</p></div>
    <aside class="pool" data-drop="pool"><h3>Yerleşmemiş dersler <small>${sum(pool.map(u => u.len))} saat</small></h3>${pool.map(u => card(u)).join('') || '<p class="empty">Hepsi yerleşti.</p>'}</aside></div>`;
}
function markCells(key) {
  const u = units().find(x => x.key === key), grid = $('.grid');
  if (!u || !grid) return;
  grid.classList.add('picking');
  const occ = buildOcc(), P = periods();
  for (const c of $$('.cell', grid)) {
    const why = checkPlace(u, +c.dataset.d, +c.dataset.p, occ, P);
    c.classList.add(why ? 'bad' : 'ok'); c.title = why;
  }
}
function clearMarks() {
  const grid = $('.grid'); if (!grid) return;
  grid.classList.remove('picking');
  for (const c of $$('.cell', grid)) { c.classList.remove('ok', 'bad'); c.title = ''; }
}
function placeUnit(key, d, p) {
  const u = units().find(x => x.key === key); if (!u) return;
  const why = checkPlace(u, d, p, buildOcc(), periods());
  if (why) { toast(why, true); return; }
  const old = S.placements[key];
  S.placements[key] = { d, p, locked: !!(old && old.locked) };
  ui.sel = null; commit();
}

// ---------- otomatik yerleştirme ----------
function buildProblem(mode) {
  const P = periods(), days = allDays(), D = days.length, N = P.length;
  const okN = Uint8Array.from(days, d => isCDay(d) ? 0 : 1), okK = Uint8Array.from(days, d => isCDay(d) ? 1 : 0);
  const ix = l => { const m = {}; l.forEach((x, i) => { m[x.id] = i; }); return m; };
  const cI = ix(S.classes), tI = ix(S.teachers), rI = ix(S.rooms), aI = ix(S.assignments), sI = ix(S.school.shifts);
  const un = o => { const a = new Uint8Array(D * N); for (const k in (o.un || {})) { const [d, p] = k.split('-'); const di = days.indexOf(+d); if (di >= 0 && +p < N) a[di * N + +p] = 1; } return a; };
  const us = units();
  return {
    us, N, prob: {
      days: D, periods: P.map(p => ({ shift: p.si, lunchBefore: p.lunchBefore, lunchC: p.lunchC, okN: p.okN, okC: p.okC })), assignCount: S.assignments.length,
      classes: S.classes.map(c => ({ shift: sI[c.shiftId], first: Math.max(0, P.findIndex(p => p.shiftId === c.shiftId)), un: un(c) })),
      teachers: S.teachers.map(t => ({ maxDaily: +t.maxDaily || 0, un: un(t) })),
      rooms: S.rooms.map(r => ({ un: un(r) })),
      lessons: us.map(u => {
        const pl = S.placements[u.key], keep = pl && (mode === 'fill' || pl.locked);
        return { assign: aI[u.a.id], classes: u.a.classIds.map(id => cI[id]).filter(x => x != null), teachers: u.a.teacherIds.map(id => tI[id]).filter(x => x != null), room: u.a.roomId && rI[u.a.roomId] != null ? rI[u.a.roomId] : -1, len: u.len, kurs: !!u.a.kurs, dayOK: u.a.kurs ? okK : okN, fixed: keep ? days.indexOf(pl.d) * N + pl.p : -1 };
      }),
    },
  };
}
function runSolver(mode) {
  const { us, N, prob } = buildProblem(mode);
  if (!us.length) { toast('Yerleştirilecek ders yok; önce ders dağıtımını girin.', true); return; }
  const sv = Solver.create(prob, { seed: (Date.now() % 100000) + 1, improveMs: +($('#svTime') || {}).value || 5000 });
  const busy = $('#busy'); busy.hidden = false; ui.stop = false;
  (function tick() {
    sv.step(50);
    const pr = sv.progress();
    $('#busyText').textContent = pr.phase === 'construct' ? `Dersler yerleştiriliyor… ${pr.placed} / ${pr.total} saat (deneme ${pr.attempt})` : `Boş saatler azaltılıyor… %${Math.round(pr.frac * 100)}`;
    if (ui.stop && !sv.done) sv.finish();
    if (!sv.done) { setTimeout(tick, 0); return; }
    const res = sv.result(), days = allDays(), np = {};
    res.pos.forEach((s, i) => { if (s >= 0) { const o = S.placements[us[i].key]; np[us[i].key] = { d: days[(s / N) | 0], p: s % N, locked: !!(o && o.locked) }; } });
    S.placements = np; busy.hidden = true; commit();
    const left = sum(res.unplaced.map(i => us[i].len));
    toast(left ? `${left} ders saati yerleştirilemedi; sağdaki listeden elle yerleştirin ya da kısıtları gevşetin. Sınıflarda ${res.classGaps}, öğretmenlerde ${res.teacherGaps} boş saat.`
      : `Bütün dersler yerleşti. Sınıflarda ${res.classGaps}, öğretmenlerde ${res.teacherGaps} boş saat.`, left > 0);
  })();
}

// ---------- çıktı ----------
function entTable(view, ent, occ, P) {
  const vis = visP(P, view === 'c' ? ent.shiftId : ''), days = allDays(), o = occ[view][ent.id] || {};
  let hrs = 0, rows = '';
  vis.forEach((p, i) => {
    const prev = vis[i - 1];
    if (prev && (p.shiftId !== prev.shiftId || (p.lunchBefore && p.okN))) rows += `<tr class="psep"><td colspan="${days.length + 1}">${p.shiftId !== prev.shiftId ? esc(get('shifts', p.shiftId).name) : 'Öğle arası'}</td></tr>`;
    rows += `<tr><th>${p.no}<small>${p.okN ? fmt(p.start) + '–' + fmt(p.end) : 'yalnız kurs'}</small></th>${days.map(d => {
      if (!pOK(p, d)) return '<td class="na"></td>';
      const u = o[d + '-' + p.idx]; if (!u) return '<td></td>';
      hrs++; const a = u.a, sub = get('subjects', a.subjectId), room = a.roomId ? ' · ' + nm(get('rooms', a.roomId)) : '';
      const l2 = view === 'c' ? names('teachers', a.teacherIds, true) : view === 't' ? names('classes', a.classIds, true) : names('classes', a.classIds, true) + ' · ' + names('teachers', a.teacherIds);
      return `<td style="background:${sub ? sub.color : '#eee'}"><b>${esc(sub ? sub.name : '?')}</b><small>${esc(l2 + (view === 'r' ? '' : room))}</small>${isCDay(d) && cDiff(p) ? `<small>${tOf(p, d)}</small>` : ''}</td>`;
    }).join('')}</tr>`;
  });
  const kind = view === 'c' ? 'Sınıfı' : view === 't' ? '' : 'Dersliği';
  return `<section class="page"><h3>${esc(S.school.name)} ${esc(S.school.year)} · ${esc(ent.name)} ${kind} Haftalık Ders Programı <small>${hrs} saat</small></h3>
    <table class="pt"><tr><th></th>${days.map(d => `<th>${DAYS[d]}${isCDay(d) ? ' (kurs)' : ''}</th>`).join('')}</tr>${rows}</table></section>`;
}
function sheet(view, occ, P) {
  const days = allDays(), list = (view === 'tc' ? S.teachers : S.classes), k = view === 'tc' ? 't' : 'c';
  const txt = u => view === 'tc' ? names('classes', u.a.classIds, true) : nm(get('subjects', u.a.subjectId)) + ' ' + names('teachers', u.a.teacherIds);
  // Her günün sütunları o günde var olan ders saatleridir (kurs günlerinde sayı farklı olabilir).
  const cols = days.flatMap(d => P.filter(p => pOK(p, d)).map((p, i) => ({ d, p, first: i === 0 })));
  const rows = list.map(e => [e.name].concat(cols.map(c => { const u = (occ[k][e.id] || {})[c.d + '-' + c.p.idx]; return u ? txt(u) : ''; })));
  const multi = S.school.shifts.length > 1;
  return { days: days.map(d => ({ name: DAYS[d] + (isCDay(d) ? ' (kurs)' : ''), n: cols.filter(c => c.d === d).length })).filter(x => x.n), cols, rows,
    label: c => (multi ? get('shifts', c.p.shiftId).name[0] : '') + c.p.no };
}
function vCikti() {
  const occ = buildOcc(), P = periods();
  const kinds = [['c', 'Sınıf programları'], ['t', 'Öğretmen programları'], ['r', 'Derslik programları'], ['tc', 'Çarşaf: öğretmenler'], ['cc', 'Çarşaf: sınıflar']];
  let body;
  if (ui.out.length === 1) {
    const list = { c: S.classes, t: S.teachers, r: S.rooms }[ui.out];
    body = list.map(e => entTable(ui.out, e, occ, P)).join('') || '<p class="empty">Kayıt yok.</p>';
  } else {
    const sh = sheet(ui.out, occ, P);
    body = `<section class="page"><h3>${esc(S.school.name)} ${esc(S.school.year)} · ${ui.out === 'tc' ? 'Öğretmen' : 'Sınıf'} Çarşaf Programı</h3><div class="scroll"><table class="pt sheet">
      <tr><th rowspan="2"></th>${sh.days.map(d => `<th colspan="${d.n}" class="ds">${d.name}</th>`).join('')}</tr><tr>${sh.cols.map(c => `<th class="${c.first ? 'ds' : ''}">${esc(sh.label(c))}</th>`).join('')}</tr>
      ${sh.rows.map(r => `<tr><th>${esc(r[0])}</th>${r.slice(1).map((c, i) => `<td class="${sh.cols[i].first ? 'ds' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div></section>`;
  }
  return `<div class="toolbar noprint"><select data-ui="out">${kinds.map(([k, l]) => `<option value="${k}" ${ui.out === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <button class="primary" data-act="print">Yazdır / PDF</button><button data-act="csv">Excel için indir (CSV)</button></div><div class="printable">${body}</div>`;
}
function csvOut() {
  const occ = buildOcc(), P = periods(), q = v => '"' + String(v).replace(/"/g, '""') + '"';
  let rows;
  if (ui.out.length === 2) { const sh = sheet(ui.out, occ, P); rows = [[''].concat(sh.cols.map(c => DAYS[c.d] + ' ' + sh.label(c)))].concat(sh.rows); }
  else {
    rows = [['Gün', 'Ders saati', 'Başlangıç', 'Bitiş', 'Sınıf', 'Ders', 'Öğretmen', 'Derslik', 'Tür']];
    for (const u of units()) { const pl = S.placements[u.key]; if (!pl) continue; for (let k = 0; k < u.len; k++) { const p = P[pl.p + k], tt = tOf(p, pl.d).split('–'); rows.push([DAYS[pl.d], p.no, tt[0], tt[1], names('classes', u.a.classIds, true), (get('subjects', u.a.subjectId) || {}).name || '', names('teachers', u.a.teacherIds, true), u.a.roomId ? names('rooms', [u.a.roomId], true) : '', u.a.kurs ? 'Kurs' : 'Ders']); } }
    rows = [rows[0]].concat(rows.slice(1).sort((a, b) => DAYS.indexOf(a[0]) - DAYS.indexOf(b[0]) || String(a[4]).localeCompare(b[4], 'tr', { numeric: true }) || a[2].localeCompare(b[2])));
  }
  download('ders-programi.csv', '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}

// ---------- yedek ----------
const ghCfg = () => { try { return Object.assign({ owner: '', repo: '', branch: '', path: 'ders-programi.json', token: '' }, JSON.parse(localStorage.getItem(GHKEY) || '{}')); } catch (e) { return { owner: '', repo: '', branch: '', path: 'ders-programi.json', token: '' }; } };
function vYedek() {
  const g = ghCfg(), inp = (f, l, w, t) => `<label>${l}<input type="${t || 'text'}" data-gh="${f}" value="${esc(g[f])}" style="width:${w}px" autocomplete="off"></label>`;
  return `<section class="panel"><h2>GitHub yedeği</h2>
    <p class="hint">Veriler bu tarayıcıda durur. Yedekle düğmesi hepsini GitHub'daki gizli deponuza tek dosya olarak yazar; her yedek ayrı bir sürüm olarak saklanır. Başka bir cihazda aynı bilgileri girip "GitHub'dan geri yükle" ile kaldığınız yerden sürdürürsünüz.</p>
    <div class="row">${inp('owner', 'GitHub kullanıcı adı', 170)}${inp('repo', 'Depo adı (gizli depo)', 190)}${inp('path', 'Dosya adı', 190)}${inp('branch', 'Dal (boş = varsayılan)', 130)}</div>
    <div class="row">${inp('token', 'Erişim belirteci (token)', 380, 'password')}</div>
    <p class="hint">Belirteç yalnızca bu tarayıcıda saklanır, yedek dosyasına yazılmaz. GitHub → Settings → Developer settings → Fine-grained tokens yolundan, yalnız yedek deposuna "Contents: Read and write" izni vererek oluşturun.</p>
    <div class="row"><button class="primary" data-act="ghSave">GitHub'a yedekle</button><button data-act="ghLoad">GitHub'dan geri yükle</button><span id="ghMsg" class="hint">${S.lastBackup ? 'Son yedek: ' + new Date(S.lastBackup).toLocaleString('tr-TR') : ''}</span></div></section>
  <section class="panel"><h2>Dosya olarak yedek</h2><div class="row"><button data-act="jsonSave">Yedek dosyası indir</button><button data-act="jsonLoad">Yedek dosyası yükle</button><input type="file" id="file" accept=".json,application/json" hidden></div></section>
  <section class="panel"><h2>Örnek ve sıfırlama</h2><p class="hint">Örnek veri, seçili öğretim şekline göre 8 şubeli bir ortaokul kurar; programı denemek için kullanın.</p>
    <div class="row"><button data-act="sample">Örnek veri yükle</button><button class="danger" data-act="wipe">Bütün veriyi sil</button></div></section>`;
}
const b64e = s => { const b = new TextEncoder().encode(s); let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(o); };
async function ghCall(method, body, raw) {
  const g = ghCfg();
  if (!g.owner || !g.repo || !g.token || !g.path) throw new Error('Kullanıcı adı, depo, dosya adı ve belirteç alanlarını doldurun.');
  const url = `https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}/contents/${g.path.split('/').map(encodeURIComponent).join('/')}` + (method === 'GET' && g.branch ? '?ref=' + encodeURIComponent(g.branch) : '');
  if (body && g.branch) body.branch = g.branch;
  const r = await fetch(url, { method, cache: 'no-store', headers: { Authorization: 'Bearer ' + g.token, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 404 && method === 'GET') return null;
  if (r.status === 401) throw new Error('Belirteç geçersiz ya da süresi dolmuş.');
  if (r.status === 403 || r.status === 404) throw new Error('Depoya erişilemedi; depo adını ve belirtecin "Contents" iznini denetleyin.');
  if (!r.ok) throw new Error('GitHub hatası: ' + r.status);
  return raw ? r.text() : r.json();
}
async function ghSave() {
  const msg = $('#ghMsg'); msg.textContent = 'Yedekleniyor…';
  try {
    const cur = await ghCall('GET');
    const copy = Object.assign({}, S, { lastBackup: new Date().toISOString(), dirty: false });
    await ghCall('PUT', { message: 'Yedek ' + new Date().toLocaleString('tr-TR'), content: b64e(JSON.stringify(copy, null, 1)), sha: cur ? cur.sha : undefined });
    S.lastBackup = copy.lastBackup; S.dirty = false;
    commit(true, true); toast('GitHub\'a yedeklendi.');
  } catch (e) { msg.textContent = ''; toast(e.message, true); }
}
async function ghLoad() {
  if (!confirm('Bu tarayıcıdaki veriler GitHub\'daki yedekle değiştirilecek. Sürdürülsün mü?')) return;
  try {
    const t = await ghCall('GET', null, true);
    if (t == null) throw new Error('Depoda yedek dosyası bulunamadı.');
    S = migrate(JSON.parse(t)); S.dirty = false; commit(true, true); toast('Yedek geri yüklendi.');
  } catch (e) { toast(e.message, true); }
}

function loadSample() {
  const type = S.school.type, b = blank(type);
  b.school = JSON.parse(JSON.stringify(S.school));
  if (!b.school.name) b.school.name = 'Örnek Ortaokulu';
  const sh = b.school.shifts;
  const subs = [['Türkçe', 'TÜR', 6, '2+2+2', 2], ['Matematik', 'MAT', 5, '2+2+1', 2], ['Fen Bilimleri', 'FEN', 4, '2+2', 2], ['Sosyal Bilgiler', 'SOS', 3, '2+1', 1], ['İngilizce', 'İNG', 4, '2+2', 2], ['Din Kültürü', 'DİN', 2, '2', 1], ['Beden Eğitimi', 'BED', 2, '2', 1], ['Görsel Sanatlar', 'GÖR', 1, '1', 1], ['Müzik', 'MÜZ', 1, '1', 1], ['Bilişim', 'BİL', 2, '2', 1]];
  const ad = ['Ayşe Yılmaz', 'Mehmet Kaya', 'Fatma Demir', 'Ali Çelik', 'Zeynep Şahin', 'Mustafa Yıldız', 'Elif Öztürk', 'Hasan Aydın', 'Emine Arslan', 'Hüseyin Doğan', 'Merve Kılıç', 'İbrahim Aslan', 'Selin Çetin', 'Osman Kara'];
  b.rooms = [{ id: uid(), name: 'Spor Salonu' }, { id: uid(), name: 'Bilişim Sınıfı' }];
  b.classes = ['5/A', '5/B', '6/A', '6/B', '7/A', '7/B', '8/A', '8/B'].map((n, i) => ({ id: uid(), name: n, shiftId: sh[sh.length > 1 ? (i < 4 ? 0 : 1) % sh.length : 0].id }));
  let ti = 0;
  subs.forEach(([name, short, hours, blocks, nT], si) => {
    const s = { id: uid(), name, short, color: PALETTE[si % PALETTE.length] }; b.subjects.push(s);
    const ts = [];
    for (let k = 0; k < nT; k++) { const n = ad[ti++ % ad.length]; const t = { id: uid(), name: n, short: n.split(' ').map(w => w[0]).join(''), branch: name, maxDaily: 0 }; b.teachers.push(t); ts.push(t); }
    b.classes.forEach((c, ci) => b.assignments.push({ id: uid(), subjectId: s.id, classIds: [c.id], teacherIds: [ts[ci % ts.length].id], hours, blocks, roomId: short === 'BED' ? b.rooms[0].id : short === 'BİL' ? b.rooms[1].id : '' }));
  });
  b.started = true; S = b; ui.ent = ''; commit(); toast('Örnek veri yüklendi. Program sekmesinde "Otomatik yerleştir"e basın.');
}

// ---------- pencereler ----------
function openDlg(html) { const d = $('#dlg'); d.innerHTML = html; if (!d.open) d.showModal(); }
function unDlg() {
  const { coll: n, id } = ui.un, o = get(n, id), P = periods(), days = allDays();
  const vis = visP(P, n === 'classes' ? o.shiftId : ''), multi = S.school.shifts.length > 1 && n !== 'classes';
  o.un = o.un || {};
  openDlg(`<h3>${esc(o.name)} — kapalı saatler</h3><p class="hint">Ders konulmayacak saatlere tıklayın. Gün ya da saat başlığına tıklamak bütün sütunu ya da satırı değiştirir.</p>
    <table class="un"><tr><th></th>${days.map(d => `<th data-act="unLine" data-d="${d}">${DSHORT[d]}</th>`).join('')}</tr>
    ${vis.map(p => `<tr><th data-act="unLine" data-p="${p.idx}">${multi ? esc(get('shifts', p.shiftId).name) + ' ' : ''}${p.no} <small>${p.okN ? fmt(p.start) : 'kurs'}</small></th>${days.map(d => pOK(p, d) ? `<td class="${o.un[d + '-' + p.idx] ? 'off' : ''}" data-act="unCell" data-k="${d}-${p.idx}"></td>` : '<td class="na"></td>').join('')}</tr>`).join('')}</table>
    <div class="dlg-btns"><button class="primary" data-act="dlgClose">Tamam</button></div>`);
}
function asgDlg(id, keep) {
  const a = id ? get('assignments', id) : Object.assign({ subjectId: '', classIds: ui.fAsg.startsWith('c:') ? [ui.fAsg.slice(2)] : [], teacherIds: ui.fAsg.startsWith('t:') ? [ui.fAsg.slice(2)] : [], hours: 2, blocks: '', roomId: '' }, keep || {});
  const boxes = (n, sel, name) => `<div class="boxes">${S[n].slice().sort(trSort).map(o => `<label class="chk"><input type="checkbox" name="${name}" value="${o.id}" ${sel.includes(o.id) ? 'checked' : ''}>${esc(o.name)}${n === 'teachers' && o.branch ? ` <small>${esc(o.branch)}</small>` : ''}</label>`).join('') || '<span class="empty">Kayıt yok.</span>'}</div>`;
  openDlg(`<form id="asgForm" data-id="${id || ''}"><h3>${id ? 'Dersi düzenle' : 'Ders ekle'}</h3>
    <div class="row"><label>Ders<select name="subject"><option value="">Seçin…</option>${S.subjects.slice().sort(trSort).map(s => `<option value="${s.id}" ${a.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    <label>Haftalık saat<input type="number" name="hours" min="1" max="40" value="${a.hours}" style="width:80px"></label>
    <label>Dağılım<input name="blocks" value="${esc(a.blocks || '')}" placeholder="otomatik (ör. 2+2+1)" style="width:170px"></label>
    <label>Derslik<select name="room"><option value="">Kendi sınıfı</option>${S.rooms.map(r => `<option value="${r.id}" ${a.roomId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label></div>
    <label class="chk"><input type="checkbox" name="kurs" ${a.kurs ? 'checked' : ''}>Kurs dersi <small>yalnızca kurs günlerine yerleşir${cDays().length ? ' (' + cDays().map(d => DAYS[d]).join(', ') + ')' : '; kurs günü henüz seçilmedi, Okul adımından seçin'}</small></label>
    <h4>Sınıf <small>birden çok seçerseniz sınıflar bu derste birleşir</small></h4>${boxes('classes', a.classIds, 'cls')}
    <h4>Öğretmen <small>birden çok seçerseniz derse birlikte girerler</small></h4>${boxes('teachers', a.teacherIds, 'tch')}
    <div class="dlg-btns"><button type="button" data-act="dlgClose">Vazgeç</button>${id ? '' : '<button type="button" data-act="asgSave" data-again="1">Kaydet ve yeni</button>'}<button type="button" class="primary" data-act="asgSave">Kaydet</button></div></form>`);
}

// ---------- eylemler ----------
const A = {
  preset(el) {
    if (Object.keys(S.placements).length && !confirm('Öğretim şekli değişirse yerleştirilmiş program silinir. Sürdürülsün mü?')) return;
    S.school.type = el.dataset.type; S.school.shifts = mkShifts(el.dataset.type);
    S.placements = {}; for (const n of ['teachers', 'classes', 'rooms']) for (const e of S[n]) e.un = {};
    S.classes.forEach(c => { c.shiftId = S.school.shifts[0].id; });
    commit();
  },
  addShift() { withShiftChange(() => S.school.shifts.push({ id: uid(), name: 'Yeni devre', start: '13:00', periods: 6, lessonMin: 40, breakMin: 10, lunchAfter: 0, lunchMin: 0 })); commit(); },
  delShift(el) {
    if (!confirm('Devre silinsin mi? Bu devredeki sınıflar ilk devreye alınır.')) return;
    withShiftChange(() => { S.school.shifts = S.school.shifts.filter(s => s.id !== el.dataset.id); });
    S.classes.forEach(c => { if (!get('shifts', c.shiftId)) c.shiftId = S.school.shifts[0].id; });
    commit();
  },
  add(el) {
    const n = el.dataset.coll, o = { id: uid(), name: '' };
    if (n === 'subjects') o.color = PALETTE[S.subjects.length % PALETTE.length];
    if (n === 'classes') o.shiftId = S.school.shifts[0].id;
    S[n].push(o); commit();
    const ins = $$(`input[data-coll="${n}"][data-f="name"]`); if (ins.length) ins[ins.length - 1].focus();
  },
  bulk(el) {
    const n = el.dataset.coll, lines = $('#bulk').value.split('\n').map(x => x.trim()).filter(Boolean);
    for (const name of lines) {
      const o = { id: uid(), name };
      if (n === 'subjects') { o.color = PALETTE[S.subjects.length % PALETTE.length]; o.short = autoShort(n, name); }
      if (n === 'teachers') o.short = autoShort(n, name);
      if (n === 'classes') o.shiftId = S.school.shifts[0].id;
      S[n].push(o);
    }
    commit(); toast(lines.length + ' kayıt eklendi.');
  },
  del(el) {
    const n = el.dataset.coll, id = el.dataset.id, o = get(n, id);
    const used = S.assignments.filter(a => n === 'subjects' ? a.subjectId === id : n === 'teachers' ? a.teacherIds.includes(id) : n === 'classes' ? a.classIds.includes(id) : a.roomId === id);
    if (used.length && !confirm(`"${o.name}" ${used.length} derste kullanılıyor. Silinirse bu derslerden çıkarılır ve yerleşimleri kaldırılır. Silinsin mi?`)) return;
    for (const a of used) {
      dropPlacements(a.id);
      if (n === 'teachers') a.teacherIds = a.teacherIds.filter(x => x !== id);
      if (n === 'classes') a.classIds = a.classIds.filter(x => x !== id);
      if (n === 'rooms') a.roomId = '';
    }
    S.assignments = S.assignments.filter(a => a.subjectId !== (n === 'subjects' ? id : null) && a.classIds.length);
    S[n] = S[n].filter(x => x.id !== id); commit();
  },
  un(el) { ui.un = { coll: el.dataset.coll, id: el.dataset.id }; unDlg(); },
  unCell(el) { const o = get(ui.un.coll, ui.un.id), k = el.dataset.k; if (o.un[k]) delete o.un[k]; else o.un[k] = 1; commit(false); unDlg(); },
  unLine(el) {
    const o = get(ui.un.coll, ui.un.id), keys = $$('#dlg td[data-k]').map(t => t.dataset.k).filter(k => el.dataset.d != null ? k.split('-')[0] === el.dataset.d : k.split('-')[1] === el.dataset.p);
    const all = keys.every(k => o.un[k]);
    keys.forEach(k => { if (all) delete o.un[k]; else o.un[k] = 1; });
    commit(false); unDlg();
  },
  dlgClose() { $('#dlg').close(); ui.un = null; render(); },
  asg(el) { asgDlg(el.dataset.id); },
  asgSave(el) {
    const f = $('#asgForm'), id = f.dataset.id, fd = new FormData(f);
    const n = { subjectId: fd.get('subject'), classIds: fd.getAll('cls'), teacherIds: fd.getAll('tch'), hours: Math.max(1, parseInt(fd.get('hours'), 10) || 1), blocks: String(fd.get('blocks') || '').replace(/\s/g, ''), roomId: fd.get('room') || '', kurs: !!fd.get('kurs') };
    if (!n.subjectId) { toast('Ders seçin.', true); return; }
    if (!n.classIds.length) { toast('En az bir sınıf seçin.', true); return; }
    if (n.blocks && sum(n.blocks.split('+').map(x => parseInt(x, 10) || 0)) !== n.hours) { toast('Dağılımın toplamı haftalık saate eşit olmalı (ör. 5 saat için 2+2+1).', true); return; }
    if (new Set(n.classIds.map(c => get('classes', c).shiftId)).size > 1) { toast('Birleştirilen sınıflar aynı devrede olmalı.', true); return; }
    if (id) { const a = get('assignments', id); dropPlacements(id); Object.assign(a, n); } else S.assignments.push(Object.assign({ id: uid() }, n));
    if (el.dataset.again) { commit(false); asgDlg('', { classIds: n.classIds }); toast('Kaydedildi.'); } else { $('#dlg').close(); commit(); }
  },
  delAsg(el) { if (confirm('Bu ders dağıtımdan silinsin mi?')) { S.assignments = S.assignments.filter(a => a.id !== el.dataset.id); commit(); } },
  pview(el) { ui.view = el.dataset.v; ui.ent = ''; ui.sel = null; render(); },
  pstep(el) { const l = { c: S.classes, t: S.teachers, r: S.rooms }[ui.view]; if (!l.length) return; const i = l.findIndex(x => x.id === ui.ent); ui.ent = l[(i + +el.dataset.n + l.length) % l.length].id; ui.sel = null; render(); },
  lock(el) { const k = el.closest('.card').dataset.u, pl = S.placements[k]; if (pl) { pl.locked = !pl.locked; commit(); } },
  unplace(el) { delete S.placements[el.closest('.card').dataset.u]; ui.sel = null; commit(); },
  solve(el) {
    const mode = el.dataset.mode;
    if (mode === 'all' && Object.values(S.placements).some(p => !p.locked) && !confirm('Kilitli olmayan bütün dersler yeniden dağıtılacak. Sürdürülsün mü?')) return;
    runSolver(mode);
  },
  stop() { ui.stop = true; },
  clearSched() {
    if (!confirm('Kilitli olmayan bütün dersler programdan çıkarılacak. Sürdürülsün mü?')) return;
    for (const k in S.placements) if (!S.placements[k].locked) delete S.placements[k];
    commit();
  },
  print() { window.print(); },
  csv: csvOut,
  ghSave, ghLoad,
  jsonSave() {
    S.lastBackup = new Date().toISOString(); S.dirty = false;
    download('ders-programi-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(S, null, 1));
    commit(true, true);
  },
  start() { S.started = true; ui.tab = 'okul'; commit(); go('okul'); },
  startSample() { loadSample(); go('program'); },
  startRestore() { S.started = true; commit(false, true); go('yedek'); },
  jsonLoad() { $('#file').click(); },
  sample() { if ((S.assignments.length || S.teachers.length) && !confirm('Var olan veriler örnek veriyle değiştirilecek. Sürdürülsün mü?')) return; loadSample(); },
  wipe() { if (confirm('Bütün okul verisi bu tarayıcıdan silinecek. Emin misiniz?')) { S = blank('tamgun'); commit(); } },
  undo() { if (!undo.length) return; lastJSON = undo.pop(); S = JSON.parse(lastJSON); S.dirty = true; lastJSON = JSON.stringify(S); localStorage.setItem(KEY, lastJSON); ui.sel = null; render(); },
};
function autoShort(n, name) {
  if (n === 'teachers') return name.split(/\s+/).map(w => w[0] || '').join('').toLocaleUpperCase('tr');
  return name.replace(/\s+/g, '').slice(0, 3).toLocaleUpperCase('tr');
}

// ---------- olaylar ----------
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) { if (a.tagName === 'A') e.preventDefault(); if (A[a.dataset.act]) A[a.dataset.act](a, e); return; }
  if (ui.tab !== 'program') return;
  const c = e.target.closest('.card');
  if (c) { ui.sel = ui.sel === c.dataset.u ? null : c.dataset.u; render(); return; }
  const cell = e.target.closest('.cell');
  if (cell && ui.sel) placeUnit(ui.sel, +cell.dataset.d, +cell.dataset.p);
});
document.addEventListener('change', e => {
  const t = e.target, ds = t.dataset;
  if (ds.coll) {
    const o = get(ds.coll, ds.id), f = ds.f; if (!o) return;
    const v = t.type === 'number' ? Math.max(0, parseInt(t.value, 10) || 0) : t.value.trim();
    if (ds.coll === 'shifts') {
      withShiftChange(() => { o[f] = f === 'periods' ? Math.min(20, Math.max(1, v)) : f === 'coursePeriods' ? Math.min(20, v) : v; });
      if (f.startsWith('course') && t.type === 'number' && !o[f]) t.value = '';
      commit(false); $('#zil').innerHTML = zil();
    } else {
      o[f] = v;
      if (f === 'name' && !o.short && ds.coll !== 'classes' && ds.coll !== 'rooms') { o.short = autoShort(ds.coll, v); const s = $(`input[data-coll="${ds.coll}"][data-id="${ds.id}"][data-f="short"]`); if (s) s.value = o.short; }
      commit(false);
    }
  } else if (ds.brk) {
    const [sid, k] = ds.brk.split(':'), sh = get('shifts', sid); if (!sh) return;
    const v = t.value === '' ? sh.breakMin : Math.max(0, parseInt(t.value, 10) || 0);
    sh.breaks = sh.breaks || {};
    if (v === sh.breakMin) delete sh.breaks[k]; else sh.breaks[k] = v;
    t.value = v; t.classList.toggle('own', v !== sh.breakMin);
    commit(false); refreshTimes();
  } else if (ds.chg) { S.school[ds.chg] = t.value.trim(); commit(false); }
  else if (ds.day != null) {
    const d = +ds.day, kurs = ds.kind === 'c';
    const s = new Set(S.school.days), c = new Set(cDays());
    const mine = kurs ? c : s, other = kurs ? s : c;
    if (t.checked) { mine.add(d); other.delete(d); } else mine.delete(d);
    if (!s.size) { toast('En az bir ders günü seçili olmalı.', true); render(); return; }
    S.school.days = Array.from(s).sort((a, b) => a - b); S.school.courseDays = Array.from(c).sort((a, b) => a - b);
    commit();
  } else if (ds.ui) { ui[ds.ui] = t.value; ui.sel = null; render(); }
  else if (ds.gh) { const g = ghCfg(); g[ds.gh] = t.value.trim(); localStorage.setItem(GHKEY, JSON.stringify(g)); }
  else if (t.id === 'file' && t.files[0]) {
    t.files[0].text().then(txt => {
      const j = JSON.parse(txt);
      if (!j.school || !Array.isArray(j.assignments)) throw new Error('x');
      S = migrate(j); S.dirty = false; commit(true, true); toast('Yedek dosyası yüklendi.');
    }).catch(() => toast('Bu dosya geçerli bir yedek değil.', true));
  }
});
document.addEventListener('dragstart', e => {
  const c = e.target.closest && e.target.closest('.card'); if (!c) return;
  ui.drag = c.dataset.u; e.dataTransfer.setData('text/plain', ui.drag); e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => markCells(ui.drag), 0);
});
document.addEventListener('dragend', () => { ui.drag = null; if (!ui.sel) clearMarks(); });
document.addEventListener('dragover', e => { if (ui.drag && e.target.closest && e.target.closest('.cell.ok,.pool')) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (!ui.drag) return;
  const k = ui.drag, cell = e.target.closest('.cell'), pool = e.target.closest('.pool');
  e.preventDefault(); ui.drag = null;
  if (cell) placeUnit(k, +cell.dataset.d, +cell.dataset.p);
  else if (pool && S.placements[k]) { delete S.placements[k]; commit(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sel) { ui.sel = null; render(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); A.undo(); }
});
$('#dlg').addEventListener('cancel', () => { ui.un = null; setTimeout(render, 0); });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.some(x => x[0] === t)) { ui.tab = t; ui.sel = null; render(); window.scrollTo(0, 0); } });
render();
