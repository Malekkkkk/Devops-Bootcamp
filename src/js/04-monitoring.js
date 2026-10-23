/* ================= MONITORING: metrics, PromQL, dashboards, alerts, incidents ================= */
const SPEED = 10; // lab clock runs 10x so recovery is visible quickly
const NODES = { 'web1:9100': { busy: 0.34, mem: 0.52, disk: 0.41 }, 'web2:9100': { busy: 0.38, mem: 0.49, disk: 0.37 }, 'db1:9100': { busy: 0.71, mem: 0.81, disk: 0.41 } };
const SVCS = { checkout: { rps: 42 }, catalog: { rps: 180 }, auth: { rps: 64 } };
function monitoring(opts = {}) {
  const t0 = Math.floor(Date.now() / 1000);
  S.mon = { t0, real0: Date.now(), nodes: JSON.parse(JSON.stringify(NODES)), err: {}, dashboards: {}, rules: [], rulesLoaded: false, incidents: {}, checks: {} };
  for (const s of Object.keys(SVCS)) S.mon.err[s] = [{ t: t0 - 86400 * 3, s: (opts.err && opts.err[s]) ?? ({ checkout: 0.004, catalog: 0.002, auth: 0.003 }[s]) }];
  if (opts.nodes) for (const [k, v] of Object.entries(opts.nodes)) Object.assign(S.mon.nodes[k], v);
}
const simNow = () => S.mon.t0 + (Date.now() - S.mon.real0) / 1000 * SPEED;
const fmtSim = t => { const d = new Date(t * 1000); return p2(d.getHours()) + ':' + p2(d.getMinutes()); };
const WOB = 0.12, PER = 900;
const Iw = t => t - WOB * PER / (2 * Math.PI) * Math.cos(2 * Math.PI * t / PER);
function errIntegral(svc, t) { const seg = S.mon.err[svc]; let v = 0; for (let i = 0; i < seg.length; i++) { const a = seg[i].t, b = i + 1 < seg.length ? seg[i + 1].t : Infinity; if (t <= a) break; v += seg[i].s * (Iw(Math.min(t, b)) - Iw(a)); } return v; }
function setErr(svc, share) { const seg = S.mon.err[svc]; if (Math.abs(seg[seg.length - 1].s - share) < 1e-9) return; seg.push({ t: simNow(), s: share }); }
function catalog() {
  const out = []; const t0 = S.mon.t0 - 86400 * 3;
  for (const [svc, cfg] of Object.entries(SVCS)) for (const inst of [0, 1]) {
    const r = cfg.rps / 2, base = { job: 'shop', service: svc, instance: `${svc}-${inst}:8080`, method: inst ? 'POST' : 'GET' };
    const tot = t => r * (Iw(t) - Iw(t0));
    out.push({ name: 'http_requests_total', labels: Object.assign({}, base, { status: '200' }), v: t => tot(t) - r * errIntegral(svc, t) - r * 0.015 * (Iw(t) - Iw(t0)) });
    out.push({ name: 'http_requests_total', labels: Object.assign({}, base, { status: '404' }), v: t => r * 0.015 * (Iw(t) - Iw(t0)) });
    out.push({ name: 'http_requests_total', labels: Object.assign({}, base, { status: '500' }), v: t => r * 0.3 * errIntegral(svc, t) });
    out.push({ name: 'http_requests_total', labels: Object.assign({}, base, { status: '502' }), v: t => r * 0.7 * errIntegral(svc, t) });
    out.push({ name: 'up', labels: { job: 'shop', instance: base.instance, service: svc }, v: () => 1, gauge: true });
  }
  for (const [inst, n] of Object.entries(S.mon.nodes)) {
    for (const cpu of ['0', '1']) for (const [mode, share] of [['idle', 1 - n.busy], ['user', n.busy * 0.78], ['system', n.busy * 0.17], ['iowait', n.busy * 0.05]]) out.push({ name: 'node_cpu_seconds_total', labels: { job: 'node', instance: inst, cpu, mode }, v: t => share * ((t - t0) - 0.04 * 97 * Math.cos(t / 97 + cpu * 2)) });
    const total = 8 * 1073741824; out.push({ name: 'node_memory_MemTotal_bytes', labels: { job: 'node', instance: inst }, v: () => total, gauge: true });
    out.push({ name: 'node_memory_MemAvailable_bytes', labels: { job: 'node', instance: inst }, v: t => total * (1 - n.mem) * (1 + 0.02 * Math.sin(t / 300)), gauge: true });
    const size = 50 * 1073741824; out.push({ name: 'node_filesystem_size_bytes', labels: { job: 'node', instance: inst, mountpoint: '/', fstype: 'ext4', device: '/dev/sda1' }, v: () => size, gauge: true });
    out.push({ name: 'node_filesystem_avail_bytes', labels: { job: 'node', instance: inst, mountpoint: '/', fstype: 'ext4', device: '/dev/sda1' }, v: () => size * n.disk, gauge: true });
    out.push({ name: 'node_filesystem_size_bytes', labels: { job: 'node', instance: inst, mountpoint: '/boot', fstype: 'vfat', device: '/dev/sda15' }, v: () => 512 * 1048576, gauge: true });
    out.push({ name: 'node_filesystem_avail_bytes', labels: { job: 'node', instance: inst, mountpoint: '/boot', fstype: 'vfat', device: '/dev/sda15' }, v: () => 410 * 1048576, gauge: true });
    out.push({ name: 'up', labels: { job: 'node', instance: inst }, v: () => 1, gauge: true });
  }
  return out;
}
const METRIC_HELP = {
  http_requests_total: 'counter  Total HTTP requests handled. Labels: service, instance, method, status',
  node_cpu_seconds_total: 'counter  Seconds each CPU spent in each mode. Labels: instance, cpu, mode (idle, user, system, iowait)',
  node_memory_MemTotal_bytes: 'gauge    Total memory in bytes. Labels: instance',
  node_memory_MemAvailable_bytes: 'gauge    Memory available for new work, in bytes. Labels: instance',
  node_filesystem_size_bytes: 'gauge    Filesystem size in bytes. Labels: instance, mountpoint, fstype, device',
  node_filesystem_avail_bytes: 'gauge    Free space usable by non-root users, in bytes. Labels: instance, mountpoint, fstype, device',
  up: 'gauge    1 if the last scrape of the target worked, 0 if not. Labels: job, instance',
};
/* ---------- PromQL subset ---------- */
const AGG = new Set(['sum', 'avg', 'min', 'max', 'count']);
const FUNCS = { rate: 'm', irate: 'm', increase: 'm', avg_over_time: 'm', max_over_time: 'm', min_over_time: 'm', abs: 'v', round: 'v', ceil: 'v', floor: 'v', time: '' };
function pqLex(s) {
  const t = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { const m = /^(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i)); const d = /^(\d+)(ms|s|m|h|d|w|y)\b/.exec(s.slice(i)); if (d && t.length && t[t.length - 1].v === '[') { t.push({ k: 'dur', v: d[0] }); i += d[0].length; continue; } t.push({ k: 'num', v: +m[0] }); i += m[0].length; continue; }
    if (/[A-Za-z_:]/.test(c)) { const m = /^[A-Za-z_:][A-Za-z0-9_:]*/.exec(s.slice(i)); t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if (c === '"' || c === "'") { let j = i + 1, v = ''; while (j < s.length && s[j] !== c) { if (s[j] === '\\') { v += s[j + 1]; j += 2; continue; } v += s[j++]; } if (j >= s.length) throw new Error(`unterminated quoted string ${s.slice(i)}`); t.push({ k: 'str', v }); i = j + 1; continue; }
    const two = s.slice(i, i + 2); if (['==', '!=', '<=', '>=', '=~', '!~'].includes(two)) { t.push({ k: 'op', v: two }); i += 2; continue; }
    if ('+-*/%^<>=(){}[],'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
    throw new Error(`unexpected character: '${c}'`);
  }
  return t;
}
function pqParse(src) {
  const T = pqLex(src); let i = 0;
  const peek = () => T[i], next = () => T[i++];
  const eat = v => { const t = next(); if (!t || t.v !== v) throw new Error(`unexpected ${t ? `"${t.v}"` : 'end of input'}, expected "${v}"`); return t; };
  const isOp = (...v) => peek() && peek().k === 'op' && v.includes(peek().v);
  const labelList = () => { eat('('); const ls = []; while (!isOp(')')) { const t = next(); if (!t || t.k !== 'id') throw new Error('unexpected token in grouping opts, expected label'); ls.push(t.v); if (isOp(',')) next(); } eat(')'); return ls; };
  function cmp() { let l = add(); while (isOp('==', '!=', '>', '<', '>=', '<=')) { const op = next().v; let b = false; if (peek()?.v === 'bool') { next(); b = true; } l = { t: 'bin', op, l, r: add(), bool: b }; } return l; }
  function add() { let l = mul(); while (isOp('+', '-')) { const op = next().v; l = { t: 'bin', op, l, r: mul() }; } return l; }
  function mul() { let l = un(); while (isOp('*', '/', '%')) { const op = next().v; l = { t: 'bin', op, l, r: un() }; } return l; }
  function un() { if (isOp('-')) { next(); return { t: 'bin', op: '*', l: { t: 'num', v: -1 }, r: un() }; } if (isOp('+')) { next(); return un(); } return prim(); }
  function matchers() { eat('{'); const ms = []; while (!isOp('}')) { const k = next(); if (!k || k.k !== 'id') throw new Error('unexpected token in label matching, expected label name'); const op = next(); if (!op || !['=', '!=', '=~', '!~'].includes(op.v)) throw new Error(`unexpected "${op ? op.v : 'end'}" in label matching, expected one of "=", "!=", "=~" or "!~"`); const v = next(); if (!v || v.k !== 'str') throw new Error(`unexpected ${v ? `"${v.v}"` : 'end'} in label matching, expected string (label values need quotes)`); ms.push({ k: k.v, op: op.v, v: v.v }); if (isOp(',')) next(); } eat('}'); return ms; }
  function prim() {
    const t = peek(); if (!t) throw new Error('unexpected end of input');
    if (t.k === 'num') { next(); return { t: 'num', v: t.v }; }
    if (t.v === '(') { next(); const e = cmp(); eat(')'); return { t: 'paren', e }; }
    if (t.v === '{') { const ms = matchers(); return range({ t: 'sel', name: null, ms }); }
    if (t.k === 'id') {
      next();
      if (AGG.has(t.v)) { let by = null, mode = null; if (peek()?.v === 'by' || peek()?.v === 'without') { mode = next().v; by = labelList(); } eat('('); const e = cmp(); eat(')'); if (!mode && (peek()?.v === 'by' || peek()?.v === 'without')) { mode = next().v; by = labelList(); } return { t: 'agg', op: t.v, e, by, mode }; }
      if (t.v in FUNCS) { eat('('); const args = []; while (!isOp(')')) { args.push(cmp()); if (isOp(',')) next(); } eat(')'); return { t: 'fn', name: t.v, args }; }
      if (isOp('(')) throw new Error(`unknown function with name "${t.v}"`);
      let ms = []; if (isOp('{')) ms = matchers(); return range({ t: 'sel', name: t.v, ms });
    }
    throw new Error(`unexpected "${t.v}"`);
  }
  function range(sel) { if (isOp('[')) { next(); const d = next(); if (!d || d.k !== 'dur') throw new Error('bad duration in range selector, use e.g. [5m]'); eat(']'); sel.range = durSec(d.v); } if (peek()?.v === 'offset') throw new Error('offset is not supported in this lab'); return sel; }
  const e = cmp(); if (i < T.length) throw new Error(`unexpected "${T[i].v}"`); return e;
}
function durSec(d) { const m = /^(\d+)(ms|s|m|h|d|w|y)$/.exec(d); if (!m) return null; return +m[1] * { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000 }[m[2]]; }
const lkey = l => JSON.stringify(Object.keys(l).filter(k => k !== '__name__').sort().map(k => [k, l[k]]));
const dropName = l => { const o = Object.assign({}, l); delete o.__name__; return o; };
function pqEval(n, t, cat) {
  switch (n.t) {
    case 'num': return { type: 'scalar', v: n.v };
    case 'paren': return pqEval(n.e, t, cat);
    case 'sel': {
      if (!n.name && !n.ms.some(m => m.op === '=' && m.v !== '' || m.op === '=~')) throw new Error('vector selector must contain at least one non-empty matcher');
      const ms = n.ms.map(m => ({ ...m, re: m.op.includes('~') ? new RegExp('^(?:' + m.v + ')$') : null }));
      const list = cat.filter(s => (!n.name || s.name === n.name) && ms.every(m => { const v = (m.k === '__name__' ? s.name : s.labels[m.k]) ?? ''; return m.op === '=' ? v === m.v : m.op === '!=' ? v !== m.v : m.op === '=~' ? m.re.test(v) : !m.re.test(v); }));
      if (n.range) return { type: 'matrix', list, range: n.range };
      return { type: 'vector', s: list.map(s => ({ l: Object.assign({ __name__: s.name }, s.labels), v: s.v(t) })) };
    }
    case 'fn': {
      const F = FUNCS[n.name];
      if (n.name === 'time') return { type: 'scalar', v: t };
      if (n.args.length !== 1) throw new Error(`expected 1 argument(s) in call to "${n.name}", got ${n.args.length}`);
      const a = pqEval(n.args[0], t, cat);
      if (F === 'm') { if (a.type !== 'matrix') throw new Error(`expected type range vector in call to function "${n.name}", got ${a.type === 'vector' ? 'instant vector' : 'scalar'}`);
        const r = a.range; return { type: 'vector', s: a.list.map(s => { let v; if (n.name === 'rate' || n.name === 'irate') v = (s.v(t) - s.v(t - r)) / r; else if (n.name === 'increase') v = s.v(t) - s.v(t - r); else { const pts = []; for (let x = t - r; x <= t + 0.01; x += 15) pts.push(s.v(x)); v = n.name === 'avg_over_time' ? pts.reduce((p, q) => p + q, 0) / pts.length : n.name === 'max_over_time' ? Math.max(...pts) : Math.min(...pts); } return { l: dropName(Object.assign({ __name__: s.name }, s.labels)), v }; }) }; }
      if (a.type === 'matrix') throw new Error(`expected type instant vector in call to function "${n.name}", got range vector`);
      const f = { abs: Math.abs, round: Math.round, ceil: Math.ceil, floor: Math.floor }[n.name];
      if (a.type === 'scalar') return { type: 'scalar', v: f(a.v) };
      return { type: 'vector', s: a.s.map(x => ({ l: dropName(x.l), v: f(x.v) })) };
    }
    case 'agg': {
      const a = pqEval(n.e, t, cat); if (a.type !== 'vector') throw new Error(`expected type instant vector in aggregation expression, got ${a.type === 'matrix' ? 'range vector (wrap it in rate(...))' : 'scalar'}`);
      const groups = new Map();
      for (const x of a.s) { let gl; if (n.mode === 'by') gl = Object.fromEntries(n.by.filter(k => x.l[k] !== undefined).map(k => [k, x.l[k]])); else if (n.mode === 'without') { gl = dropName(x.l); n.by.forEach(k => delete gl[k]); } else gl = {}; const k = lkey(gl); if (!groups.has(k)) groups.set(k, { l: gl, vs: [] }); groups.get(k).vs.push(x.v); }
      return { type: 'vector', s: [...groups.values()].map(g => ({ l: g.l, v: n.op === 'sum' ? g.vs.reduce((p, q) => p + q, 0) : n.op === 'avg' ? g.vs.reduce((p, q) => p + q, 0) / g.vs.length : n.op === 'min' ? Math.min(...g.vs) : n.op === 'max' ? Math.max(...g.vs) : g.vs.length })) };
    }
    case 'bin': {
      const L = pqEval(n.l, t, cat), R = pqEval(n.r, t, cat);
      if (L.type === 'matrix' || R.type === 'matrix') throw new Error('binary expression must contain only scalar and instant vector types (wrap range vectors in rate(...))');
      const cmpOp = ['==', '!=', '>', '<', '>=', '<='].includes(n.op);
      const f = (x, y) => { switch (n.op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return y === 0 ? (x === 0 ? NaN : x > 0 ? Infinity : -Infinity) : x / y; case '%': return x % y; case '==': return x === y; case '!=': return x !== y; case '>': return x > y; case '<': return x < y; case '>=': return x >= y; case '<=': return x <= y; } };
      if (L.type === 'scalar' && R.type === 'scalar') return { type: 'scalar', v: cmpOp ? +f(L.v, R.v) : f(L.v, R.v) };
      if (L.type === 'vector' && R.type === 'scalar') return { type: 'vector', s: L.s.flatMap(x => { const r = f(x.v, R.v); return cmpOp ? (n.bool ? [{ l: dropName(x.l), v: +r }] : r ? [{ l: x.l, v: x.v }] : []) : [{ l: dropName(x.l), v: r }]; }) };
      if (L.type === 'scalar' && R.type === 'vector') return { type: 'vector', s: R.s.flatMap(x => { const r = f(L.v, x.v); return cmpOp ? (n.bool ? [{ l: dropName(x.l), v: +r }] : r ? [{ l: x.l, v: x.v }] : []) : [{ l: dropName(x.l), v: r }]; }) };
      const rm = new Map(); for (const y of R.s) { const k = lkey(y.l); if (rm.has(k)) throw new Error('found duplicate series for the match group on the right hand-side of the operation; many-to-many matching not allowed: aggregate both sides by the same labels first'); rm.set(k, y); }
      const out = []; for (const x of L.s) { const y = rm.get(lkey(x.l)); if (!y) continue; const r = f(x.v, y.v); if (cmpOp) { if (n.bool) out.push({ l: dropName(x.l), v: +r }); else if (r) out.push({ l: x.l, v: x.v }); } else out.push({ l: dropName(x.l), v: r }); }
      return { type: 'vector', s: out };
    }
  }
  throw new Error('unsupported expression');
}
function pq(src, t) { const ast = pqParse(src); const r = pqEval(ast, t ?? simNow(), catalog()); if (r.type === 'matrix') throw new Error('range vector results are not shown here; wrap the selector in a function such as rate(...)'); return r; }
const fmtLabels = l => '{' + Object.entries(l).filter(([k]) => k !== '__name__').map(([k, v]) => `${k}="${v}"`).join(', ') + '}';
const fmtVal = v => !isFinite(v) ? (isNaN(v) ? 'NaN' : (v > 0 ? '+Inf' : '-Inf')) : Math.abs(v) >= 1e6 ? v.toExponential(3) : Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? String(+v.toFixed(3)) : String(+v.toPrecision(4));
function pqFormat(r) { if (r.type === 'scalar') return 'scalar: ' + fmtVal(r.v); if (!r.s.length) return A.dim('Empty query result'); return r.s.slice().sort((a, b) => lkey(a.l) < lkey(b.l) ? -1 : 1).map(x => `${(x.l.__name__ || '') + A.cyan(fmtLabels(x.l))}  ${A.bold(fmtVal(x.v))}`).join('\n'); }
/* ---------- truth for checks ---------- */
function truthErr(svc, t = simNow(), w = 300) { const r = SVCS[svc].rps; const tot = r * (Iw(t) - Iw(t - w)); return r * (errIntegral(svc, t) - errIntegral(svc, t - w)) / tot; }
function truthRps(svc, t = simNow(), w = 300) { return SVCS[svc].rps * (Iw(t) - Iw(t - w)) / w; }
function byLabel(r, key) { if (!r || r.type !== 'vector') return null; const m = {}; for (const x of r.s) { if (x.l[key] === undefined) return null; if (key === 'instance' && x.l.mountpoint && x.l.mountpoint !== '/') continue; if (m[x.l[key]] !== undefined) return null; m[x.l[key]] = x.v; } return m; }
const approx = (a, b, rel, abs = 0) => Math.abs(a - b) <= Math.max(abs, Math.abs(b) * rel);
function matchesTruth(src, kind) {
  let r; try { r = pq(src); } catch (e) { return false; }
  if (kind === 'cpu') { const m = byLabel(r, 'instance'); if (!m) return false; return Object.keys(S.mon.nodes).every(i => m[i] !== undefined && (approx(m[i], S.mon.nodes[i].busy * 100, 0.06, 2) || approx(m[i], S.mon.nodes[i].busy, 0.06, 0.02))); }
  if (kind === 'disk') { const m = byLabel(r, 'instance'); if (!m) return false; return Object.keys(S.mon.nodes).every(i => m[i] !== undefined && (approx(m[i], S.mon.nodes[i].disk * 100, 0.03, 0.5) || approx(m[i], S.mon.nodes[i].disk, 0.03, 0.005))); }
  if (kind === 'err') { const m = byLabel(r, 'service'); if (!m) return false; return Object.keys(SVCS).every(s => { const tr = truthErr(s); return m[s] !== undefined && (approx(m[s], tr, 0.12, 0.0008) || approx(m[s], tr * 100, 0.12, 0.08)); }); }
  if (kind === 'rps') { const m = byLabel(r, 'service'); if (!m) return false; return Object.keys(SVCS).every(s => m[s] !== undefined && approx(m[s], truthRps(s), 0.05)); }
  return false;
}
/* ---------- commands ---------- */
cmd('promql', "promql '<expression>'\n  Runs a PromQL query against the lab's Prometheus and prints the result vector.\n  Quote the whole expression with single quotes.\n  Building blocks:\n    metric{label=\"value\"}           select series (also != =~ !~)\n    rate(counter[5m])               per-second rate of a counter over 5 minutes\n    sum by (label) (...)            aggregate (sum avg min max count), keeping only those labels\n    a / b                           math between two vectors with the same labels\n    expr > 0.05                     keep only series above a threshold\n  See all metric names with: prom metrics", a => {
  if (!S.mon) return { err: 'promql: no Prometheus in this lab', code: 1 };
  const q = a.join(' ').trim(); if (!q) return { err: "usage: promql '<expression>'   e.g. promql 'up'", code: 1 };
  if (q.startsWith('@')) return { err: 'promql: pass the query text in quotes', code: 1 };
  let src = q; const f = N(norm(q)); if (f && f.t === 'f' && /\.promql$/.test(q)) src = fread(norm(q)).trim();
  try { const r = pq(src); S.mon.checks.lastQuery = src; onChange(); return { out: pqFormat(r) }; } catch (e) { return { err: 'Error executing query: invalid parameter "query": 1:1: parse error: ' + e.message, code: 1 }; }
});
cmd('prom', 'prom metrics            list metric names with type, help text and labels\nprom series <metric>    list every series (label set) of one metric\nprom targets            show what Prometheus scrapes\nprom reload             reload alert rules from the files listed in ~/monitoring/prometheus.yml\nprom rules              show loaded alert rules\nprom alerts             show alerts that are pending or firing right now', a => {
  if (!S.mon) return { err: 'prom: no Prometheus in this lab', code: 1 };
  const sub = a[0];
  if (sub === 'metrics') return { out: Object.entries(METRIC_HELP).map(([k, v]) => `${A.bold(k.padEnd(32))} ${v}`).join('\n') };
  if (sub === 'series') { const m = a[1]; if (!m) return { err: 'usage: prom series <metric>', code: 1 }; const l = catalog().filter(s => s.name === m); if (!l.length) return { err: `no series found for "${m}". List names with: prom metrics`, code: 1 }; return { out: l.map(s => m + A.cyan(fmtLabels(s.labels))).join('\n') }; }
  if (sub === 'targets') return { out: 'JOB    INSTANCE          STATE  LAST SCRAPE\n' + catalog().filter(s => s.name === 'up').map(s => `${s.labels.job.padEnd(6)} ${s.labels.instance.padEnd(17)} ${A.green('UP')}     ${(3 + s.labels.instance.length % 11)}s ago`).join('\n') };
  if (sub === 'reload') { const r = loadRules(); if (r.err) return { err: 'level=error msg="Error reloading config" err="' + r.err + '"', code: 1 }; S.mon.rules = r.rules; S.mon.rulesLoaded = true; onChange(); return { out: `level=info msg="Loading configuration file" filename=prometheus.yml\nlevel=info msg="Completed loading of configuration file" rule_files=${r.files.length} rules=${r.rules.length}` }; }
  if (sub === 'rules') { if (!S.mon.rules.length) return { out: 'No rules loaded. Write rules, check them with promtool, then run: prom reload' }; return { out: S.mon.rules.map(r => `${A.bold(r.alert)}  for: ${r.for || '0s'}  labels: ${JSON.stringify(r.labels || {})}\n  expr: ${r.expr}`).join('\n') }; }
  if (sub === 'alerts') { if (!S.mon.rules.length) return { out: 'No rules loaded.' }; const out = []; for (const r of S.mon.rules) { const st = alertState(r); if (!st.length) { out.push(`${A.green('inactive')}  ${r.alert}`); continue; } st.forEach(x => out.push(`${x.state === 'firing' ? A.red('FIRING  ') : A.yellow('PENDING ')}  ${r.alert}${A.cyan(fmtLabels(Object.assign({}, x.l, r.labels)))}  value=${fmtVal(x.v)}`)); } return { out: out.join('\n') }; }
  return { out: MAN.prom };
});
function readRuleFiles() { const cfgP = '/home/dev/monitoring/prometheus.yml'; const cfg = fread(cfgP); if (cfg === null) return { err: 'open /home/dev/monitoring/prometheus.yml: no such file or directory' }; let c; try { c = jsyaml.load(cfg); } catch (e) { return { err: 'parsing YAML file prometheus.yml: ' + e.reason }; } const pats = (c && c.rule_files) || []; const files = []; for (const p of pats) { const abs = p.startsWith('/') ? p : '/home/dev/monitoring/' + p; globExpandAbs(abs).forEach(f => files.push(f)); } return { files }; }
function globExpandAbs(p) { if (!/[*?]/.test(p)) return N(p) ? [p] : []; const d = dirname(p), re = globRe(basename(p)); return kids(d).filter(k => re.test(basename(k)) && N(k).t === 'f'); }
function checkRuleFile(p) {
  let doc; try { doc = jsyaml.load(fread(p)); } catch (e) { return { err: `yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason}` }; }
  if (!doc || !Array.isArray(doc.groups)) return { err: 'groupname: "" is repeated in the same file / missing "groups:" list at the top level' };
  const rules = [];
  for (const g of doc.groups) { if (!g.name) return { err: 'group name must not be empty' }; if (!Array.isArray(g.rules)) return { err: `group "${g.name}": rules must be a list` };
    for (const [i, r] of g.rules.entries()) { if (!r.alert && !r.record) return { err: `group "${g.name}", rule ${i + 1}: one of 'record' or 'alert' must be set` }; if (!r.expr) return { err: `group "${g.name}", rule ${i + 1}: field 'expr' must be set in rule` }; if (r.alert && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(r.alert)) return { err: `group "${g.name}", rule ${i + 1}: invalid alert name "${r.alert}"` };
      try { pqParse(String(r.expr)); } catch (e) { return { err: `group "${g.name}", rule ${i + 1}, "${r.alert}": could not parse expression: 1:1: parse error: ${e.message}` }; }
      if (r.for !== undefined && durSec(String(r.for)) === null) return { err: `group "${g.name}", rule ${i + 1}: not a valid duration string: "${r.for}"` };
      if (r.labels && (typeof r.labels !== 'object' || Array.isArray(r.labels))) return { err: `group "${g.name}", rule ${i + 1}: labels must be a map` };
      for (const k of Object.keys(r)) if (!['alert', 'record', 'expr', 'for', 'labels', 'annotations', 'keep_firing_for'].includes(k)) return { err: `group "${g.name}", rule ${i + 1}: field ${k} not found in type rulefmt.Rule` };
      if (r.alert) rules.push({ alert: r.alert, expr: String(r.expr), for: r.for, labels: r.labels || {}, annotations: r.annotations || {} }); } }
  return { rules };
}
function loadRules() { const rf = readRuleFiles(); if (rf.err) return rf; const all = []; for (const f of rf.files) { const r = checkRuleFile(f); if (r.err) return { err: `${f}: ${r.err}` }; all.push(...r.rules); } return { rules: all, files: rf.files }; }
function alertState(r) { const t = simNow(); let now; try { now = pq(r.expr, t); } catch (e) { return []; } if (now.type !== 'vector') return []; const forS = r.for ? durSec(String(r.for)) : 0; return now.s.map(x => { let firing = true; for (let back = 30; back <= forS; back += 30) { const prev = pq(r.expr, t - back); if (!prev.s.find(y => lkey(y.l) === lkey(x.l))) { firing = false; break; } } return { l: dropName(x.l), v: x.v, state: firing ? 'firing' : 'pending' }; }); }
cmd('promtool', 'promtool check rules <file>\n  Validates alert rule files before Prometheus loads them.', a => {
  if (a[0] !== 'check' || a[1] !== 'rules' || !a[2]) return { err: 'usage: promtool check rules <file>', code: 1 };
  const out = [], errs = [];
  for (const f of a.slice(2)) { const p = norm(f); if (!N(p)) { errs.push(`Checking ${f}\n  FAILED:\nopen ${f}: no such file or directory`); continue; } const r = checkRuleFile(p); if (r.err) errs.push(`Checking ${f}\n  FAILED:\n${f}: ${r.err}`); else { out.push(`Checking ${f}\n  ${A.green('SUCCESS')}: ${r.rules.length} rules found`); S.mon.checks.promtoolOk = true; } }
  onChange(); return { out: out.join('\n'), err: errs.join('\n'), code: errs.length ? 1 : 0 };
});
cmd('dash', 'dash apply <file.yaml>   validate a dashboard definition and save it\ndash list                list saved dashboards\ndash open <name>         open a dashboard in the viewer\n\nDashboard file format:\n  title: Shop overview\n  panels:\n    - title: Requests per second\n      type: timeseries        # timeseries | stat | gauge | table\n      query: <PromQL>\n      unit: req/s             # optional: percent, percentunit, bytes, req/s, s\n      thresholds: [80, 90]    # optional, for stat and gauge (green / amber / red)\n      invert: true            # optional: lower is worse (e.g. free disk)\n      max: 100                # optional: gauge scale', a => {
  if (!S.mon) return { err: 'dash: no monitoring stack in this lab', code: 1 };
  const sub = a[0];
  if (sub === 'list') { const ks = Object.keys(S.mon.dashboards); return { out: ks.length ? ks.map(k => `${k.padEnd(24)} ${S.mon.dashboards[k].def.panels.length} panels`).join('\n') : 'No dashboards yet. Write one and run: dash apply <file>' }; }
  if (sub === 'open') { const k = a[1] || Object.keys(S.mon.dashboards)[0]; if (!k || !S.mon.dashboards[k]) return { err: `dash: no dashboard "${a[1] || ''}". See: dash list`, code: 1 }; return { out: `Opening ${k}...`, dash: k }; }
  if (sub === 'apply') {
    const f = a[1]; if (!f) return { err: 'usage: dash apply <file.yaml>', code: 1 }; const p = norm(f); if (!N(p)) return { err: `dash: ${f}: no such file`, code: 1 };
    let d; try { d = jsyaml.load(fread(p)); } catch (e) { return { err: `dash: ${f}: YAML error on line ${(e.mark?.line ?? 0) + 1}: ${e.reason}`, code: 1 }; }
    if (!d || typeof d !== 'object') return { err: `dash: ${f}: expected a map with "title" and "panels"`, code: 1 };
    if (!d.title) return { err: 'dash: the dashboard needs a title', code: 1 };
    if (!Array.isArray(d.panels) || !d.panels.length) return { err: 'dash: "panels" must be a non-empty list', code: 1 };
    const warns = [];
    for (const [i, pn] of d.panels.entries()) {
      if (!pn || !pn.title) return { err: `dash: panel ${i + 1} needs a title`, code: 1 };
      if (!['timeseries', 'stat', 'gauge', 'table'].includes(pn.type)) return { err: `dash: panel "${pn.title}": type must be timeseries, stat, gauge or table (got ${pn.type})`, code: 1 };
      if (!pn.query) return { err: `dash: panel "${pn.title}" has no query`, code: 1 };
      try { const r = pq(String(pn.query)); if (r.type === 'vector' && !r.s.length) warns.push(`panel "${pn.title}": query returns no data`); else if (r.type === 'vector' && r.s.length > 12) warns.push(`panel "${pn.title}": ${r.s.length} series is a lot for one panel; consider aggregating`); } catch (e) { return { err: `dash: panel "${pn.title}": bad query: ${e.message}`, code: 1 }; }
    }
    const slug = String(d.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    S.mon.dashboards[slug] = { def: d, applied: Date.now() }; onChange();
    return { out: (warns.length ? warns.map(w => A.yellow('warning: ' + w)).join('\n') + '\n' : '') + A.green(`dashboard "${slug}" saved (${d.panels.length} panels)`) + `\nOpen it with: dash open ${slug}` };
  }
  return { out: MAN.dash };
});
function incFind(id) { const k = Object.keys(S.mon.incidents).find(x => x.toLowerCase() === String(id || '').toLowerCase()); return k ? S.mon.incidents[k] : null; }
function incLog(inc, text, who = S.user) { inc.timeline.push({ t: simNow(), who, text }); }
cmd('incident', 'incident list                         open incidents\nincident show <id>                    details and timeline\nincident ack <id>                     acknowledge the page (stops escalation)\nincident assign <id> <user>           set the incident commander\nincident sev <id> <SEV1|SEV2|SEV3>    set severity\nincident note <id> "<text>"           add a timeline note / status update\nincident status <id> <investigating|identified|mitigated|resolved>', a => {
  if (!S.mon || !Object.keys(S.mon.incidents).length) return { out: 'No incidents. Quiet shift.' };
  const sub = a[0];
  if (!sub || sub === 'list') return { out: 'ID         SEV    STATUS          OWNER   OPENED  TITLE\n' + Object.values(S.mon.incidents).map(i => `${i.id.padEnd(10)} ${(i.sev || '-').padEnd(6)} ${(i.status === 'triggered' ? A.red(i.status.padEnd(15)) : i.status === 'resolved' ? A.green(i.status.padEnd(15)) : A.yellow(i.status.padEnd(15)))} ${(i.owner || '-').padEnd(7)} ${fmtSim(i.opened)}   ${i.title}`).join('\n') };
  const inc = incFind(a[1]); if (!inc) return { err: `incident: no incident "${a[1] || ''}". See: incident list`, code: 1 };
  if (sub === 'show' || sub === 'timeline') return { out: `${A.bold(inc.id)}  ${inc.title}\nSeverity: ${inc.sev || 'not set'}   Status: ${inc.status}   Commander: ${inc.owner || 'nobody'}\nAlert:    ${inc.alert}\n\nTimeline (lab clock):\n` + inc.timeline.map(e => `  ${fmtSim(e.t)}  ${e.who.padEnd(10)} ${e.text}`).join('\n') };
  if (sub === 'ack') { if (inc.status !== 'triggered') return { out: `${inc.id} is already ${inc.status}` }; inc.status = 'acknowledged'; incLog(inc, 'Acknowledged the page'); onChange(); return { out: A.green(`${inc.id} acknowledged. Escalation stopped.`) }; }
  if (sub === 'assign') { const u = a[2]; if (!u) return { err: 'usage: incident assign <id> <user>', code: 1 }; if (!['dev', 'amira', 'jonas', 'li'].includes(u)) return { err: `incident: unknown responder "${u}" (on the roster: dev, amira, jonas, li)`, code: 1 }; inc.owner = u; incLog(inc, `Incident commander: ${u}`); onChange(); return { out: `${inc.id} commander set to ${u}` }; }
  if (sub === 'sev') { const s = String(a[2] || '').toUpperCase(); if (!/^SEV[123]$/.test(s)) return { err: 'incident: severity must be SEV1, SEV2 or SEV3', code: 1 }; inc.sev = s; incLog(inc, `Severity set to ${s}`); onChange(); return { out: `${inc.id} severity ${s}` }; }
  if (sub === 'note') { const txt = a.slice(2).join(' ').trim(); if (txt.length < 8) return { err: 'incident: write a real update (what you know, what you are doing next)', code: 1 }; incLog(inc, txt); inc.notes++; onChange(); return { out: `note added to ${inc.id}` }; }
  if (sub === 'status') { const st = a[2]; if (!['investigating', 'identified', 'mitigated', 'resolved'].includes(st)) return { err: 'incident: status must be investigating, identified, mitigated or resolved', code: 1 }; if (inc.status === 'triggered') return { err: `incident: acknowledge ${inc.id} first`, code: 1 }; inc.status = st; incLog(inc, `Status changed to ${st}`); if (st === 'resolved') { inc.resolvedRatio = truthErr('checkout'); inc.resolvedAt = simNow(); } onChange(); return { out: `${inc.id} is now ${st}` }; }
  if (sub === 'resolve') return CMDS.incident.run(['status', a[1], 'resolved']);
  return { out: MAN.incident };
});
/* checkout error share follows the deployed version */
function syncCheckoutErrors() { if (!S.mon || !S.k8s || !S.k8s.deps.checkout) return; const img = S.k8s.deps.checkout.m.spec.template.spec.containers[0].image; const v = depView('checkout'); const share = v.ready === 0 ? 1 : img === 'shopco/checkout:3.2' ? 0.118 : 0.004; setErr('checkout', share); }
