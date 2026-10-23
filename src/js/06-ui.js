/* ================= UI ================= */
const $ = id => document.getElementById(id);
const KEY = 'root-access-progress-v1';
let P = { done: [], cur: LESSONS[0].id };
try { const raw = localStorage.getItem(KEY); if (raw) { const v = JSON.parse(raw); if (v && Array.isArray(v.done)) P = Object.assign(P, v); } } catch (e) { }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } };
const idx = id => LESSONS.findIndex(l => l.id === id);
const unlocked = i => i === 0 || P.done.includes(LESSONS[i - 1].id) || P.done.includes(LESSONS[i].id);
let L = null, nudgeShown = 0, objState = [], suppress = 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderRail() {
  const r = $('rail'); r.innerHTML = '';
  MODULES.forEach((m, mi) => {
    const ls = LESSONS.map((l, i) => [l, i]).filter(([l]) => l.mod === mi); const done = ls.filter(([l]) => P.done.includes(l.id)).length;
    const box = document.createElement('div'); box.className = 'mod';
    box.innerHTML = `<h3><span>${esc(m)}</span><span>${done}/${ls.length}</span></h3>`;
    ls.forEach(([l, i]) => {
      const b = document.createElement('button'); b.type = 'button'; const isDone = P.done.includes(l.id), open = unlocked(i);
      b.className = 'les' + (isDone ? ' done' : open ? ' open' : ''); if (!open) b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-current', L && L.id === l.id ? 'true' : 'false');
      b.innerHTML = open || isDone ? `<span class="led"></span><span>${esc(l.title)}</span>` : `<span class="lk" aria-hidden="true">&#9679;</span><span>${esc(l.title)}</span>`;
      if (!open) b.style.color = 'var(--muted)';
      b.onclick = () => { if (!open) { toast('Clear "' + LESSONS[i - 1].title + '" first.'); return; } $('rail').classList.remove('on'); load(l.id); };
      box.appendChild(b);
    });
    r.appendChild(box);
  });
  const n = P.done.length; $('meterText').textContent = `${n} / ${LESSONS.length} cleared`; $('meterFill').style.width = (n / LESSONS.length * 100) + '%';
}
function renderLesson() {
  const i = idx(L.id); const inMod = LESSONS.filter(l => l.mod === L.mod); const pos = inMod.indexOf(L) + 1;
  const sevName = { 1: 'SEV1', 2: 'SEV2', 3: 'SEV3', 4: 'TASK' }[L.ticket.sev];
  const done = P.done.includes(L.id);
  const next = LESSONS[i + 1];
  $('lesson').innerHTML = `
    <div><div class="eyebrow">${esc(MODULES[L.mod])} · Lesson ${pos} of ${inMod.length}</div><h1>${esc(L.title)}</h1></div>
    <div class="ticket"><div class="th"><span class="sev s${L.ticket.sev}">${sevName}</span><span>${esc(L.ticket.id)}</span><span style="margin-left:auto">${esc(L.host)}</span></div><div class="tb">${L.ticket.text}</div></div>
    <div class="sec"><h2>Objectives</h2><ul class="obj" id="obj">${L.objectives.map((o, k) => `<li id="o${k}"><span class="led"></span><span>${o.t}</span></li>`).join('')}</ul></div>
    <div id="cleared"></div>
    <div class="sec"><h2>Field notes</h2><div class="notes">${L.notes}</div></div>
    <div class="sec"><h2>Tools for this job</h2><div class="tools">${L.tools.map(t => `<span>${esc(t)}</span>`).join('')}</div></div>
    <div class="sec"><h2>Stuck?</h2><div id="nudges" style="display:grid;gap:8px"></div><div class="row" style="margin-top:8px"><button class="ghost" type="button" id="nudgeBtn">Get a nudge</button><span style="font-size:13px;color:var(--muted)">Nudges point the way. They never give the answer.</span></div></div>`;
  $('nudgeBtn').onclick = () => { if (nudgeShown < L.nudges.length) { nudgeShown++; drawNudges(); } };
  drawNudges(); updateObjectives(true);
  if (done) showCleared(false);
  $('lesson').scrollTop = 0;
}
function drawNudges() { const box = $('nudges'); if (!box) return; box.innerHTML = L.nudges.slice(0, nudgeShown).map(n => `<p class="nudge">${esc(n)}</p>`).join(''); const b = $('nudgeBtn'); if (b) { b.disabled = nudgeShown >= L.nudges.length; b.textContent = nudgeShown >= L.nudges.length ? 'No more nudges' : nudgeShown ? 'Another nudge' : 'Get a nudge'; } }
function evalObjectives() { return L.objectives.map(o => { try { return !!o.ok(); } catch (e) { return false; } }); }
function updateObjectives(initial) {
  if (!L || !S) return; const st = evalObjectives();
  st.forEach((v, k) => { const li = $('o' + k); if (li) li.classList.toggle('ok', v); if (!initial && v && !objState[k]) termPrint(A.green('✔ objective complete: ') + stripTags(L.objectives[k].t)); });
  objState = st;
  if (st.every(Boolean) && !P.done.includes(L.id)) complete();
}
const stripTags = s => s.replace(/<[^>]+>/g, '');
function complete() {
  P.done.push(L.id); save(); renderRail();
  termPrint(''); termPrint(A.green(A.bold('━━ LESSON CLEARED ━━ ')) + A.bold(L.title));
  const nx = LESSONS[idx(L.id) + 1]; termPrint(nx ? A.dim('Next lesson unlocked: ') + nx.title : A.green('That was the last lab. You worked through the whole course.'));
  showCleared(true);
}
function showCleared(fresh) {
  const nx = LESSONS[idx(L.id) + 1]; const box = $('cleared'); if (!box) return;
  box.innerHTML = `<div class="cleared"><b>${fresh ? 'Cleared.' : 'You cleared this one.'}</b><span>${nx ? 'Next up: ' + esc(nx.title) + (nx.mod !== L.mod ? ` (new module: ${esc(MODULES[nx.mod])})` : '') + '.' : 'Every lab is done. Replay any of them from the course map, or try solving one a different way.'} Write down in your log what broke and how you fixed it; that's your interview story.</span>${nx ? '<div class="row"><button class="btn acc" type="button" id="nextBtn">Next lesson</button><button class="ghost" type="button" id="replayBtn">Replay this lab</button></div>' : '<div class="row"><button class="ghost" type="button" id="replayBtn">Replay this lab</button></div>'}</div>`;
  if (nx) $('nextBtn').onclick = () => load(nx.id);
  $('replayBtn').onclick = () => resetLab();
}
function load(id) {
  const i = idx(id); if (i < 0 || !unlocked(i)) id = LESSONS[Math.max(0, LESSONS.findIndex((l, k) => !P.done.includes(l.id) && unlocked(k)))].id;
  L = LESSONS[idx(id)]; P.cur = L.id; save(); nudgeShown = 0; objState = [];
  suppress++; L.setup(); suppress--;
  termClear(); welcome(); renderRail(); renderLesson(); updatePrompt(); focusCmd();
}
function resetLab() { suppress++; L.setup(); suppress--; objState = []; termClear(); welcome(); termPrint(A.dim('Lab reset to its starting state.')); updateObjectives(true); if (P.done.includes(L.id)) showCleared(false); updatePrompt(); focusCmd(); }
function welcome() {
  const what = { 0: 'Ubuntu 24.04 LTS', 1: 'Ansible control node · managed hosts: web1, web2, db1', 2: 'kubectl configured for cluster "lab-cluster" (1 node)', 3: 'Prometheus + dashboards + incident tooling' }[L.mod];
  termPrint(A.dim(`Connected to ${L.host} · ${what}`));
  termPrint(A.dim('Type ') + A.cyan('help') + A.dim(' for commands, ') + A.cyan('man <command>') + A.dim(' for usage. Your objectives update as you work.'));
  if (L.intro) { termPrint(''); termPrint(L.intro()); }
  termPrint('');
}
/* ---------- terminal ---------- */
const out = $('out'), screen = $('screen'), input = $('cmd');
function ansiToHtml(s) { let cls = [], html = ''; const parts = s.split(/\x1b\[(\d+)m/); for (let i = 0; i < parts.length; i++) { if (i % 2) { const c = parts[i]; if (c === '0') cls = []; else cls.push('c' + c); continue; } if (!parts[i]) continue; html += cls.length ? `<span class="${cls.join(' ')}">${esc(parts[i])}</span>` : esc(parts[i]); } return html; }
function termPrint(text, cls) {
  if (suppress) return;
  const frag = document.createDocumentFragment();
  for (const line of String(text).split('\n')) { const d = document.createElement('div'); d.className = 'ln' + (cls === 'err' ? ' c31' : ''); d.innerHTML = ansiToHtml(line) || ''; frag.appendChild(d); }
  out.appendChild(frag);
  while (out.childNodes.length > 3000) out.removeChild(out.firstChild);
  screen.scrollTop = screen.scrollHeight;
}
function termClear() { out.innerHTML = ''; }
function promptHtml() { const home = S.user === 'root' ? '/root' : '/home/' + S.user; const p = S.cwd === home ? '~' : S.cwd.startsWith(home + '/') ? '~' + S.cwd.slice(home.length) : S.cwd; return `<span class="u">${esc(S.user)}@${esc(S.host)}</span>:<span class="p">${esc(p)}</span>${S.user === 'root' ? '#' : '$'} `; }
function updatePrompt() { $('prompt').innerHTML = promptHtml(); $('termTitle').textContent = `${S.user}@${S.host}: ${S.cwd}`; }
const hist = []; let hi = 0;
$('form').addEventListener('submit', e => {
  e.preventDefault(); const line = input.value; input.value = '';
  const d = document.createElement('div'); d.className = 'ln'; d.innerHTML = promptHtml() + esc(line); out.appendChild(d);
  if (line.trim()) { hist.push(line); S.hist.push(line); } hi = hist.length;
  if (line.trim()) runLine(line);
  updatePrompt(); onChange(); screen.scrollTop = screen.scrollHeight;
});
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowUp') { if (hi > 0) { hi--; input.value = hist[hi]; setTimeout(() => input.setSelectionRange(input.value.length, input.value.length)); } e.preventDefault(); }
  else if (e.key === 'ArrowDown') { if (hi < hist.length) { hi++; input.value = hist[hi] ?? ''; } e.preventDefault(); }
  else if (e.key === 'Tab') { e.preventDefault(); complete_(); }
  else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); termClear(); }
  else if (e.key === 'c' && e.ctrlKey && !window.getSelection().toString()) { e.preventDefault(); const d = document.createElement('div'); d.className = 'ln'; d.innerHTML = promptHtml() + esc(input.value) + '^C'; out.appendChild(d); input.value = ''; }
});
function complete_() {
  const v = input.value; const pos = input.selectionStart; const before = v.slice(0, pos); const m = /(\S*)$/.exec(before); const word = m[1]; const isFirst = !before.slice(0, before.length - word.length).trim();
  let cands;
  if (isFirst && !word.includes('/')) cands = Object.keys(CMDS).filter(c => c.startsWith(word)).map(c => c + ' ');
  else { const slash = word.lastIndexOf('/'); const dirPart = slash >= 0 ? word.slice(0, slash + 1) : ''; const base = word.slice(slash + 1); const dirAbs = norm(dirPart || '.'); if (N(dirAbs)?.t !== 'd') return; cands = kids(dirAbs).map(k => basename(k)).filter(n => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.'))).map(n => dirPart + n + (N(dirAbs === '/' ? '/' + n : dirAbs + '/' + n).t === 'd' ? '/' : ' ')); }
  if (!cands.length) return;
  if (cands.length === 1) { input.value = before.slice(0, before.length - word.length) + cands[0] + v.slice(pos); return; }
  let pre = cands[0]; for (const c of cands) while (!c.startsWith(pre)) pre = pre.slice(0, -1);
  if (pre.length > word.length) { input.value = before.slice(0, before.length - word.length) + pre + v.slice(pos); return; }
  const d = document.createElement('div'); d.className = 'ln'; d.innerHTML = promptHtml() + esc(v); out.appendChild(d); termPrint(cands.map(c => c.trim()).join('  '));
}
screen.addEventListener('mouseup', () => { if (!window.getSelection().toString()) focusCmd(); });
function focusCmd() { if (window.matchMedia('(pointer:fine)').matches) input.focus({ preventScroll: true }); }
$('resetBtn').onclick = () => resetLab();
$('mapBtn').onclick = () => $('rail').classList.toggle('on');
/* ---------- editor ---------- */
let ED = null;
function openEditor(e) {
  ED = Object.assign({}, e, { dirty: false, confirmExit: false }); $('edName').textContent = e.crontab ? '/tmp/crontab.dev' : (e.display || e.path) + (e.isNew ? '  (new file)' : '');
  $('edMod').textContent = ''; $('edStatus').textContent = e.crontab ? 'Editing your crontab. Save, then exit to install it.' : '';
  const ta = $('edText'); ta.value = e.content; $('edOv').hidden = false; ta.focus(); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
}
function edSave() {
  if (!ED) return; const text = $('edText').value;
  if (ED.crontab) { const bad = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).find(l => l.split(/\s+/).length < 6 || !l.split(/\s+/).slice(0, 5).every(f => /^[\d*,\-\/]+$/.test(f))); if (bad) { $('edStatus').textContent = `crontab: errors in crontab file, can't install: "${bad}" needs 5 time fields then a command`; return false; } S.crontab = text; $('edStatus').textContent = 'crontab: installing new crontab'; ED.dirty = false; $('edMod').textContent = ''; onChange(); return true; }
  const was = S.sudo; S.sudo = ED.sudo; const err = writeFile(ED.path, text); S.sudo = was;
  if (err) { $('edStatus').textContent = err === 'Permission denied' ? `[ Error writing ${ED.display}: Permission denied ]  This file belongs to root. Exit and open it with sudo nano.` : `[ Error writing ${ED.display}: ${err} ]${err.includes('No such') ? '  Create the folder first (mkdir -p).' : ''}`; return false; }
  ED.dirty = false; ED.isNew = false; $('edMod').textContent = ''; $('edStatus').textContent = `[ Wrote ${text.split('\n').length} lines ]`; onChange(); return true;
}
function edExit() { if (!ED) return; if (ED.dirty && !ED.confirmExit) { ED.confirmExit = true; $('edStatus').textContent = 'Unsaved changes. Press Save, or Exit again to discard them.'; return; } $('edOv').hidden = true; ED = null; updatePrompt(); focusCmd(); }
$('edText').addEventListener('input', () => { if (ED) { ED.dirty = true; ED.confirmExit = false; $('edMod').textContent = 'Modified'; } });
$('edText').addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); edSave(); }
  else if ((e.ctrlKey && k === 'x') || (e.ctrlKey && k === 'o' && edSave())) { e.preventDefault(); edExit(); }
  else if (e.key === 'Escape') { e.preventDefault(); edExit(); }
  else if (e.key === 'Tab') { e.preventDefault(); const ta = e.target, s = ta.selectionStart, en = ta.selectionEnd; ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 2; ED.dirty = true; $('edMod').textContent = 'Modified'; }
});
$('edSave').onclick = () => { edSave(); $('edText').focus(); };
$('edExit').onclick = () => edExit();
/* ---------- dashboard viewer ---------- */
const PAL = ['#d9822b', '#3a8fd9', '#2fa37a', '#c0567a', '#8a6fd1', '#7f8c99', '#c7a12a', '#4bb3c4'];
function fmtUnit(v, u) { if (!isFinite(v)) return fmtVal(v); switch (u) { case 'percent': return v.toFixed(1) + '%'; case 'percentunit': return (v * 100).toFixed(1) + '%'; case 'bytes': return human(v) + 'B'; case 'req/s': case 'reqps': return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + ' req/s'; case 's': return v < 1 ? (v * 1000).toFixed(0) + 'ms' : v.toFixed(2) + 's'; default: return fmtVal(v); } }
function thrColor(v, p) { const th = Array.isArray(p.thresholds) ? p.thresholds.map(Number).sort((a, b) => a - b) : null; if (!th || !th.length) return 'var(--ink)'; const inv = p.invert === true; const lvl = inv ? (v <= th[0] ? 2 : th[1] !== undefined && v <= th[1] ? 1 : 0) : (th[1] !== undefined && v >= th[1] ? 2 : v >= th[0] ? (th[1] !== undefined ? 1 : 2) : 0); return ['var(--ok)', 'var(--warn)', 'var(--bad)'][lvl]; }
let VARY = null;
const seriesName = l => { const e = Object.entries(l).filter(([k]) => k !== '__name__' && (!VARY || VARY.has(k))); return e.length ? e.map(([, v]) => v).join(' ') : 'value'; };
function varying(ls) { const keys = new Set(ls.flatMap(l => Object.keys(l))); const out = new Set(); keys.forEach(k => { if (k !== '__name__' && new Set(ls.map(l => l[k])).size > 1) out.add(k); }); return out.size ? out : null; }
function fmtAxis(v, u) { if (u === 'percent') return +v.toFixed(1) + '%'; if (u === 'percentunit') return +(v * 100).toFixed(1) + '%'; if (u === 'bytes') return human(v); if (u === 's') return v < 1 ? Math.round(v * 1000) + 'ms' : +v.toFixed(1) + 's'; return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(+v.toPrecision(3)); }
function openDash(name) {
  const d = S.mon.dashboards[name]; if (!d) return; S.flags.dashOpened = true; onChange();
  $('dvTitle').textContent = d.def.title; $('dvSub').textContent = 'Last 30 minutes · lab clock'; const g = $('dvGrid'); g.innerHTML = '';
  const now = simNow();
  for (const p of d.def.panels) {
    const box = document.createElement('div'); box.className = 'panel'; let body = '';
    try {
      if (p.type === 'timeseries') {
        const pts = []; for (let k = 30; k >= 0; k--) pts.push(pq(String(p.query), now - k * 60));
        const keys = new Map(); pts.forEach((r, x) => { if (r.type !== 'vector') return; r.s.forEach(sm => { const k = lkey(sm.l); if (!keys.has(k)) keys.set(k, { l: sm.l, v: Array(31).fill(null) }); keys.get(k).v[x] = sm.v; }); });
        const ser = [...keys.values()].slice(0, 8); VARY = varying(ser.map(x => x.l)); const all = ser.flatMap(s => s.v.filter(v => v !== null && isFinite(v)));
        if (!all.length) body = '<div class="err">No data</div>';
        else { const max = Math.max(...all) * 1.12 || 1, min = Math.min(0, Math.min(...all)); const X = i => 44 + i * (250 / 30), Y = v => 104 - (v - min) / (max - min) * 94;
          let svg = `<svg viewBox="0 0 300 124" role="img" aria-label="${esc(p.title)}">`;
          [0, 0.5, 1].forEach(f => { const v = min + (max - min) * f; svg += `<line x1="44" x2="294" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" stroke-width="1"/><text x="40" y="${Y(v) + 3}" text-anchor="end" font-size="8.5" fill="var(--muted)" font-family="JetBrains Mono, monospace">${esc(fmtAxis(v, p.unit))}</text>`; });
          ['-30m', '-15m', 'now'].forEach((t, i) => svg += `<text x="${X(i * 15)}" y="119" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}" font-size="8.5" fill="var(--muted)" font-family="JetBrains Mono, monospace">${t}</text>`);
          ser.forEach((s, si) => { const path = s.v.map((v, i) => v === null || !isFinite(v) ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).filter(Boolean); if (path.length) { svg += `<polyline points="${path.join(' ')}" fill="none" stroke="${PAL[si % PAL.length]}" stroke-width="1.6" stroke-linejoin="round"/>`; const lp = path[path.length - 1].split(','); svg += `<circle cx="${lp[0]}" cy="${lp[1]}" r="2.4" fill="${PAL[si % PAL.length]}"/>`; } });
          svg += '</svg>';
          body = svg + `<div class="legend">${ser.map((s, si) => `<span><i style="background:${PAL[si % PAL.length]}"></i>${esc(seriesName(s.l))} ${esc(fmtUnit(s.v[30] ?? NaN, p.unit))}</span>`).join('')}</div>`; }
      } else {
        const r = pq(String(p.query), now); const rows = r.type === 'scalar' ? [{ l: {}, v: r.v }] : r.s.slice(0, 10); VARY = varying(rows.map(x => x.l));
        if (!rows.length) body = '<div class="err">No data</div>';
        else if (p.type === 'stat') body = rows.length === 1 ? `<div class="stat" style="color:${thrColor(rows[0].v, p)}">${esc(fmtUnit(rows[0].v, p.unit))}</div>` : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px">${rows.map(x => `<div><div class="stat" style="font-size:26px;padding:4px 0;color:${thrColor(x.v, p)}">${esc(fmtUnit(x.v, p.unit))}</div><div class="legend">${esc(seriesName(x.l))}</div></div>`).join('')}</div>`;
        else if (p.type === 'gauge') { const top = p.max ?? (p.unit === 'percentunit' ? 1 : 100); body = rows.map(x => `<div class="legend" style="justify-content:space-between"><span>${esc(seriesName(x.l))}</span><span>${esc(fmtUnit(x.v, p.unit))}</span></div><div class="gauge"><i style="width:${Math.max(0, Math.min(100, x.v / top * 100))}%;background:${thrColor(x.v, p)}"></i></div>`).join(''); }
        else body = `<div style="overflow-x:auto"><table style="width:100%;font-size:12px;font-family:var(--f-mono);border-collapse:collapse">${rows.map(x => `<tr><td style="padding:3px 4px;border-bottom:1px solid var(--line)">${esc(fmtLabels(x.l))}</td><td style="padding:3px 4px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums">${esc(fmtUnit(x.v, p.unit))}</td></tr>`).join('')}</table></div>`;
      }
    } catch (e) { body = `<div class="err">${esc(e.message)}</div>`; }
    box.innerHTML = `<h4>${esc(p.title)}</h4><div class="q" title="${esc(p.query)}">${esc(p.query)}</div>${body}`; g.appendChild(box);
  }
  $('dvOv').hidden = false; $('dvClose').focus();
}
$('dvClose').onclick = () => { $('dvOv').hidden = true; focusCmd(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('dvOv').hidden) { $('dvOv').hidden = true; focusCmd(); } });
let toastT; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
/* ---------- change hook ---------- */
let pend = false;
function onChange() { if (suppress || !L) return; if (pend) return; pend = true; queueMicrotask(() => { pend = false; try { syncCheckoutErrors(); } catch (e) { } updateObjectives(false); }); }
setInterval(() => { if (L && S && S.mon && !P.done.includes(L.id)) updateObjectives(false); }, 3000);
load(P.cur);
