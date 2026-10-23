'use strict';
/* ================= WORLD + FILESYSTEM ================= */
let S = null;
const p2 = n => String(n).padStart(2, '0');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function ts(off = 0) { const d = new Date(Date.now() - off * 1000); return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2,' ')} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; }
function hhmm(ms) { const d = new Date(ms); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
const A = { red: s => '\x1b[31m' + s + '\x1b[0m', green: s => '\x1b[32m' + s + '\x1b[0m', yellow: s => '\x1b[33m' + s + '\x1b[0m', blue: s => '\x1b[34m' + s + '\x1b[0m', mag: s => '\x1b[35m' + s + '\x1b[0m', cyan: s => '\x1b[36m' + s + '\x1b[0m', dim: s => '\x1b[90m' + s + '\x1b[0m', bold: s => '\x1b[1m' + s + '\x1b[0m' };
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');

function world(host) {
  S = { fs: {}, cwd: '/home/dev', prev: '/home/dev', user: 'dev', sudo: false, host,
    users: { root: { uid: 0, groups: ['root'], home: '/root', shell: '/bin/bash' }, dev: { uid: 1000, groups: ['dev', 'sudo'], home: '/home/dev', shell: '/bin/bash' }, 'www-data': { uid: 33, groups: ['www-data'], home: '/var/www', shell: '/usr/sbin/nologin' } },
    groups: { root: 0, adm: 4, sudo: 27, 'www-data': 33, dev: 1000 }, nextUid: 1001,
    services: {}, procs: [], nextPid: 2400, hosts: {}, runs: [], adhoc: [], k8s: null, mon: null, crontab: '', flags: {}, hist: [] };
  ['/bin', '/usr/bin', '/etc', '/var', '/var/log', '/var/www/html', '/opt', '/srv', '/home', '/usr/share'].forEach(d => mkd(d));
  S.fs['/tmp'] = { t: 'd', m: 0o1777, o: 'root', g: 'root' };
  S.fs['/root'] = { t: 'd', m: 0o700, o: 'root', g: 'root' };
  S.fs['/dev'] = { t: 'd', m: 0o755, o: 'root', g: 'root' };
  S.fs['/dev/null'] = { t: 'f', m: 0o666, o: 'root', g: 'root', c: '', devnull: true };
  S.fs['/home/dev'] = { t: 'd', m: 0o750, o: 'dev', g: 'dev' };
  mkf('/home/dev/.bashrc', '# ~/.bashrc\nalias ll="ls -la"\n', 'dev');
  mkf('/etc/hostname', host + '\n');
  mkf('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\n');
  S.fs['/etc/passwd'] = { t: 'f', m: 0o644, o: 'root', g: 'root', gen: () => Object.entries(S.users).map(([n, u]) => `${n}:x:${u.uid}:${S.groups[n] ?? u.uid}::${u.home}:${u.shell}`).join('\n') + '\n' };
  S.fs['/etc/group'] = { t: 'f', m: 0o644, o: 'root', g: 'root', gen: () => Object.entries(S.groups).map(([g, id]) => `${g}:x:${id}:${Object.entries(S.users).filter(([n, u]) => n !== g && u.groups.includes(g)).map(([n]) => n).join(',')}`).join('\n') + '\n' };
  S.fs['/etc/shadow'] = { t: 'f', m: 0o640, o: 'root', g: 'root', c: 'root:*:19800:0:99999:7:::\ndev:$y$j9T$...:19800:0:99999:7:::\n' };
  [['root', '/sbin/init', 0.0, 0.3, null, 1], ['root', 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups', 0.0, 0.2, 22, 640], ['root', '/usr/sbin/cron -f', 0.0, 0.1, null, 701], ['dev', '-bash', 0.0, 0.1, null, 2301]].forEach(([user, cmd, cpu, mem, port, pid]) => S.procs.push({ pid, user, cmd, cpu, mem, port }));
}
function norm(p) {
  if (p === undefined || p === '') return S.cwd;
  const home = S.user === 'root' ? '/root' : '/home/' + S.user;
  if (p === '~') p = home; else if (p.startsWith('~/')) p = home + p.slice(1);
  if (!p.startsWith('/')) p = (S.cwd === '/' ? '' : S.cwd) + '/' + p;
  const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
  return '/' + out.join('/');
}
const dirname = p => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };
const basename = p => p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1);
const N = p => S.fs[p];
function mkd(p, o = 'root', m = 0o755) { if (p !== '/' && !N(dirname(p))) mkd(dirname(p), o, m); if (!N(p)) S.fs[p] = { t: 'd', m, o, g: o }; }
function mkf(p, c = '', o = 'root', m = 0o644, extra = {}) { if (!N(dirname(p))) mkd(dirname(p), o); S.fs[p] = Object.assign({ t: 'f', c, m, o, g: extra.g || o }, extra); }
const fread = p => { const n = N(p); return !n || n.t !== 'f' ? null : (n.gen ? n.gen() : n.c); };
const fsize = n => n.t === 'd' ? 4096 : (n.size ?? (n.gen ? n.gen().length : n.c.length));
function kids(p) { const pre = p === '/' ? '/' : p + '/'; return Object.keys(S.fs).filter(k => k !== p && k.startsWith(pre) && !k.slice(pre.length).includes('/')).sort(); }
function descendants(p) { const pre = p === '/' ? '/' : p + '/'; return Object.keys(S.fs).filter(k => k.startsWith(pre)).sort(); }
const priv = () => S.user === 'root' || S.sudo;
function bits(n) { if (priv()) return 7; const u = S.user; if (n.o === u) return (n.m >> 6) & 7; if ((S.users[u]?.groups || []).includes(n.g)) return (n.m >> 3) & 7; return n.m & 7; }
const canW = p => { const n = N(p); if (n) return !!(bits(n) & 2); const d = N(dirname(p)); return d ? !!(bits(d) & 2) : false; };
const canR = p => { const n = N(p); return n ? !!(bits(n) & 4) : false; };
function writeFile(p, content, append = false) {
  const n = N(p);
  if (n && n.devnull) return null;
  if (n && n.t === 'd') return 'Is a directory';
  if (!n && !N(dirname(p))) return 'No such file or directory';
  if (!canW(p)) return 'Permission denied';
  if (n) { if (append) { n.c = (n.gen ? n.gen() : n.c) + content; } else n.c = content; delete n.gen; delete n.size; delete n.vault; }
  else S.fs[p] = { t: 'f', c: content, m: 0o644, o: priv() ? 'root' : S.user, g: priv() ? 'root' : S.user };
  onChange(); return null;
}
function rmPath(p) { descendants(p).forEach(k => delete S.fs[k]); delete S.fs[p]; }
function human(b) { const u = ['', 'K', 'M', 'G', 'T']; let i = 0, v = b; while (v >= 1024 && i < 4) { v /= 1024; i++; } return i === 0 ? String(b) : (v < 10 ? v.toFixed(1) : Math.round(v)) + u[i]; }
function modeStr(n) { const m = n.m; let s = n.t === 'd' ? 'd' : '-'; for (const sh of [6, 3, 0]) { const b = (m >> sh) & 7; s += (b & 4 ? 'r' : '-') + (b & 2 ? 'w' : '-') + (b & 1 ? 'x' : '-'); } if (m & 0o1000) s = s.slice(0, 9) + 't'; return s; }
function globRe(g) { return new RegExp('^' + g.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\[!/g, '[^') + '$'); }
function hasUser(u) { return !!S.users[u]; }
function hasGroup(g) { return g in S.groups; }
function spawn(pr) { const pid = S.nextPid; S.nextPid += 7 + Math.floor(Math.random() * 30); S.procs.push(Object.assign({ pid, cpu: 0.3, mem: 1.2 }, pr)); return pid; }

/* ================= SERVICES ================= */
function addSvc(name, o) { S.services[name] = Object.assign({ name, desc: name, state: 'inactive', enabled: false, logs: [], check: () => null, proc: null, pid: null }, o); return S.services[name]; }
function slog(s, line) { s.logs.push(`${ts()} ${S.host} ${line}`); }
function svcStart(s, quiet) {
  const err = s.check();
  if (err) { s.state = 'failed'; (Array.isArray(err) ? err : [err]).forEach(l => slog(s, l)); slog(s, `systemd[1]: ${s.name}.service: Control process exited, code=exited, status=1/FAILURE`); slog(s, `systemd[1]: ${s.name}.service: Failed with result 'exit-code'.`); slog(s, `systemd[1]: Failed to start ${s.name}.service - ${s.desc}.`); return false; }
  if (s.state === 'active') return true;
  s.state = 'active'; s.since = Date.now(); if (s.proc) s.pid = spawn(Object.assign({ svc: s.name }, s.proc));
  if (!quiet) slog(s, `systemd[1]: Starting ${s.name}.service - ${s.desc}...`);
  slog(s, `systemd[1]: Started ${s.name}.service - ${s.desc}.`); return true;
}
function svcStop(s) { if (s.pid) S.procs = S.procs.filter(p => p.pid !== s.pid); s.pid = null; if (s.state === 'active') { slog(s, `systemd[1]: Stopping ${s.name}.service - ${s.desc}...`); slog(s, `systemd[1]: Stopped ${s.name}.service - ${s.desc}.`); } s.state = 'inactive'; }

/* ================= SHELL ================= */
function tokenize(line) {
  const t = []; let cur = '', q = false, quoted = false, sq = false, i = 0;
  const push = () => { if (cur !== '' || quoted) t.push({ v: cur, q: quoted, sq }); cur = ''; quoted = false; sq = false; };
  while (i < line.length) {
    const c = line[i];
    if (q) { if (c === q) q = false; else if (c === '\\' && q === '"' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) cur += line[++i]; else cur += c; i++; continue; }
    if (c === '"' || c === "'") { q = c; quoted = true; if (c === "'") sq = true; i++; continue; }
    if (c === '\\' && i + 1 < line.length) { cur += line[i + 1]; quoted = true; i += 2; continue; }
    if (c === ' ' || c === '\t') { push(); i++; continue; }
    if (c === '#' && cur === '' && !quoted) break;
    if (line.startsWith('&&', i)) { push(); t.push({ op: '&&' }); i += 2; continue; }
    if (line.startsWith('||', i)) { push(); t.push({ op: '||' }); i += 2; continue; }
    if (line.startsWith('2>&1', i)) { push(); t.push({ op: '2>&1' }); i += 4; continue; }
    if (line.startsWith('2>', i) && cur === '') { push(); t.push({ op: '2>' }); i += 2; continue; }
    if (line.startsWith('>>', i)) { push(); t.push({ op: '>>' }); i += 2; continue; }
    if (c === '>') { push(); t.push({ op: '>' }); i++; continue; }
    if (c === '<') { push(); t.push({ op: '<' }); i++; continue; }
    if (c === '|') { push(); t.push({ op: '|' }); i++; continue; }
    if (c === ';') { push(); t.push({ op: ';' }); i++; continue; }
    if (c === '&') { push(); i++; continue; }
    cur += c; i++;
  }
  if (q) return { error: `unexpected EOF while looking for matching \`${q}'` };
  push(); return { tokens: t };
}
function expandVars(s) {
  return s.replace(/\$\{?(HOME|USER|PWD|HOSTNAME|SHELL|PATH)\}?/g, (m, v) => ({ HOME: S.user === 'root' ? '/root' : '/home/' + S.user, USER: S.user, PWD: S.cwd, HOSTNAME: S.host, SHELL: '/bin/bash', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' })[v]);
}
function globExpand(word) {
  if (!/[*?]/.test(word)) return [word];
  const abs = word.startsWith('/'); const parts = word.split('/').filter(Boolean);
  let bases = [abs ? '/' : S.cwd];
  let rel = [abs ? '' : null];
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx]; const nb = [], nr = [];
    for (let k = 0; k < bases.length; k++) {
      const b = bases[k]; const r = rel[k];
      if (/[*?]/.test(part)) {
        const re = globRe(part);
        for (const c of kids(b)) { const nm = basename(c); if (nm.startsWith('.') && !part.startsWith('.')) continue; if (re.test(nm)) { nb.push(c); nr.push(r === null ? nm : (r === '' ? '/' + nm : r + '/' + nm)); } }
      } else if (part === '..' || part === '.') { nb.push(part === '..' ? dirname(b) : b); nr.push(r === null ? part : r + '/' + part); }
      else { const c = b === '/' ? '/' + part : b + '/' + part; if (N(c)) { nb.push(c); nr.push(r === null ? part : (r === '' ? '/' + part : r + '/' + part)); } }
    }
    bases = nb; rel = nr;
  }
  return rel.length ? rel.sort() : [word];
}
function subst(line) { return line.replace(/\$\(([^()]*)\)/g, (m, c) => { const r = capture(c); return stripAnsi(r).replace(/\n+$/, '').replace(/\n/g, ' '); }); }
function capture(cmd) { const r = runLine(cmd, { capture: true }); return r.out || ''; }

function runLine(line, opts = {}) {
  line = subst(line);
  const tk = tokenize(line);
  const res = { out: '', code: 0 };
  const emit = (s, cls) => { if (opts.capture) { if (cls !== 'err') res.out += s + (s.endsWith('\n') ? '' : '\n'); } else termPrint(s, cls); };
  if (tk.error) { emit('-bash: ' + tk.error, 'err'); return { code: 2 }; }
  const toks = tk.tokens; if (!toks.length) return res;
  // split by && || ;
  const chains = []; let cur = [], op = null;
  for (const t of toks) { if (t.op === '&&' || t.op === '||' || t.op === ';') { chains.push({ toks: cur, op }); op = t.op; cur = []; } else cur.push(t); }
  chains.push({ toks: cur, op });
  let last = 0;
  for (const ch of chains) {
    if (!ch.toks.length) continue;
    if (ch.op === '&&' && last !== 0) continue;
    if (ch.op === '||' && last === 0) continue;
    last = runPipeline(ch.toks, emit, opts);
    if (S._exitScript) break;
  }
  res.code = last; return res;
}
function runPipeline(toks, emit, opts) {
  const segs = [[]]; for (const t of toks) { if (t.op === '|') segs.push([]); else segs[segs.length - 1].push(t); }
  let stdin = null, code = 0;
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]; const args = []; let redir = null, errRedir = null, inRedir = null, mergeErr = false;
    let prevName = false;
    for (let i = 0; i < seg.length; i++) {
      const t = seg[i];
      if (t.op === '>' || t.op === '>>') { const f = seg[++i]; if (!f || f.op) { emit('-bash: syntax error near unexpected token `newline\'', 'err'); return 2; } redir = { path: expandVars(f.v), append: t.op === '>>' }; continue; }
      if (t.op === '2>') { const f = seg[++i]; errRedir = f ? f.v : null; continue; }
      if (t.op === '2>&1') { mergeErr = true; continue; }
      if (t.op === '<') { const f = seg[++i]; inRedir = f ? f.v : null; continue; }
      let v = t.sq ? t.v : expandVars(t.v);
      if (!t.q && !prevName && args[0] !== 'kubectl' && args[0] !== 'promql' && args[0] !== 'prom' && args[0] !== 'ansible') args.push(...globExpand(v)); else args.push(v);
      prevName = ['-name', '-iname', '-path'].includes(v);
    }
    if (!args.length && redir) { const e = writeFile(norm(redir.path), '', redir.append); if (e) { emit(`-bash: ${redir.path}: ${e}`, 'err'); return 1; } continue; }
    if (inRedir) { const c = fread(norm(inRedir)); if (c === null) { emit(`-bash: ${inRedir}: No such file or directory`, 'err'); return 1; } stdin = c; }
    const tty = !redir && si === segs.length - 1 && !opts.capture;
    const r = execCmd(args, stdin, { tty }) || {};
    if (r.editor) { openEditor(r.editor); return 0; }
    if (r.dash) { openDash(r.dash); }
    code = r.code || 0;
    let out = r.out || '', err = r.err || '';
    if (mergeErr && err) { out = out + (out && !out.endsWith('\n') ? '\n' : '') + err; err = ''; }
    if (err) { if (errRedir) { if (errRedir !== '/dev/null') writeFile(norm(errRedir), err + '\n', false); } else emit(err, 'err'); }
    if (si < segs.length - 1) { stdin = stripAnsi(out); continue; }
    if (redir) { const p = norm(redir.path); const text = stripAnsi(out); const e = writeFile(p, text && !text.endsWith('\n') ? text + '\n' : text, redir.append); if (e) { emit(`-bash: ${redir.path}: ${e}`, 'err'); return 1; } }
    else if (out) emit(out.replace(/\n$/, ''));
  }
  return code;
}
function execCmd(args, stdin, ctx) {
  const name = args[0];
  if (/^[A-Za-z_]+=/.test(name) && args.length === 1) return {};
  if (name === 'sudo') {
    if (args[1] === '-i' || args[1] === 'su' || (args[1] === '-s' && args.length === 2)) { if (S.user !== 'root') { S.prevUser = S.user; S.prevCwd = S.cwd; S.user = 'root'; S.cwd = '/root'; } return {}; }
    if (args.length < 2) return { err: 'usage: sudo command', code: 1 };
    if (!S.users[S.user]?.groups.includes('sudo') && S.user !== 'root') return { err: `${S.user} is not in the sudoers file.`, code: 1 };
    const was = S.sudo; S.sudo = true; try { return execCmd(args.slice(1), stdin, ctx); } finally { S.sudo = was; }
  }
  if (name.startsWith('./') || name.startsWith('/') && N(norm(name))?.t === 'f') return runScript(name, true);
  const c = CMDS[name];
  if (!c) return { err: `${name}: command not found`, code: 127 };
  try { return c.run(args.slice(1), stdin, ctx) || {}; }
  catch (e) { console.error(e); return { err: `${name}: internal error (${e.message})`, code: 1 }; }
}
function runScript(path, direct) {
  const p = norm(path), n = N(p);
  if (!n) return { err: `-bash: ${path}: No such file or directory`, code: 127 };
  if (n.t === 'd') return { err: `-bash: ${path}: Is a directory`, code: 126 };
  if (direct && !(bits(n) & 1)) return { err: `-bash: ${path}: Permission denied`, code: 126 };
  if (!(bits(n) & 4)) return { err: `bash: ${path}: Permission denied`, code: 126 };
  S.depth = (S.depth || 0) + 1; if (S.depth > 5) { S.depth--; return { err: 'bash: maximum nesting reached', code: 1 }; }
  const saveCwd = S.cwd; let code = 0;
  for (const raw of fread(p).split('\n')) { const l = raw.trim(); if (!l || l.startsWith('#')) continue; if (/^set\s+-/.test(l)) continue; if (/^(if|then|fi|for|do|done|while|else)\b/.test(l)) { termPrint(`${path}: this lab runs scripts line by line; '${l.split(' ')[0]}' blocks aren't supported, keep it simple`, 'err'); continue; } code = runLine(l).code; if (S._exitScript) { S._exitScript = false; break; } }
  S.cwd = saveCwd; S.depth--; S.flags.scriptRan = (S.flags.scriptRan || 0) + 1; onChange(); return { code };
}
function flags(args) { const f = new Set(), pos = []; for (const a of args) { if (a.startsWith('--')) f.add(a); else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) for (const ch of a.slice(1)) f.add(ch); else pos.push(a); } return { f, pos }; }
function readInputs(files, stdin, name) {
  if (!files.length) return { items: [{ name: '(standard input)', text: stdin ?? '' }], errs: [] };
  const items = [], errs = [];
  for (const f of files) { const p = norm(f), n = N(p); if (!n) errs.push(`${name}: ${f}: No such file or directory`); else if (n.t === 'd') errs.push(`${name}: ${f}: Is a directory`); else if (!canR(p)) errs.push(`${name}: ${f}: Permission denied`); else items.push({ name: f, text: fread(p) }); }
  return { items, errs };
}
const lines = t => { const l = t.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
function lsLong(p, nm, h) { const n = N(p); const sz = fsize(n); const d = new Date(Date.now() - 3600e3 * 26); return `${modeStr(n)} 1 ${n.o.padEnd(8)} ${n.g.padEnd(8)} ${String(h ? human(sz) : sz).padStart(h ? 5 : 8)} ${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${p2(d.getHours())}:${p2(d.getMinutes())} ${nm}`; }
function colorName(p, nm, tty) { const n = N(p); if (!tty || !n) return nm; if (n.t === 'd') return A.blue(nm); if (n.m & 0o111) return A.green(nm); return nm; }
function applyMode(m, spec) {
  if (/^[0-7]{3,4}$/.test(spec)) return parseInt(spec, 8);
  let mm = m;
  for (const part of spec.split(',')) {
    const r = /^([ugoa]*)([+\-=])([rwxX]*)$/.exec(part); if (!r) return null;
    let who = r[1] || 'a'; if (who.includes('a')) who = 'ugo';
    let b = 0; for (const ch of r[3]) b |= ch === 'r' ? 4 : ch === 'w' ? 2 : 1;
    for (const w of new Set(who)) { const sh = w === 'u' ? 6 : w === 'g' ? 3 : 0; const mask = b << sh; if (r[2] === '+') mm |= mask; else if (r[2] === '-') mm &= ~mask; else { mm &= ~(7 << sh); mm |= mask; } }
  }
  return mm;
}
function parseSize(s) { const r = /^([+-]?)(\d+)([kMGc]?)$/.exec(s); if (!r) return null; const mult = { k: 1024, M: 1048576, G: 1073741824, c: 1, '': 512 }[r[3]]; return { sign: r[1], bytes: +r[2] * mult }; }
function procKill(pr, sig) {
  S.procs = S.procs.filter(p => p !== pr);
  if (pr.svc && S.services[pr.svc]) { const s = S.services[pr.svc]; s.pid = null; s.state = sig === 9 ? 'failed' : 'inactive'; slog(s, `systemd[1]: ${s.name}.service: Main process exited, code=killed, status=${sig}/${sig === 9 ? 'KILL' : 'TERM'}`); }
  if (pr.onKill) pr.onKill();
}
function svcStatusText(s) {
  const st = s.state === 'active' ? A.green('active (running)') + ` since ${new Date(s.since).toUTCString().replace(' GMT', ' UTC')}` : s.state === 'failed' ? A.red('failed') + ' (Result: exit-code)' : 'inactive (dead)';
  const dot = s.state === 'active' ? A.green('●') : s.state === 'failed' ? A.red('×') : '○';
  let t = `${dot} ${s.name}.service - ${s.desc}\n     Loaded: loaded (/usr/lib/systemd/system/${s.name}.service; ${s.enabled ? 'enabled' : 'disabled'}; preset: enabled)\n     Active: ${st}`;
  if (s.pid) t += `\n   Main PID: ${s.pid} (${s.proc.cmd.split(' ')[0].split('/').pop()})`;
  if (s.logs.length) t += '\n\n' + s.logs.slice(-6).join('\n');
  return t;
}
function nginxCheck() {
  const conf = fread('/etc/nginx/nginx.conf'); if (conf === null) return ['nginx: [emerg] open() "/etc/nginx/nginx.conf" failed (2: No such file or directory)'];
  const known = new Set(['user', 'worker_processes', 'pid', 'error_log', 'events', 'worker_connections', 'multi_accept', 'http', 'include', 'default_type', 'sendfile', 'keepalive_timeout', 'access_log', 'server', 'listen', 'server_name', 'root', 'index', 'location', 'try_files', 'return', 'proxy_pass', 'gzip', 'types', 'tcp_nopush', 'client_max_body_size', 'add_header']);
  let depth = 0; const ls = conf.split('\n');
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i].replace(/#.*/, '').trim(); if (!l) continue;
    const word = l.split(/\s+/)[0].replace(/[;{]$/, '');
    if (l === '}') { depth--; if (depth < 0) return [`nginx: [emerg] unexpected "}" in /etc/nginx/nginx.conf:${i + 1}`]; continue; }
    if (word && !known.has(word)) return [`nginx: [emerg] unknown directive "${word}" in /etc/nginx/nginx.conf:${i + 1}`];
    if (l.endsWith('{')) { depth++; continue; }
    if (!l.endsWith(';')) return [`nginx: [emerg] directive "${word}" is not terminated by ";" in /etc/nginx/nginx.conf:${i + 1}`];
  }
  if (depth !== 0) return ['nginx: [emerg] unexpected end of file, expecting "}" in /etc/nginx/nginx.conf:' + ls.length];
  return null;
}
function localPort(port) { return S.procs.find(p => p.port === port); }
function httpGet(urlRaw) {
  let u = urlRaw.replace(/^https?:\/\//, ''); const slash = u.indexOf('/'); const hostport = slash < 0 ? u : u.slice(0, slash);
  let [host, port] = hostport.split(':'); port = port ? +port : 80;
  if (host === 'localhost' || host === '127.0.0.1' || host === S.host || host === '0.0.0.0') {
    const pr = localPort(port);
    if (!pr) return { err: `curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server`, code: 7 };
    if (pr.http) { const r = pr.http(); S.flags['curl:' + port] = r; onChange(); return { out: r }; }
    return { err: `curl: (52) Empty reply from server`, code: 52 };
  }
  if (S.hosts[host]) return hostHttp(host);
  if (S.k8s) return k8sHttp(host, port);
  return { err: `curl: (6) Could not resolve host: ${host}`, code: 6 };
}

/* ================= COMMANDS ================= */
const MAN = {};
const CMDS = {};
function cmd(name, man, run) { CMDS[name] = { run }; if (man) MAN[name] = man; }

cmd('help', null, () => ({ out: [A.bold('Commands available in this lab'), '',
  A.yellow('files    ') + ' pwd ls cd cat less head tail mkdir touch cp mv rm find grep wc sort uniq awk tree du df truncate',
  A.yellow('editing  ') + ' nano vim (both open the same simple editor)  echo  > >> |',
  A.yellow('users    ') + ' whoami id groups useradd groupadd usermod sudo chmod chown chgrp',
  A.yellow('processes') + ' ps top kill pkill pgrep systemctl journalctl crontab',
  A.yellow('network  ') + ' ip hostname ping curl ss lsof',
  A.yellow('ansible  ') + ' ansible ansible-playbook ansible-inventory ansible-vault',
  A.yellow('k8s      ') + ' kubectl',
  A.yellow('monitor  ') + ' promql prom promtool dash incident',
  A.yellow('misc     ') + ' man clear history date uptime free uname bash exit',
  '', 'Read the manual for any of them with ' + A.cyan('man <command>') + '.'].join('\n') }));
cmd('man', null, a => { if (!a[0]) return { err: 'What manual page do you want?\nFor example, try \'man man\'.', code: 1 }; const m = MAN[a[0]]; if (!m) return { err: `No manual entry for ${a[0]}`, code: 16 }; return { out: A.bold(a[0].toUpperCase()) + '\n\n' + m }; });
MAN.man = 'man <command>\n  Shows how a command is used in this lab.';
cmd('clear', 'clear\n  Clears the screen. Ctrl+L does the same.', () => { termClear(); return {}; });
cmd('history', 'history\n  Lists the commands you typed.', () => ({ out: S.hist.map((h, i) => String(i + 1).padStart(5) + '  ' + h).join('\n') }));
cmd('pwd', 'pwd\n  Prints the directory you are in.', () => ({ out: S.cwd }));
cmd('whoami', 'whoami\n  Prints your user name.', () => ({ out: S.sudo ? 'root' : S.user }));
cmd('hostname', 'hostname [-I]\n  Prints the machine name, or its IP addresses with -I.', a => ({ out: a[0] === '-I' ? '10.0.0.15 ' : S.host }));
cmd('date', null, () => ({ out: new Date().toString().replace(/ \(.*\)/, '') }));
cmd('uname', null, a => ({ out: a.includes('-a') ? `Linux ${S.host} 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux` : 'Linux' }));
cmd('uptime', null, () => ({ out: ` ${hhmm(Date.now())}:00 up 3 days,  4:12,  1 user,  load average: 0.21, 0.18, 0.12` }));
cmd('free', 'free [-h]\n  Shows memory usage.', a => ({ out: a.includes('-h') ? '               total        used        free      shared  buff/cache   available\nMem:           3.8Gi       1.1Gi       1.4Gi        12Mi       1.3Gi       2.5Gi\nSwap:          2.0Gi          0B       2.0Gi' : '               total        used        free\nMem:         3981120     1153024     1468416' }));
cmd('echo', 'echo [-n] [-e] <text>\n  Prints text. Combine with > (overwrite) or >> (append) to write files.', a => { let n = false, e = false; while (a[0] === '-n' || a[0] === '-e') { if (a[0] === '-n') n = true; else e = true; a = a.slice(1); } let s = a.join(' '); if (e) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t'); return { out: s + (n ? '' : '\n') }; });
cmd('true', null, () => ({})); cmd(':', null, () => ({})); cmd('false', null, () => ({ code: 1 }));
cmd('exit', 'exit\n  Leaves a root shell (opened with sudo -i).', () => { if (S.depth) { S._exitScript = true; return {}; } if (S.prevUser) { S.user = S.prevUser; S.cwd = S.prevCwd; S.prevUser = null; return { out: 'logout' }; } return { out: 'There is nowhere to log out to. Use the course map to change lessons.' }; });
cmd('cd', 'cd [dir]\n  Changes directory. "cd" alone goes home, "cd -" goes back, "cd .." goes up.', a => {
  let t = a[0]; if (t === undefined) t = '~'; if (t === '-') { t = S.prev; }
  const p = norm(t), n = N(p);
  if (!n) return { err: `-bash: cd: ${a[0]}: No such file or directory`, code: 1 };
  if (n.t !== 'd') return { err: `-bash: cd: ${a[0]}: Not a directory`, code: 1 };
  if (!(bits(n) & 1)) return { err: `-bash: cd: ${a[0]}: Permission denied`, code: 1 };
  S.prev = S.cwd; S.cwd = p; return {};
});
cmd('ls', 'ls [-l] [-a] [-h] [path...]\n  Lists files. -l long format (permissions, owner, group, size), -a shows hidden files, -h human sizes.', (a, _, ctx) => {
  const { f, pos } = flags(a); const targets = pos.length ? pos : ['.']; const out = [], err = [];
  const fileT = targets.filter(t => N(norm(t))?.t === 'f'), dirT = targets.filter(t => N(norm(t))?.t === 'd');
  targets.filter(t => !N(norm(t))).forEach(t => err.push(`ls: cannot access '${t}': No such file or directory`));
  if (fileT.length) out.push(f.has('l') ? fileT.map(t => lsLong(norm(t), t, f.has('h'))).join('\n') : fileT.join('  '));
  for (const t of dirT) {
    const p = norm(t);
    if (!canR(p)) { err.push(`ls: cannot open directory '${t}': Permission denied`); continue; }
    let ks = kids(p).filter(k => f.has('a') || !basename(k).startsWith('.'));
    if (targets.length > 1) out.push((out.length ? '\n' : '') + t + ':');
    if (f.has('l')) { out.push('total ' + ks.length * 4); if (f.has('a')) { out.push(lsLong(p, '.', f.has('h'))); out.push(lsLong(dirname(p), '..', f.has('h'))); } ks.forEach(k => out.push(lsLong(k, colorName(k, basename(k), ctx.tty), f.has('h')))); }
    else if (ks.length) out.push(ks.map(k => colorName(k, basename(k), ctx.tty)).join(ctx.tty ? '  ' : '\n'));
  }
  return { out: out.join('\n'), err: err.join('\n'), code: err.length ? 2 : 0 };
});
cmd('tree', 'tree [dir]\n  Draws a directory as a tree.', (a, _, ctx) => {
  const root = norm(a.filter(x => !x.startsWith('-'))[0] || '.'); if (N(root)?.t !== 'd') return { err: `${a[0]} [error opening dir]`, code: 2 };
  const out = [a[0] || '.']; let nd = 0, nf = 0;
  const walk = (p, pre) => { const ks = kids(p).filter(k => !basename(k).startsWith('.')); ks.forEach((k, i) => { const last = i === ks.length - 1; out.push(pre + (last ? '└── ' : '├── ') + colorName(k, basename(k), ctx.tty)); if (N(k).t === 'd') { nd++; if (canR(k)) walk(k, pre + (last ? '    ' : '│   ')); } else nf++; }); };
  walk(root, ''); out.push(`\n${nd} directories, ${nf} files`); return { out: out.join('\n') };
});
cmd('cat', 'cat [file...]\n  Prints file contents.', (a, stdin) => { const { items, errs } = readInputs(a.filter(x => x !== '-n'), stdin, 'cat'); let out = items.map(i => i.text).join(''); if (a.includes('-n')) out = lines(out).map((l, i) => String(i + 1).padStart(6) + '  ' + l).join('\n'); return { out, err: errs.join('\n'), code: errs.length ? 1 : 0 }; });
CMDS.less = CMDS.more = CMDS.cat; MAN.less = 'less <file>\n  In this lab, behaves like cat.';
function headTail(isHead) { return (a, stdin) => { let n = 10; const files = []; for (let i = 0; i < a.length; i++) { if (a[i] === '-n') n = +a[++i]; else if (/^-\d+$/.test(a[i])) n = +a[i].slice(1); else if (a[i] === '-f' || a[i] === '-F') { } else files.push(a[i]); } const { items, errs } = readInputs(files, stdin, isHead ? 'head' : 'tail'); const out = items.map(it => { const l = lines(it.text); return (items.length > 1 ? `==> ${it.name} <==\n` : '') + (isHead ? l.slice(0, n) : l.slice(-n)).join('\n'); }).join('\n\n'); return { out, err: errs.join('\n') }; }; }
cmd('head', 'head [-n N] [file]\n  First N lines (default 10).', headTail(true));
cmd('tail', 'tail [-n N] [-f] [file]\n  Last N lines (default 10). -f would keep following; here it prints and returns.', headTail(false));
cmd('wc', 'wc [-l] [-w] [-c] [file]\n  Counts lines, words, bytes.', (a, stdin) => { const { f, pos } = flags(a); const { items, errs } = readInputs(pos, stdin, 'wc'); const out = items.map(it => { const l = lines(it.text).length, w = it.text.split(/\s+/).filter(Boolean).length, c = it.text.length; const parts = []; if (f.has('l') || !f.size) parts.push(l); if (f.has('w') || !f.size) parts.push(w); if (f.has('c') || !f.size) parts.push(c); return parts.map(x => String(x).padStart(f.size === 1 ? 1 : 7)).join(' ') + (pos.length ? ' ' + it.name : ''); }).join('\n'); return { out, err: errs.join('\n') }; });
cmd('sort', 'sort [-r] [-n] [-h] [file]\n  Sorts lines.', (a, stdin) => { const { f, pos } = flags(a); const { items } = readInputs(pos, stdin, 'sort'); let l = lines(items.map(i => i.text).join('')); const hv = s => { const m = /^\s*([\d.]+)([KMGT]?)/.exec(s); return m ? +m[1] * ({ '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12 }[m[2]]) : 0; }; if (f.has('h')) l.sort((x, y) => hv(x) - hv(y)); else if (f.has('n')) l.sort((x, y) => parseFloat(x) - parseFloat(y)); else l.sort(); if (f.has('r')) l.reverse(); return { out: l.join('\n') }; });
cmd('uniq', 'uniq [-c]\n  Collapses repeated adjacent lines.', (a, stdin) => { const { f, pos } = flags(a); const { items } = readInputs(pos, stdin, 'uniq'); const l = lines(items.map(i => i.text).join('')); const out = []; for (const x of l) { if (out.length && out[out.length - 1][0] === x) out[out.length - 1][1]++; else out.push([x, 1]); } return { out: out.map(([x, n]) => f.has('c') ? String(n).padStart(7) + ' ' + x : x).join('\n') }; });
cmd('awk', "awk '{print $N}' [file]\n  Prints chosen columns. Only {print $1, $2...} is supported here.", (a, stdin) => { const prog = a[0] || ''; const m = /\{\s*print\s+(.*)\}/.exec(prog); if (!m) return { err: 'awk: only {print $N} programs are supported in this lab', code: 2 }; const { items } = readInputs(a.slice(1), stdin, 'awk'); const fields = m[1].split(',').map(x => x.trim()); return { out: lines(items.map(i => i.text).join('')).map(l => { const cols = l.trim().split(/\s+/); return fields.map(fd => fd === '$0' ? l : /^\$\d+$/.test(fd) ? (cols[+fd.slice(1) - 1] || '') : fd.replace(/"/g, '')).join(' '); }).join('\n') }; });
cmd('grep', 'grep [-i] [-n] [-v] [-r] [-c] [-l] [-E] <pattern> [file|dir...]\n  Prints lines matching a pattern. -r searches folders recursively.', (a, stdin) => {
  const { f, pos } = flags(a); if (!pos.length) return { err: 'Usage: grep [OPTION]... PATTERNS [FILE]...', code: 2 };
  const pat = pos[0]; let re; try { re = new RegExp(f.has('E') ? pat : pat.replace(/\\\|/g, '|'), f.has('i') ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.has('i') ? 'i' : ''); }
  let files = pos.slice(1); const errs = [];
  if (f.has('r') || f.has('R')) { if (!files.length) files = ['.']; const ex = []; for (const x of files) { const p = norm(x); if (N(p)?.t === 'd') descendants(p).filter(k => N(k).t === 'f').forEach(k => { if (canR(k)) ex.push(x === '.' ? k.slice(S.cwd.length + 1) : (x.endsWith('/') ? x : x + '/') + k.slice(p.length + 1)); }); else ex.push(x); } files = ex; }
  const { items, errs: e2 } = readInputs(files, stdin, 'grep'); errs.push(...e2);
  const multi = items.length > 1 || f.has('r'); const out = []; let any = false;
  for (const it of items) { let cnt = 0; lines(it.text).forEach((l, i) => { if (re.test(l) !== f.has('v')) { cnt++; any = true; if (!f.has('c') && !f.has('l')) out.push((multi ? A.mag(it.name) + ':' : '') + (f.has('n') ? A.green(i + 1) + ':' : '') + l); } }); if (f.has('c')) out.push((multi ? it.name + ':' : '') + cnt); if (f.has('l') && cnt) out.push(it.name); }
  return { out: out.join('\n'), err: errs.join('\n'), code: any ? 0 : 1 };
});
cmd('find', 'find [dir] [-name "pattern"] [-type f|d] [-size +100M] [-user name] [-maxdepth N]\n  Searches for files. Quote patterns: find /etc -name "*.conf"', a => {
  let i = 0; const starts = []; while (i < a.length && !a[i].startsWith('-')) starts.push(a[i++]); if (!starts.length) starts.push('.');
  const preds = []; let maxd = Infinity;
  for (; i < a.length; i++) { const k = a[i], v = a[i + 1];
    if (k === '-name' || k === '-iname') { const re = new RegExp(globRe(v).source, k === '-iname' ? 'i' : ''); preds.push(p => re.test(basename(p))); i++; }
    else if (k === '-type') { preds.push(p => N(p).t === (v === 'd' ? 'd' : 'f')); i++; }
    else if (k === '-size') { const sz = parseSize(v); if (!sz) return { err: `find: invalid argument \`${v}' to \`-size'`, code: 1 }; preds.push(p => { const n = N(p); if (n.t !== 'f') return false; const b = fsize(n); return sz.sign === '+' ? b > sz.bytes : sz.sign === '-' ? b < sz.bytes : Math.ceil(b / 1048576) === sz.bytes / 1048576; }); i++; }
    else if (k === '-user') { preds.push(p => N(p).o === v); i++; }
    else if (k === '-maxdepth') { maxd = +v; i++; }
    else if (k === '-perm' || k === '-mtime') { i++; }
    else if (k === '-print' || k === '-ls') { }
    else if (k === '-exec' || k === '-delete') return { err: `find: ${k} is turned off in this lab. Use find to locate, then act on the file yourself.`, code: 1 };
    else return { err: `find: unknown predicate \`${k}'`, code: 1 };
  }
  const out = [], err = [];
  for (const st of starts) { const sp = norm(st); if (!N(sp)) { err.push(`find: '${st}': No such file or directory`); continue; }
    const all = [sp, ...descendants(sp)];
    for (const p of all) { const depth = p === sp ? 0 : p.slice(sp.length).split('/').filter(Boolean).length; if (depth > maxd) continue;
      const par = dirname(p); if (p !== sp && !canR(par)) { const msg = `find: '${st === '.' ? '.' + par.slice(sp.length) : par}': Permission denied`; if (!err.includes(msg)) err.push(msg); continue; }
      if (preds.every(fn => fn(p))) out.push(st === '.' ? (p === sp ? '.' : './' + p.slice(sp === '/' ? 1 : sp.length + 1)) : (p === sp ? st : (st.endsWith('/') ? st.slice(0, -1) : st) + p.slice(sp.length))); }
  }
  return { out: out.join('\n'), err: err.join('\n'), code: err.length ? 1 : 0 };
});
cmd('mkdir', 'mkdir [-p] <dir...>\n  Creates directories. -p creates missing parents and does not complain if it exists.', a => {
  const { f, pos } = flags(a); const errs = [];
  for (const d of pos) { const p = norm(d);
    if (N(p)) { if (!f.has('p')) errs.push(`mkdir: cannot create directory '${d}': File exists`); continue; }
    if (!N(dirname(p)) && !f.has('p')) { errs.push(`mkdir: cannot create directory '${d}': No such file or directory`); continue; }
    const chain = []; let q = p; while (!N(q)) { chain.unshift(q); q = dirname(q); }
    if (!canW(chain[0])) { errs.push(`mkdir: cannot create directory '${d}': Permission denied`); continue; }
    const o = priv() ? 'root' : S.user; chain.forEach(c => S.fs[c] = { t: 'd', m: 0o755, o, g: o });
  }
  onChange(); return { err: errs.join('\n'), code: errs.length ? 1 : 0 };
});
cmd('touch', 'touch <file...>\n  Creates empty files (or updates their time).', a => { const errs = []; for (const x of a) { const p = norm(x); if (N(p)) continue; const e = writeFile(p, ''); if (e) errs.push(`touch: cannot touch '${x}': ${e}`); } return { err: errs.join('\n'), code: errs.length ? 1 : 0 }; });
cmd('rm', 'rm [-r] [-f] <path...>\n  Deletes files. -r deletes folders and everything inside. There is no undo.', a => {
  const { f, pos } = flags(a); const errs = [];
  for (const x of pos) { const p = norm(x), n = N(p);
    if (!n) { if (!f.has('f')) errs.push(`rm: cannot remove '${x}': No such file or directory`); continue; }
    if (p === '/' ) { errs.push("rm: it is dangerous to operate recursively on '/'"); continue; }
    if (n.t === 'd' && !f.has('r') && !f.has('R')) { errs.push(`rm: cannot remove '${x}': Is a directory`); continue; }
    const d = N(dirname(p)); if (!(bits(d) & 2) || (d.m & 0o1000 && n.o !== S.user && !priv())) { errs.push(`rm: cannot remove '${x}': Permission denied`); continue; }
    if (n.protect && !S.flags.allowProtect) { errs.push(`rm: cannot remove '${x}': Device or resource busy`); continue; }
    S.flags.deleted = (S.flags.deleted || []).concat(p); rmPath(p);
  }
  onChange(); return { err: errs.join('\n'), code: errs.length ? 1 : 0 };
});
function copyTree(src, dst) { const n = N(src); S.fs[dst] = Object.assign({}, n, { o: priv() ? n.o : S.user, g: priv() ? n.g : S.user }); if (priv()) { S.fs[dst].o = 'root'; S.fs[dst].g = 'root'; } if (n.t === 'd') descendants(src).forEach(k => { S.fs[dst + k.slice(src.length)] = Object.assign({}, N(k), { o: S.fs[dst].o, g: S.fs[dst].g }); }); }
function cpmv(isMv) { return a => {
  const { f, pos } = flags(a); const nm = isMv ? 'mv' : 'cp'; if (pos.length < 2) return { err: `${nm}: missing destination file operand after '${pos[0] || ''}'`, code: 1 };
  const dstRaw = pos.pop(); const dstP = norm(dstRaw); const errs = [];
  if (pos.length > 1 && N(dstP)?.t !== 'd') return { err: `${nm}: target '${dstRaw}' is not a directory`, code: 1 };
  for (const s of pos) { const sp = norm(s), sn = N(sp);
    if (!sn) { errs.push(`${nm}: cannot stat '${s}': No such file or directory`); continue; }
    if (!canR(sp)) { errs.push(`${nm}: cannot open '${s}' for reading: Permission denied`); continue; }
    if (sn.t === 'd' && !isMv && !f.has('r') && !f.has('R') && !f.has('a')) { errs.push(`cp: -r not specified; omitting directory '${s}'`); continue; }
    let target = N(dstP)?.t === 'd' ? (dstP === '/' ? '' : dstP) + '/' + basename(sp) : dstP;
    if (!N(dirname(target))) { errs.push(`${nm}: cannot create regular file '${dstRaw}': No such file or directory`); continue; }
    if (!canW(target) || (isMv && !canW(sp))) { errs.push(`${nm}: cannot ${isMv ? 'move' : 'create regular file'} '${isMv ? s : dstRaw}'${isMv ? ' to \'' + dstRaw + '\'' : ''}: Permission denied`); continue; }
    if (isMv) { const keep = descendants(sp).map(k => [k, N(k)]); S.fs[target] = sn; keep.forEach(([k, v]) => { S.fs[target + k.slice(sp.length)] = v; }); rmPath(sp); S.fs[target] = sn; keep.forEach(([k, v]) => { S.fs[target + k.slice(sp.length)] = v; }); }
    else { const keepContent = sn.gen ? sn.gen() : sn.c; copyTree(sp, target); if (sn.gen) { S.fs[target].c = keepContent; delete S.fs[target].gen; } }
  }
  onChange(); return { err: errs.join('\n'), code: errs.length ? 1 : 0 };
}; }
cmd('cp', 'cp [-r] <src...> <dest>\n  Copies files. -r for folders. If dest is a folder, the file keeps its name inside it.', cpmv(false));
cmd('mv', 'mv <src...> <dest>\n  Moves or renames.', cpmv(true));
cmd('truncate', 'truncate -s 0 <file>\n  Empties a file in place without deleting it.', a => { const i = a.indexOf('-s'); if (i < 0 || a[i + 1] !== '0') return { err: 'truncate: only "-s 0" is supported here', code: 1 }; const files = a.filter((x, j) => j !== i && j !== i + 1); const errs = []; for (const x of files) { const p = norm(x); if (!N(p)) { errs.push(`truncate: cannot open '${x}' for writing: No such file or directory`); continue; } const e = writeFile(p, ''); if (e) errs.push(`truncate: cannot open '${x}' for writing: ${e}`); } return { err: errs.join('\n'), code: errs.length ? 1 : 0 }; });
cmd('chmod', 'chmod [-R] <mode> <file...>\n  Changes permissions. Numeric: 755, 640 (owner/group/others; r=4 w=2 x=1).\n  Symbolic: u+x, g-w, o-rwx, a+r (u=user/owner, g=group, o=others, a=all).', a => {
  const { f, pos } = flags(a.filter(x => !/^[ugoa]*[+\-=][rwxX]*$/.test(x) || !x.startsWith('-'))); let mode = pos.shift(); if (!mode) return { err: 'chmod: missing operand', code: 1 };
  const errs = [];
  for (const x of pos) { const p = norm(x), n = N(p); if (!n) { errs.push(`chmod: cannot access '${x}': No such file or directory`); continue; }
    if (!priv() && n.o !== S.user) { errs.push(`chmod: changing permissions of '${x}': Operation not permitted`); continue; }
    const targets = f.has('R') ? [p, ...descendants(p)] : [p];
    for (const tp of targets) { const nm = applyMode(N(tp).m, mode); if (nm === null) return { err: `chmod: invalid mode: '${mode}'`, code: 1 }; N(tp).m = nm; } }
  onChange(); return { err: errs.join('\n'), code: errs.length ? 1 : 0 };
});
cmd('chown', 'chown [-R] <user>[:<group>] <file...>\n  Changes owner and optionally group. Needs root.', a => {
  const { f, pos } = flags(a); const spec = pos.shift(); if (!spec) return { err: 'chown: missing operand', code: 1 };
  const [u, g] = spec.split(':'); if (u && !hasUser(u)) return { err: `chown: invalid user: '${spec}'`, code: 1 }; if (g && !hasGroup(g)) return { err: `chown: invalid group: '${spec}'`, code: 1 };
  const errs = [];
  for (const x of pos) { const p = norm(x); if (!N(p)) { errs.push(`chown: cannot access '${x}': No such file or directory`); continue; }
    if (!priv()) { errs.push(`chown: changing ownership of '${x}': Operation not permitted`); continue; }
    (f.has('R') ? [p, ...descendants(p)] : [p]).forEach(tp => { if (u) N(tp).o = u; if (g) N(tp).g = g; }); }
  onChange(); return { err: errs.join('\n'), code: errs.length ? 1 : 0 };
});
cmd('chgrp', 'chgrp <group> <file>\n  Changes the group of a file.', a => { const g = a[0]; if (!hasGroup(g)) return { err: `chgrp: invalid group: '${g}'`, code: 1 }; return CMDS.chown.run([':' + g, ...a.slice(1)]); });
cmd('useradd', 'useradd [-m] [-s shell] [-G group1,group2] <name>\n  Creates a user (and a group with the same name). Needs root.', a => {
  if (!priv()) return { err: 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.', code: 1 };
  let name, groups = [], mkhome = false; for (let i = 0; i < a.length; i++) { if (a[i] === '-m') mkhome = true; else if (a[i] === '-G') groups = (a[++i] || '').split(','); else if (a[i] === '-s' || a[i] === '-g' || a[i] === '-c' || a[i] === '-d') i++; else if (!a[i].startsWith('-')) name = a[i]; }
  if (!name) return { err: 'Usage: useradd [options] LOGIN', code: 2 };
  if (hasUser(name)) return { err: `useradd: user '${name}' already exists`, code: 9 };
  for (const g of groups) if (!hasGroup(g)) return { err: `useradd: group '${g}' does not exist`, code: 6 };
  if (hasGroup(name)) return { err: `useradd: group ${name} exists - if you want to add this user to that group, use -g.`, code: 9 };
  const uid = S.nextUid++; S.groups[name] = uid; S.users[name] = { uid, groups: [name, ...groups], home: '/home/' + name, shell: '/bin/sh' };
  if (mkhome) S.fs['/home/' + name] = { t: 'd', m: 0o750, o: name, g: name };
  onChange(); return {};
});
CMDS.adduser = { run: a => CMDS.useradd.run(['-m', ...a.filter(x => !x.startsWith('--'))]) };
cmd('groupadd', 'groupadd <name>\n  Creates a group. Needs root.', a => { if (!priv()) return { err: 'groupadd: Permission denied.\ngroupadd: cannot lock /etc/group; try again later.', code: 10 }; const g = a.find(x => !x.startsWith('-')); if (!g) return { err: 'Usage: groupadd [options] GROUP', code: 2 }; if (hasGroup(g)) return { err: `groupadd: group '${g}' already exists`, code: 9 }; S.groups[g] = S.nextUid++; onChange(); return {}; });
cmd('usermod', 'usermod -aG <group> <user>\n  Adds a user to a group (-a keeps existing groups). Needs root.', a => {
  if (!priv()) return { err: 'usermod: Permission denied.\nusermod: cannot lock /etc/passwd; try again later.', code: 1 };
  let append = false, gl = null, user; for (let i = 0; i < a.length; i++) { if (a[i] === '-aG' || a[i] === '-Ga') { append = true; gl = a[++i]; } else if (a[i] === '-a') append = true; else if (a[i] === '-G') gl = a[++i]; else user = a[i]; }
  if (!user || !gl) return { err: 'Usage: usermod -aG GROUP USER', code: 2 };
  if (!hasUser(user)) return { err: `usermod: user '${user}' does not exist`, code: 6 };
  const gs = gl.split(','); for (const g of gs) if (!hasGroup(g)) return { err: `usermod: group '${g}' does not exist`, code: 6 };
  const u = S.users[user]; u.groups = append ? [...new Set([...u.groups, ...gs])] : [u.groups[0], ...gs]; onChange(); return {};
});
cmd('userdel', null, a => { if (!priv()) return { err: 'userdel: Permission denied.', code: 1 }; const u = a.find(x => !x.startsWith('-')); if (!hasUser(u)) return { err: `userdel: user '${u}' does not exist`, code: 6 }; delete S.users[u]; onChange(); return {}; });
cmd('id', 'id [user]\n  Shows a user\'s uid and groups.', a => { const u = a[0] || (S.sudo ? 'root' : S.user); if (!hasUser(u)) return { err: `id: '${u}': no such user`, code: 1 }; const x = S.users[u]; return { out: `uid=${x.uid}(${u}) gid=${S.groups[x.groups[0]]}(${x.groups[0]}) groups=` + x.groups.map(g => `${S.groups[g]}(${g})`).join(',') }; });
cmd('groups', null, a => { const u = a[0] || S.user; return hasUser(u) ? { out: (a[0] ? u + ' : ' : '') + S.users[u].groups.join(' ') } : { err: `groups: '${u}': no such user`, code: 1 }; });
cmd('passwd', null, () => ({ out: 'passwd: password updated successfully (simulated)' }));
cmd('ps', 'ps aux\n  Lists all running processes with owner, PID, CPU and memory.', a => {
  const all = a.join('').includes('a') || a.includes('-ef') || a.includes('-e');
  const ps = all ? S.procs : S.procs.filter(p => p.user === S.user);
  if (a.includes('-ef')) return { out: 'UID          PID    PPID  C STIME TTY          TIME CMD\n' + ps.map(p => `${p.user.padEnd(8)} ${String(p.pid).padStart(7)} ${String(p.pid === 1 ? 0 : 1).padStart(7)}  0 08:${p2(p.pid % 60)} ?        00:00:0${p.pid % 9} ${p.cmd}`).join('\n') };
  return { out: 'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' + ps.map(p => `${p.user.slice(0, 8).padEnd(8)} ${String(p.pid).padStart(7)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${String(Math.round(p.mem * 41000 + 9000)).padStart(6)} ${String(Math.round(p.mem * 39000 + 4000)).padStart(5)} ?        S    08:${p2(p.pid % 60)}   0:0${p.pid % 9} ${p.cmd}`).join('\n') };
});
cmd('top', 'top\n  Snapshot of the busiest processes.', () => { const ps = [...S.procs].sort((x, y) => y.cpu - x.cpu); return { out: `top - ${hhmm(Date.now())}:00 up 3 days,  1 user,  load average: 0.42, 0.31, 0.20\nTasks: ${ps.length} total,   1 running\n%Cpu(s):  ${ps.reduce((s, p) => s + p.cpu, 0).toFixed(1)} us,  0.8 sy, 90.1 id\nMiB Mem :   3888.0 total,   1434.0 free,   1126.0 used\n\n    PID USER      %CPU  %MEM COMMAND\n` + ps.map(p => `${String(p.pid).padStart(7)} ${p.user.padEnd(9)} ${p.cpu.toFixed(1).padStart(4)}  ${p.mem.toFixed(1).padStart(4)} ${p.cmd.split(' ')[0]}`).join('\n') + '\n\n' + A.dim('(snapshot; the real top refreshes live, press q to quit)') }; });
cmd('kill', 'kill [-9] <pid...>\n  Sends a signal to a process (default TERM, polite stop). -9 (KILL) forces it.', a => {
  let sig = 15; const errs = [];
  for (const x of a) { if (x === '-9' || x === '-KILL' || x === '-SIGKILL') { sig = 9; continue; } if (x.startsWith('-')) continue;
    const pr = S.procs.find(p => p.pid === +x); if (!pr) { errs.push(`-bash: kill: (${x}) - No such process`); continue; }
    if (!priv() && pr.user !== S.user) { errs.push(`-bash: kill: (${x}) - Operation not permitted`); continue; }
    if (pr.pid === 1) { continue; }
    if (pr.ignoreTerm && sig !== 9) continue;
    procKill(pr, sig); }
  onChange(); return { err: errs.join('\n'), code: errs.length ? 1 : 0 };
});
function killByName(a, full) { const nm = a.filter(x => !x.startsWith('-'))[0]; if (!nm) return { err: 'pkill: no matching criteria specified', code: 2 }; const m = S.procs.filter(p => (a.includes('-f') ? p.cmd : p.cmd.split(' ')[0].split('/').pop()).includes(nm)); if (!m.length) return { code: 1 }; const errs = []; m.forEach(pr => { if (!priv() && pr.user !== S.user) errs.push(`pkill: killing pid ${pr.pid} failed: Operation not permitted`); else if (pr.pid !== 1) procKill(pr, a.includes('-9') ? 9 : 15); }); onChange(); return { err: errs.join('\n') }; }
cmd('pkill', 'pkill [-f] <name>\n  Kills processes by name (-f matches the full command line).', killByName);
CMDS.killall = CMDS.pkill;
cmd('pgrep', 'pgrep [-a] [-f] <name>\n  Finds PIDs by name.', a => { const nm = a.filter(x => !x.startsWith('-'))[0]; const m = S.procs.filter(p => (a.includes('-f') ? p.cmd : p.cmd.split(' ')[0].split('/').pop()).includes(nm)); return m.length ? { out: m.map(p => a.includes('-a') || a.includes('-l') ? p.pid + ' ' + p.cmd : p.pid).join('\n') } : { code: 1 }; });
cmd('systemctl', 'systemctl <status|start|stop|restart|reload|enable|disable|is-active|is-enabled|list-units> [service]\n  Manages services. Changing state needs root. "enable" makes it start at boot.', a => {
  const sub = a.find(x => !x.startsWith('-')) || 'list-units'; const rest = a.filter(x => !x.startsWith('-') && x !== sub);
  if (sub === 'list-units' || sub === 'list-unit-files') return { out: '  UNIT                LOAD   ACTIVE   SUB     DESCRIPTION\n' + Object.values(S.services).map(s => `  ${(s.name + '.service').padEnd(19)} loaded ${(s.state === 'active' ? 'active' : s.state).padEnd(8)} ${(s.state === 'active' ? 'running' : 'dead').padEnd(7)} ${s.desc}`).join('\n') };
  if (sub === 'daemon-reload') return priv() ? {} : { err: 'Failed to reload daemon: Access denied', code: 1 };
  if (!rest.length) return { err: `Too few arguments.`, code: 1 };
  const outs = [], errs = []; let code = 0;
  for (const raw of rest) { const nm = raw.replace(/\.service$/, ''); const s = S.services[nm];
    if (!s) { if (sub === 'status') errs.push(`Unit ${nm}.service could not be found.`); else errs.push(`Failed to ${sub} ${nm}.service: Unit ${nm}.service not found.`); code = sub === 'status' ? 4 : 5; continue; }
    if (sub === 'status') { outs.push(svcStatusText(s)); if (s.state !== 'active') code = 3; continue; }
    if (sub === 'is-active') { outs.push(s.state === 'active' ? 'active' : s.state); if (s.state !== 'active') code = 3; continue; }
    if (sub === 'is-enabled') { outs.push(s.enabled ? 'enabled' : 'disabled'); if (!s.enabled) code = 1; continue; }
    if (!priv()) { errs.push(`Failed to ${sub} ${nm}.service: Access denied\nSee system logs and 'systemctl status ${nm}.service' for details.`); code = 1; continue; }
    if (sub === 'start' || sub === 'restart' || sub === 'reload') { if (sub !== 'start') svcStop(s); if (!svcStart(s)) { errs.push(`Job for ${nm}.service failed because the control process exited with error code.\nSee "systemctl status ${nm}.service" and "journalctl -xeu ${nm}.service" for details.`); code = 1; } }
    else if (sub === 'stop') svcStop(s);
    else if (sub === 'enable') { if (!s.enabled) outs.push(`Created symlink /etc/systemd/system/multi-user.target.wants/${nm}.service → /usr/lib/systemd/system/${nm}.service.`); s.enabled = true; if (a.includes('--now') && s.state !== 'active' && !svcStart(s)) { errs.push(`Job for ${nm}.service failed because the control process exited with error code.\nSee "systemctl status ${nm}.service" and "journalctl -xeu ${nm}.service" for details.`); code = 1; } }
    else if (sub === 'disable') { if (s.enabled) outs.push(`Removed "/etc/systemd/system/multi-user.target.wants/${nm}.service".`); s.enabled = false; }
    else { errs.push(`Unknown command verb '${sub}'.`); code = 1; }
  }
  onChange(); return { out: outs.join('\n\n'), err: errs.join('\n'), code };
});
CMDS.service = { run: a => CMDS.systemctl.run([a[1], a[0]]) };
cmd('journalctl', 'journalctl [-u service] [-n N] [-xe] [--no-pager]\n  Shows system logs. -u filters to one service.', a => {
  let u = null, n = 50; for (let i = 0; i < a.length; i++) { if (a[i] === '-u' || a[i] === '--unit') u = a[++i]; else if (a[i].startsWith('-u') && a[i].length > 2 && !a[i].startsWith('--')) u = a[i].slice(2); else if (a[i].startsWith('--unit=')) u = a[i].slice(7); else if (a[i] === '-n') n = +a[++i]; else if (/^-xeu$/.test(a[i]) || a[i] === '-xeu') u = a[++i]; }
  if (!priv() && !S.users[S.user].groups.includes('adm')) { /* real journalctl shows limited logs; keep it usable */ }
  if (u) { u = u.replace(/\.service$/, ''); const s = S.services[u]; if (!s || !s.logs.length) return { out: '-- No entries --' }; return { out: s.logs.slice(-n).join('\n') }; }
  const all = Object.values(S.services).flatMap(s => s.logs); return { out: all.slice(-n).join('\n') || '-- No entries --' };
});
cmd('nginx', 'nginx -t\n  Tests the nginx configuration without starting it.', a => { if (!a.includes('-t')) return { err: 'nginx: use "systemctl start nginx" in this lab, or "nginx -t" to test the config', code: 1 }; if (!S.services.nginx) return { err: 'nginx: command not found', code: 127 }; const e = nginxCheck(); if (e) return { err: e.join('\n') + '\nnginx: configuration file /etc/nginx/nginx.conf test failed', code: 1 }; return { err: 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful' }; });
function ssOut(port) {
  const rows = S.procs.filter(p => p.port && (!port || p.port === port)).sort((x, y) => x.port - y.port);
  return 'Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process\n' + rows.map(p => `tcp   LISTEN 0      511          0.0.0.0:${String(p.port).padEnd(6)}      0.0.0.0:*     ${priv() || p.user === S.user ? `users:(("${p.cmd.split(' ')[0].split('/').pop()}",pid=${p.pid},fd=${3 + p.pid % 5}))` : ''}`).join('\n');
}
cmd('ss', 'ss -tulpn\n  Lists listening ports. -p shows the owning process (only your own unless you use sudo).', () => ({ out: ssOut() }));
CMDS.netstat = CMDS.ss; MAN.netstat = MAN.ss;
cmd('lsof', 'lsof -i :<port>\n  Shows which process uses a port.', a => { const m = a.join(' ').match(/:(\d+)/); const port = m ? +m[1] : null; const rows = S.procs.filter(p => p.port && (!port || p.port === port) && (priv() || p.user === S.user)); if (!rows.length) return { code: 1 }; return { out: 'COMMAND   PID     USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\n' + rows.map(p => `${p.cmd.split(' ')[0].split('/').pop().slice(0, 9).padEnd(9)} ${String(p.pid).padStart(5)} ${p.user.padStart(8)}    3u  IPv4  21${p.pid}      0t0  TCP *:${p.port} (LISTEN)`).join('\n') }; });
cmd('ip', 'ip a\n  Shows network interfaces and addresses.', () => ({ out: `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff\n    inet 10.0.0.15/24 brd 10.0.0.255 scope global eth0` }));
cmd('ping', 'ping [-c N] <host>\n  Checks if a host answers.', a => { const h = a.filter(x => !x.startsWith('-') && !/^\d+$/.test(x))[0]; const ok = ['localhost', '127.0.0.1', S.host, 'web1', 'web2', 'db1', 'google.com', '8.8.8.8'].includes(h) || S.hosts[h]; if (!ok) return { err: `ping: ${h}: Name or service not known`, code: 2 }; const ip = HOSTIP[h] || '127.0.0.1'; return { out: `PING ${h} (${ip}) 56(84) bytes of data.\n` + [1, 2, 3, 4].map(i => `64 bytes from ${ip}: icmp_seq=${i} ttl=64 time=0.${30 + i * 7} ms`).join('\n') + `\n\n--- ${h} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss` }; });
cmd('curl', 'curl [-s] [-I] <url>\n  Makes an HTTP request, e.g. curl http://localhost:8080', a => { const u = a.filter(x => !x.startsWith('-'))[0]; if (!u) return { err: 'curl: try \'curl --help\' for more information', code: 2 }; const r = httpGet(u); if (a.includes('-I') && r.out) return { out: 'HTTP/1.1 200 OK\nServer: nginx/1.24.0 (Ubuntu)\nContent-Type: text/html' }; return r; });
CMDS.wget = { run: a => CMDS.curl.run(a.filter(x => x !== '-qO-' && x !== '-O-')) };
function diskUsed() { let u = S.diskBase || 7.4 * 1073741824; for (const n of Object.values(S.fs)) if (n.t === 'f' && n.size) u += n.size; return u; }
const DISK = 20 * 1073741824;
cmd('df', 'df [-h]\n  Shows free space per filesystem.', a => { const h = a.join('').includes('h'); const used = diskUsed(); const pct = Math.min(100, Math.ceil(used / DISK * 100)); const f = b => h ? human(b) : String(Math.round(b / 1024)); return { out: `Filesystem      ${h ? 'Size  Used Avail' : '1K-blocks     Used Available'} Use% Mounted on\ntmpfs           ${h ? '390M  1.2M  389M' : '  399124     1180    397944'}   1% /run\n/dev/sda1       ${h ? `${f(DISK).padStart(4)}  ${f(used).padStart(4)}  ${f(Math.max(0, DISK - used)).padStart(4)}` : `${f(DISK).padStart(9)} ${f(used).padStart(8)} ${f(Math.max(0, DISK - used)).padStart(9)}`} ${String(pct).padStart(3)}% /\ntmpfs           ${h ? '1.9G     0  1.9G' : ' 1995620        0   1995620'}   0% /dev/shm` }; });
function dirSize(p) { const n = N(p); if (!n) return 0; if (n.t === 'f') return fsize(n); return 4096 + descendants(p).reduce((s, k) => s + (N(k).t === 'f' ? fsize(N(k)) : 4096), 0); }
cmd('du', 'du [-s] [-h] [--max-depth=1] [path...]\n  Shows how much space folders use. Try: du -sh /var/*', a => {
  const { f, pos } = flags(a); const h = f.has('h'); let md = Infinity; for (const x of a) { const m = /^--max-depth=(\d+)$/.exec(x); if (m) md = +m[1]; } if (f.has('d')) md = 1;
  const fmt = b => (h ? human(b) : String(Math.ceil(b / 1024))).padEnd(7);
  const out = [], err = [];
  for (const x of (pos.length ? pos : ['.'])) { const p = norm(x); if (!N(p)) { err.push(`du: cannot access '${x}': No such file or directory`); continue; }
    if (!canR(p) && N(p).t === 'd') { err.push(`du: cannot read directory '${x}': Permission denied`); continue; }
    if (f.has('s') || N(p).t === 'f') { out.push(fmt(dirSize(p)) + ' ' + x); continue; }
    const dirs = [p, ...descendants(p).filter(k => N(k).t === 'd')].filter(k => (k === p ? 0 : k.slice(p.length).split('/').filter(Boolean).length) <= md).reverse();
    dirs.forEach(k => out.push(fmt(dirSize(k)) + ' ' + (k === p ? x : (x === '.' ? '.' : x.replace(/\/$/, '')) + k.slice(p.length)))); }
  return { out: out.join('\n'), err: err.join('\n') };
});
cmd('crontab', 'crontab -l | -e | -r\n  -l lists your scheduled jobs, -e edits them.\n  Line format: minute hour day-of-month month day-of-week command\n  Example: 0 3 * * * /path/to/job.sh  (every day at 03:00)', a => {
  if (a.includes('-l')) return S.crontab.trim() ? { out: S.crontab.replace(/\n$/, '') } : { err: `no crontab for ${S.user}`, code: 1 };
  if (a.includes('-e')) return { editor: { path: '(crontab)', crontab: true, content: S.crontab || '# m h  dom mon dow   command\n' } };
  if (a.includes('-r')) { S.crontab = ''; onChange(); return {}; }
  return { err: 'usage: crontab [-l | -e | -r]', code: 1 };
});
function editCmd(a) { const f = a.filter(x => !x.startsWith('-') && !x.startsWith('+'))[0]; if (!f) return { err: 'Give the editor a file name, e.g. nano notes.txt', code: 1 }; const p = norm(f), n = N(p); if (n && n.t === 'd') return { err: `"${f}" is a directory`, code: 1 }; if (n && !canR(p)) return { err: `[ Error reading ${f}: Permission denied ]`, code: 1 }; return { editor: { path: p, display: f, content: n ? fread(p) : '', sudo: S.sudo, isNew: !n } }; }
cmd('nano', 'nano <file>\n  Opens a file in the editor. Ctrl+S saves, Ctrl+X closes.\n  Editing system files needs root: sudo nano /etc/...', editCmd);
CMDS.vim = CMDS.vi = CMDS.code = CMDS.nano; MAN.vim = MAN.vi = MAN.nano;
cmd('bash', 'bash <script>\n  Runs a script. Or make it executable (chmod +x) and run ./script.sh', a => a[0] ? runScript(a[0], false) : { out: '(you are already in bash)' });
CMDS.sh = CMDS.bash;
cmd('which', null, a => a.map(x => CMDS[x] ? '/usr/bin/' + x : null).filter(Boolean).length ? { out: a.filter(x => CMDS[x]).map(x => '/usr/bin/' + x).join('\n') } : { code: 1 });
cmd('apt', 'apt install <pkg>\n  Installs packages. Needs root.', a => { if (!priv()) return { err: 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?', code: 100 }; if (a[0] === 'update') return { out: 'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease\nReading package lists... Done' }; if (a[0] === 'install') return { out: 'Reading package lists... Done\n' + a.slice(1).filter(x => !x.startsWith('-')).map(p => `${p} is already the newest version.`).join('\n') }; return { err: 'E: Invalid operation ' + (a[0] || ''), code: 100 }; });
CMDS['apt-get'] = CMDS.apt;
cmd('env', null, () => ({ out: `USER=${S.user}\nHOME=/home/${S.user}\nPWD=${S.cwd}\nSHELL=/bin/bash\nPATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin` }));
cmd('su', null, a => (a[0] === '-' || !a.length || a[0] === 'root') ? { err: 'su: Authentication failure (use sudo -i in this lab)', code: 1 } : { err: `su: user ${a[0]} does not exist or the user entry does not contain all the required fields`, code: 1 });
cmd('stat', 'stat <file>\n  Shows file details including permissions in numbers.', a => { const p = norm(a[0] || ''), n = N(p); if (!n) return { err: `stat: cannot statx '${a[0]}': No such file or directory`, code: 1 }; return { out: `  File: ${a[0]}\n  Size: ${fsize(n)}\tBlocks: 8   IO Block: 4096   ${n.t === 'd' ? 'directory' : 'regular file'}\nAccess: (${'0' + (n.m & 0o777).toString(8)}/${modeStr(n)})  Uid: ( ${S.users[n.o]?.uid ?? 0}/ ${n.o})   Gid: ( ${S.groups[n.g] ?? 0}/ ${n.g})` }; });
