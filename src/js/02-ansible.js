/* ================= ANSIBLE ================= */
const HOSTIP = { web1: '10.0.1.11', web2: '10.0.1.12', db1: '10.0.1.21', localhost: '127.0.0.1' };
const PKGS = new Set(['nginx', 'apache2', 'git', 'curl', 'htop', 'python3', 'postgresql', 'ufw', 'docker.io', 'tree', 'vim', 'unzip', 'fail2ban', 'ntp', 'chrony']);
function newHost(name) { return { name, pkgs: new Set(['python3', 'curl', 'vim']), svcs: {}, files: {}, dirs: new Set(['/etc', '/var', '/var/www', '/var/www/html', '/tmp', '/opt', '/home', '/etc/nginx', '/usr/share/nginx/html']), users: new Set(['root', 'ubuntu']) }; }
function hostHttp(h) {
  const H = S.hosts[h];
  if (!H.svcs.nginx?.active) return { err: `curl: (7) Failed to connect to ${h} port 80 after 3 ms: Couldn't connect to server`, code: 7 };
  const page = H.files['/var/www/html/index.html'] ?? '<!DOCTYPE html>\n<html><head><title>Welcome to nginx!</title></head>\n<body><h1>Welcome to nginx!</h1></body></html>';
  S.flags['curlHost:' + h] = page; onChange(); return { out: page };
}
function findInventory(args) {
  let i = args.indexOf('-i'); if (i < 0) i = args.indexOf('--inventory');
  if (i >= 0) return norm(args[i + 1] || '');
  for (let d = S.cwd; ; d = dirname(d)) { const c = fread((d === '/' ? '' : d) + '/ansible.cfg'); if (c) { const m = /^\s*inventory\s*=\s*(\S+)/m.exec(c); if (m) return m[1].startsWith('/') ? m[1] : (d === '/' ? '' : d) + '/' + m[1].replace(/^\.\//, ''); } if (d === '/') break; }
  return '/etc/ansible/hosts';
}
function parseInventory(path) {
  const text = fread(path);
  if (text === null) return { warn: `[WARNING]: Unable to parse ${path} as an inventory source\n[WARNING]: No inventory was parsed, only implicit localhost is available`, groups: { all: [] }, vars: {} };
  const inv = { groups: { all: [], ungrouped: [] }, vars: {}, path }; let g = 'ungrouped', mode = 'hosts'; const children = {};
  for (const raw of text.split('\n')) {
    const l = raw.replace(/[#;].*$/, '').trim(); if (!l) continue;
    const m = /^\[([^\]:]+)(?::(vars|children))?\]$/.exec(l);
    if (m) { g = m[1]; mode = m[2] || 'hosts'; if (mode === 'hosts') inv.groups[g] = inv.groups[g] || []; if (mode === 'children') children[g] = children[g] || []; continue; }
    if (/^\[/.test(l)) return { error: `[WARNING]: * Failed to parse ${path} with ini plugin: ${path}:${text.split('\n').indexOf(raw) + 1}: Section [${l}] has unknown type` };
    const parts = l.split(/\s+/);
    if (mode === 'vars') { const [k, ...v] = l.split('='); (inv.gvars = inv.gvars || {})[g] = Object.assign((inv.gvars || {})[g] || {}, { [k.trim()]: v.join('=').trim() }); continue; }
    if (mode === 'children') { children[g].push(parts[0]); continue; }
    const h = parts[0]; inv.groups[g].push(h); if (!inv.groups.all.includes(h)) inv.groups.all.push(h);
    inv.vars[h] = Object.assign(inv.vars[h] || {}, Object.fromEntries(parts.slice(1).map(p => p.split('=')).filter(x => x.length === 2)));
  }
  for (const [g2, ch] of Object.entries(children)) { inv.groups[g2] = [...new Set([...(inv.groups[g2] || []), ...ch.flatMap(c => inv.groups[c] || [])])]; }
  for (const [g2, vs] of Object.entries(inv.gvars || {})) for (const h of inv.groups[g2] || []) inv.vars[h] = Object.assign({}, vs, inv.vars[h]);
  return inv;
}
function resolvePattern(inv, pat) {
  const out = new Set();
  for (const p of String(pat).split(/[,:]/).map(s => s.trim()).filter(Boolean)) {
    if (p === 'all' || p === '*') inv.groups.all.forEach(h => out.add(h));
    else if (inv.groups[p]) inv.groups[p].forEach(h => out.add(h));
    else if (inv.groups.all.includes(p)) out.add(p);
    else if (p.includes('*')) { const re = globRe(p); inv.groups.all.filter(h => re.test(h)).forEach(h => out.add(h)); }
  }
  return [...out];
}
function reach(h, inv) { const target = inv.vars[h]?.ansible_host || h; if (S.hosts[target]) return target; const byIp = Object.entries(HOSTIP).find(([n, ip]) => ip === target && S.hosts[n]); return byIp ? byIp[0] : null; }
function unreachable(h) { return `${A.red(`${h} | UNREACHABLE! => {\n    "changed": false,\n    "msg": "Failed to connect to the host via ssh: ssh: Could not resolve hostname ${h}: Name or service not known",\n    "unreachable": true\n}`)}`; }
function parseKV(s) { const o = {}; const re = /(\w+)=("[^"]*"|'[^']*'|\S+)/g; let m; while ((m = re.exec(s))) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); return o; }
function render(str, vars) {
  return String(str).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, expr) => {
    const parts = expr.split('|').map(x => x.trim()); let name = parts[0]; let val = vars[name];
    if (/^["'].*["']$/.test(name)) val = name.slice(1, -1);
    for (const flt of parts.slice(1)) { const d = /^default\((.*)\)$/.exec(flt); if (d && (val === undefined)) val = d[1].replace(/^["']|["']$/g, ''); else if (flt === 'upper') val = String(val).toUpperCase(); else if (flt === 'lower') val = String(val).toLowerCase(); }
    if (val === undefined) throw new Error(`AnsibleUndefinedVariable: '${name}' is undefined`);
    return String(val);
  });
}
function deepRender(v, vars) { if (typeof v === 'string') return render(v, vars); if (Array.isArray(v)) return v.map(x => deepRender(x, vars)); if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepRender(x, vars)])); return v; }
const isSysPath = p => !/^\/(tmp|home)\//.test(p);
const truthy = v => v === true || v === 'yes' || v === 'true' || v === 'True' || v === 1;
const MODALIAS = { 'ansible.builtin.apt': 'apt', 'ansible.builtin.package': 'apt', package: 'apt', yum: 'apt', dnf: 'apt', 'ansible.builtin.service': 'service', 'ansible.builtin.systemd': 'service', 'ansible.builtin.systemd_service': 'service', systemd: 'service', systemd_service: 'service', 'ansible.builtin.template': 'template', 'ansible.builtin.copy': 'copy', 'ansible.builtin.file': 'file', 'ansible.builtin.user': 'user', 'ansible.builtin.command': 'command', 'ansible.builtin.shell': 'shell', 'ansible.builtin.debug': 'debug', 'ansible.builtin.ping': 'ping', 'ansible.builtin.group': 'group' };
const MODS = new Set(['apt', 'service', 'template', 'copy', 'file', 'user', 'command', 'shell', 'debug', 'ping', 'group']);
const TASKKEYS = new Set(['name', 'notify', 'become', 'when', 'register', 'loop', 'with_items', 'tags', 'vars', 'ignore_errors', 'changed_when', 'become_user', 'listen', 'delegate_to', 'run_once', 'no_log']);
function taskModule(t) { const ks = Object.keys(t).filter(k => !TASKKEYS.has(k)); if (ks.length === 0) return { err: 'no module/action detected in task.' }; if (ks.length > 1) return { err: `conflicting action statements: ${ks.join(', ')}` }; const k = ks[0]; const m = MODALIAS[k] || k; if (!MODS.has(m)) return { err: `couldn't resolve module/action '${k}'. This often indicates a misspelling, missing collection, or incorrect module path.` }; let a = t[k]; if (typeof a === 'string') a = (m === 'command' || m === 'shell') ? { cmd: a } : parseKV(a); return { mod: m, args: a || {} }; }
function findSrc(src, pbDir, kind) { const cands = src.startsWith('/') ? [src] : [`${pbDir}/${kind}/${src}`, `${pbDir}/${src}`]; for (const c of cands) if (N(c)?.t === 'f') return c; return { searched: cands }; }
function runModule(h, mod, a, ctx) {
  const H = S.hosts[h]; const become = ctx.become;
  const needRoot = (msg) => ({ st: 'failed', msg });
  switch (mod) {
    case 'ping': return { st: 'ok' };
    case 'debug': return { st: 'ok', debug: a.msg !== undefined ? a.msg : (a.var ? String(ctx.vars[a.var]) : 'Hello world!') };
    case 'apt': {
      if (!become) return needRoot("Failed to lock apt for exclusive operation: Failed to lock directory /var/lib/apt/lists/: E:Could not open lock file /var/lib/apt/lists/lock - open (13: Permission denied)");
      const names = [].concat(a.name || a.pkg || []).flatMap(x => String(x).split(',')).map(x => x.trim()).filter(Boolean); const state = a.state || 'present'; let changed = false;
      if (!names.length && !truthy(a.update_cache)) return { st: 'failed', msg: 'one of the following is required: name, pkg, deb, update_cache' };
      for (const n of names) { if (!PKGS.has(n)) return { st: 'failed', msg: `No package matching '${n}' is available` }; if (state === 'absent') { if (H.pkgs.has(n)) { H.pkgs.delete(n); delete H.svcs[n]; changed = true; } } else if (!H.pkgs.has(n) || state === 'latest' && false) { H.pkgs.add(n); changed = true; if (n === 'nginx' || n === 'apache2' || n === 'postgresql') { H.svcs[n] = H.svcs[n] || { active: false, enabled: false }; if (n === 'nginx') { H.files['/etc/nginx/nginx.conf'] = H.files['/etc/nginx/nginx.conf'] || 'worker_processes auto;\nevents { worker_connections 768; }\n'; } } } }
      return { st: changed ? 'changed' : 'ok' };
    }
    case 'service': {
      const n = a.name; if (!n) return { st: 'failed', msg: 'missing required arguments: name' };
      if (!become) return needRoot(`Unable to start service ${n}: Failed to start ${n}.service: Interactive authentication required.`);
      const s = H.svcs[n]; if (!s) return { st: 'failed', msg: `Could not find the requested service ${n}: host` };
      let changed = false;
      if (a.state === 'started' && !s.active) { s.active = true; changed = true; }
      if (a.state === 'stopped' && s.active) { s.active = false; changed = true; }
      if (a.state === 'restarted' || a.state === 'reloaded') { s.active = true; changed = true; s.restarts = (s.restarts || 0) + 1; }
      if (a.enabled !== undefined) { const e = truthy(a.enabled); if (s.enabled !== e) { s.enabled = e; changed = true; } }
      if (a.state && !['started', 'stopped', 'restarted', 'reloaded'].includes(a.state)) return { st: 'failed', msg: `value of state must be one of: reloaded, restarted, started, stopped, got: ${a.state}` };
      return { st: changed ? 'changed' : 'ok' };
    }
    case 'template': case 'copy': {
      if (!a.dest) return { st: 'failed', msg: 'missing required arguments: dest' };
      let content;
      if (mod === 'copy' && a.content !== undefined) content = String(a.content);
      else { if (!a.src) return { st: 'failed', msg: 'missing required arguments: src' }; const f = findSrc(a.src, ctx.pbDir, mod === 'template' ? 'templates' : 'files'); if (typeof f !== 'string') return { st: 'failed', msg: `Could not find or access '${a.src}'\nSearched in:\n\t${f.searched.join('\n\t')}\non the Ansible Controller.` }; content = fread(f); if (mod === 'template') { try { content = render(content, ctx.vars); } catch (e) { return { st: 'failed', msg: e.message }; } } }
      let dest = a.dest; if (dest.endsWith('/')) dest += basename(a.src || 'file');
      if (!H.dirs.has(dirname(dest)) && !H.dirs.has(dest)) return { st: 'failed', msg: `Destination directory ${dirname(dest)} does not exist` };
      if (isSysPath(dest) && !become) return { st: 'failed', msg: `Destination ${dirname(dest)} not writable` };
      if (H.files[dest] === content) return { st: 'ok' };
      H.files[dest] = content; return { st: 'changed' };
    }
    case 'file': {
      const p = a.path || a.dest || a.name; if (!p) return { st: 'failed', msg: 'missing required arguments: path' };
      if (isSysPath(p) && !become) return { st: 'failed', msg: `There was an issue creating ${p} as requested: [Errno 13] Permission denied: '${p}'` };
      const st = a.state || 'file';
      if (st === 'directory') { if (H.dirs.has(p)) return { st: 'ok' }; let q = p; while (q !== '/' && !H.dirs.has(q)) { H.dirs.add(q); q = dirname(q); } return { st: 'changed' }; }
      if (st === 'absent') { if (H.files[p] !== undefined) { delete H.files[p]; return { st: 'changed' }; } if (H.dirs.has(p)) { H.dirs.delete(p); return { st: 'changed' }; } return { st: 'ok' }; }
      if (st === 'touch') { if (!H.dirs.has(dirname(p))) return { st: 'failed', msg: `Error, could not touch target: [Errno 2] No such file or directory: b'${p}'` }; H.files[p] = H.files[p] ?? ''; return { st: 'changed' }; }
      return { st: H.files[p] !== undefined ? 'ok' : 'failed', msg: H.files[p] === undefined ? `file (${p}) is absent, cannot continue` : undefined };
    }
    case 'user': case 'group': { if (!become) return { st: 'failed', msg: `${mod}add: Permission denied.` }; const n = a.name; if (!n) return { st: 'failed', msg: 'missing required arguments: name' }; if ((a.state || 'present') === 'absent') { const had = H.users.delete(n); return { st: had ? 'changed' : 'ok' }; } if (H.users.has(n)) return { st: 'ok' }; H.users.add(n); return { st: 'changed' }; }
    case 'command': case 'shell': { const c = a.cmd || a._raw_params || ''; const out = /hostname/.test(c) ? h : /uptime/.test(c) ? ' 09:41:02 up 12 days,  3:02,  0 users,  load average: 0.08, 0.04, 0.01' : /whoami/.test(c) ? (become ? 'root' : 'ubuntu') : /systemctl is-active (\S+)/.test(c) ? (H.svcs[/systemctl is-active (\S+)/.exec(c)[1]]?.active ? 'active' : 'inactive') : /cat (\S+)/.test(c) ? (H.files[/cat (\S+)/.exec(c)[1]] ?? '') : /df/.test(c) ? 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        20G  6.1G   14G  31% /' : ''; return { st: 'changed', stdout: out }; }
  }
  return { st: 'failed', msg: 'unsupported' };
}
const stars = s => s + ' ' + '*'.repeat(Math.max(3, 74 - s.length));
cmd('ansible', 'ansible <pattern> [-i inventory] -m <module> [-a "args"] [-b]\n  Runs one module on many hosts ("ad-hoc").\n  Patterns: all, a group name, a host name.\n  Examples of modules: ping, command, shell, apt, service.\n  -b (become) runs as root on the target.', a => {
  if (!a.length || a[0] === '--version') return { out: 'ansible [core 2.17.4]\n  config file = ' + (fread(S.cwd + '/ansible.cfg') ? S.cwd + '/ansible.cfg' : 'None') + '\n  python version = 3.12.3' };
  const pat = a[0]; let mod = 'command', args = '', become = false;
  for (let i = 1; i < a.length; i++) { if (a[i] === '-m' || a[i] === '--module-name') mod = a[++i]; else if (a[i] === '-a' || a[i] === '--args') args = a[++i] || ''; else if (a[i] === '-b' || a[i] === '--become') become = true; else if (a[i] === '-i') i++; }
  const ip = findInventory(a); const inv = parseInventory(ip); if (inv.error) return { err: inv.error, code: 1 };
  const hosts = resolvePattern(inv, pat); const out = []; if (inv.warn) out.push(A.mag(inv.warn));
  if (!hosts.length) { out.push(A.mag(`[WARNING]: Could not match supplied host pattern, ignoring: ${pat}`)); out.push(A.mag('[WARNING]: No hosts matched, nothing to do')); return { out: out.join('\n') }; }
  const m = MODALIAS[mod] || mod; if (!MODS.has(m)) return { err: `ERROR! couldn't resolve module/action '${mod}'. This often indicates a misspelling, missing collection, or incorrect module path.`, code: 4 };
  const parsed = (m === 'command' || m === 'shell') ? { cmd: args } : parseKV(args);
  if ((m === 'command' || m === 'shell') && !args) return { err: 'ERROR! No argument passed to command module', code: 1 };
  const ok = [];
  for (const h of hosts) { const real = reach(h, inv); if (!real) { out.push(unreachable(h)); continue; } const r = runModule(real, m, parsed, { become, vars: Object.assign({ inventory_hostname: h }, inv.vars[h]), pbDir: S.cwd });
    if (r.st === 'failed') out.push(A.red(`${h} | FAILED! => {\n    "changed": false,\n    "msg": ${JSON.stringify(r.msg)}\n}`));
    else if (m === 'ping') { out.push(A.green(`${h} | SUCCESS => {\n    "ansible_facts": {\n        "discovered_interpreter_python": "/usr/bin/python3"\n    },\n    "changed": false,\n    "ping": "pong"\n}`)); ok.push(h); }
    else if (m === 'command' || m === 'shell') { out.push(A.yellow(`${h} | CHANGED | rc=0 >>`) + '\n' + r.stdout); ok.push(h); }
    else { out.push((r.st === 'changed' ? A.yellow : A.green)(`${h} | ${r.st === 'changed' ? 'CHANGED' : 'SUCCESS'} => {\n    "changed": ${r.st === 'changed'}\n}`)); ok.push(h); } }
  S.adhoc.push({ pat, mod: m, ok, matched: hosts }); onChange();
  return { out: out.join('\n'), code: ok.length === hosts.length ? 0 : 4 };
});
cmd('ansible-inventory', 'ansible-inventory --graph | --list [-i inventory]\n  Shows how Ansible reads your inventory.', a => { const ip = findInventory(a); const inv = parseInventory(ip); if (inv.error) return { err: inv.error, code: 1 }; if (a.includes('--list')) return { out: JSON.stringify(Object.assign({ _meta: { hostvars: inv.vars } }, Object.fromEntries(Object.entries(inv.groups).filter(([k]) => k !== 'all').map(([k, v]) => [k, { hosts: v }]))), null, 4) }; const out = [(inv.warn ? A.mag(inv.warn) + '\n' : '') + '@all:']; for (const [g, hs] of Object.entries(inv.groups)) { if (g === 'all' || (g === 'ungrouped' && !hs.length)) continue; out.push(`  |--@${g}:`); hs.forEach(h => out.push(`  |  |--${h}`)); } return { out: out.join('\n') }; });
const fakeVault = (t) => '$ANSIBLE_VAULT;1.1;AES256\n' + Array.from({ length: Math.max(3, Math.ceil(t.length / 20)) }, (_, i) => Array.from({ length: 64 }, (_, j) => '0123456789abcdef'[(t.charCodeAt((i * 7 + j) % t.length) * (j + 3) + i) % 16]).join('')).join('\n') + '\n';
cmd('ansible-vault', 'ansible-vault encrypt|decrypt|view|create <file>\n  Encrypts files that hold secrets so they can be committed safely.\n  Playbooks that use vaulted files need --ask-vault-pass.', a => {
  const sub = a[0], f = a.find((x, i) => i > 0 && !x.startsWith('-')); if (!sub || !f) return { err: 'usage: ansible-vault [-h] {create,decrypt,edit,view,encrypt,rekey} ...', code: 2 };
  const p = norm(f), n = N(p); if (!n && sub !== 'create') return { err: `ERROR! input is not vault encrypted data ${f} is not a vault encrypted file for ${f}`, code: 1 };
  if (sub === 'encrypt') { if (n.vault) return { err: `ERROR! input is already encrypted`, code: 1 }; const plain = fread(p); n.c = fakeVault(plain); n.vault = plain; n.m = 0o600; onChange(); return { out: 'New Vault password: ********\nConfirm New Vault password: ********\n' + A.green('Encryption successful') }; }
  if (sub === 'view') { if (!n.vault) return { err: `ERROR! input is not vault encrypted data ${f} is not a vault encrypted file for ${f}`, code: 1 }; return { out: 'Vault password: ********\n' + n.vault }; }
  if (sub === 'decrypt') { if (!n.vault) return { err: `ERROR! input is not vault encrypted data`, code: 1 }; n.c = n.vault; delete n.vault; onChange(); return { out: 'Vault password: ********\n' + A.green('Decryption successful') }; }
  if (sub === 'edit' || sub === 'create') return { err: 'In this lab: decrypt, edit with nano, then encrypt again.', code: 1 };
  return { err: `ansible-vault: error: invalid choice: '${sub}'`, code: 2 };
});
function loadYamlFile(p, vaultOk) { const n = N(p); if (!n) return { err: `ERROR! the playbook: ${p} could not be found` }; if (n.vault) { if (!vaultOk) return { err: `ERROR! Attempting to decrypt but no vault secrets found` }; return { data: jsyaml.load(n.vault) }; } try { return { data: jsyaml.load(fread(p)) }; } catch (e) { return { err: `ERROR! We were unable to read either as JSON nor YAML, these are the errors we got from each:\nJSON: Expecting value: line 1 column 1 (char 0)\n\nSyntax Error while loading YAML.\n  ${e.reason || e.message}\n\nThe error appears to be in '${p}': line ${(e.mark?.line ?? 0) + 1}, column ${(e.mark?.column ?? 0) + 1}` }; } }
cmd('ansible-playbook', 'ansible-playbook [-i inventory] <playbook.yml> [--check] [--ask-vault-pass] [-b]\n  Runs a playbook: a YAML list of plays. Each play has hosts, optional become, vars,\n  vars_files, tasks and handlers. Tasks call modules (apt, service, template, copy,\n  file, user, command, debug). Running it twice should change nothing the second time.', a => {
  const file = a.find((x, i) => !x.startsWith('-') && a[i - 1] !== '-i' && a[i - 1] !== '--inventory' && a[i - 1] !== '--vault-password-file' && a[i - 1] !== '-e' && a[i - 1] !== '--limit' && a[i - 1] !== '-l');
  if (!file) return { err: 'usage: ansible-playbook [-h] [--version] [-v] ... playbook [playbook ...]\nansible-playbook: error: the following arguments are required: playbook', code: 2 };
  const vaultOk = a.includes('--ask-vault-pass') || a.includes('-J') || a.includes('--vault-password-file') || a.some(x => x.startsWith('--vault-password-file='));
  const check = a.includes('--check') || a.includes('-C');
  const pbPath = norm(file); const L = loadYamlFile(pbPath, true); if (L.err) return { err: L.err, code: 1 };
  const plays = L.data; if (!Array.isArray(plays)) return { err: `ERROR! A playbook must be a list of plays, got a ${typeof plays === 'object' ? 'dict' : typeof plays} instead\n\nThe error appears to be in '${pbPath}': line 1, column 1`, code: 4 };
  const pbDir = dirname(pbPath);
  const ip = findInventory(a); const inv = parseInventory(ip); if (inv.error) return { err: inv.error, code: 1 };
  // validation
  for (const [pi, pl] of plays.entries()) {
    if (!pl || typeof pl !== 'object' || Array.isArray(pl)) return { err: `ERROR! A play must be a dict, got something else.`, code: 4 };
    if (pl.hosts === undefined) return { err: `ERROR! the field 'hosts' is required but was not set`, code: 4 };
    for (const key of Object.keys(pl)) if (!['hosts', 'name', 'become', 'vars', 'vars_files', 'tasks', 'handlers', 'gather_facts', 'become_user', 'remote_user', 'pre_tasks', 'post_tasks', 'roles'].includes(key)) return { err: `ERROR! '${key}' is not a valid attribute for a Play\n\nThe error appears to be in '${pbPath}'. If '${key}' is a module, it belongs under 'tasks:' (check your indentation).`, code: 4 };
    if (pl.roles) return { err: 'ERROR! roles are not simulated in this lab. Put tasks directly in the play.', code: 4 };
    for (const t of [...(pl.tasks || []), ...(pl.handlers || [])]) { if (!t || typeof t !== 'object') return { err: `ERROR! A malformed block was encountered while loading tasks: a task must be a dict`, code: 4 }; const tm = taskModule(t); if (tm.err) return { err: `ERROR! ${tm.err}\n\nThe error appears to be in '${pbPath}': task '${t.name || '(unnamed)'}'.`, code: 4 }; }
    if (pl.tasks && !Array.isArray(pl.tasks)) return { err: `ERROR! A malformed block was encountered while loading tasks: tasks must be a list`, code: 4 };
  }
  const out = []; if (inv.warn) out.push(A.mag(inv.warn));
  const recap = {}; const run = { file: pbPath, plays: [], tasks: [], handlers: [], changed: 0, failed: 0, vault: false, check, hosts: [] };
  for (const pl of plays) {
    let hosts = resolvePattern(inv, pl.hosts);
    out.push('', stars(`PLAY [${pl.name || pl.hosts}]`));
    if (!hosts.length) { out.push(A.mag('skipping: no hosts matched')); continue; }
    let vars = Object.assign({}, pl.vars || {});
    for (const vf of [].concat(pl.vars_files || [])) { const vp = vf.startsWith('/') ? vf : pbDir + '/' + vf; const r = loadYamlFile(vp, vaultOk); if (r.err) { if (r.err.includes('the playbook')) return { out: out.join('\n'), err: `ERROR! vars file ${vf} was not found`, code: 1 }; return { out: out.join('\n'), err: r.err, code: 1 }; } if (N(vp).vault) run.vault = true; Object.assign(vars, r.data || {}); }
    const alive = [];
    for (const h of hosts) { recap[h] = recap[h] || { ok: 0, changed: 0, unreachable: 0, failed: 0 }; const real = reach(h, inv); if (!real) recap[h].unreachable = 1; else alive.push([h, real]); }
    if (pl.gather_facts !== false) { out.push('', stars('TASK [Gathering Facts]')); for (const h of hosts) { if (alive.find(x => x[0] === h)) { out.push(A.green(`ok: [${h}]`)); recap[h].ok++; } else out.push(unreachable(h).replace(`${h} | UNREACHABLE! =>`, `fatal: [${h}]: UNREACHABLE! =>`)); } }
    let live = alive.slice(); const notified = {};
    const runTask = (t, isHandler) => {
      const tm = taskModule(t); const label = t.name || `${tm.mod}`;
      out.push('', stars(`${isHandler ? 'RUNNING HANDLER' : 'TASK'} [${label}]`));
      const next = [];
      for (const [h, real] of live) {
        const hv = Object.assign({ inventory_hostname: h, ansible_hostname: h, ansible_host: inv.vars[h]?.ansible_host || HOSTIP[real] }, inv.vars[h], vars, t.vars || {});
        let args; try { args = deepRender(tm.args, hv); } catch (e) { out.push(A.red(`fatal: [${h}]: FAILED! => {"msg": "The task includes an option with an undefined variable. ${e.message}"}`)); recap[h].failed++; run.failed++; continue; }
        const become = truthy(t.become) || (t.become === undefined && truthy(pl.become)) || a.includes('-b') || a.includes('--become');
        let r; if (check) { const snap = JSON.stringify([...S.hosts[real].pkgs, S.hosts[real].svcs, S.hosts[real].files, [...S.hosts[real].dirs]]); const H0 = S.hosts[real]; const clone = { name: H0.name, pkgs: new Set(H0.pkgs), svcs: JSON.parse(JSON.stringify(H0.svcs)), files: Object.assign({}, H0.files), dirs: new Set(H0.dirs), users: new Set(H0.users) }; S.hosts[real] = clone; r = runModule(real, tm.mod, args, { become, vars: hv, pbDir }); S.hosts[real] = H0; void snap; } else r = runModule(real, tm.mod, args, { become, vars: hv, pbDir });
        if (r.st === 'failed') { out.push(A.red(`fatal: [${h}]: FAILED! => {"changed": false, "msg": ${JSON.stringify(r.msg)}}`)); if (truthy(t.ignore_errors)) { out.push(A.cyan('...ignoring')); recap[h].ok++; next.push([h, real]); } else { recap[h].failed++; run.failed++; } continue; }
        recap[h].ok++; next.push([h, real]);
        if (r.st === 'changed') { recap[h].changed++; run.changed++; out.push(A.yellow(`changed: [${h}]`)); if (t.notify && !isHandler) [].concat(t.notify).forEach(nm => { (notified[nm] = notified[nm] || new Set()).add(h); }); }
        else if (r.debug !== undefined) out.push(A.green(`ok: [${h}] => {\n    "msg": ${JSON.stringify(r.debug)}\n}`));
        else out.push(A.green(`ok: [${h}]`));
        run.tasks.push({ host: real, mod: tm.mod, args, st: r.st, handler: isHandler, name: label });
      }
      live = next;
    };
    for (const t of pl.tasks || []) { if (!live.length) break; runTask(t, false); }
    const handlers = pl.handlers || [];
    for (const nm of Object.keys(notified)) { if (!handlers.find(hd => hd.name === nm || [].concat(hd.listen || []).includes(nm))) { out.push(A.red(`ERROR! The requested handler '${nm}' was not found in either the main handlers list nor in the listening handlers list`)); return { out: out.join('\n'), code: 4 }; } }
    for (const hd of handlers) { const keys = [hd.name, ...[].concat(hd.listen || [])]; const hs = new Set(keys.flatMap(k => [...(notified[k] || [])])); if (!hs.size) continue; const save = live; live = live.filter(([h]) => hs.has(h)); runTask(hd, true); run.handlers.push({ name: hd.name, hosts: live.map(x => x[1]) }); live = save; }
    run.plays.push({ hosts: alive.map(x => x[1]) });
  }
  out.push('', stars('PLAY RECAP'));
  for (const [h, r] of Object.entries(recap)) out.push(`${(r.failed || r.unreachable ? A.red : r.changed ? A.yellow : A.green)(h.padEnd(26))}: ${A.green('ok=' + r.ok)}    ${r.changed ? A.yellow('changed=' + r.changed) : 'changed=0'}    ${r.unreachable ? A.red('unreachable=' + r.unreachable) : 'unreachable=0'}    ${r.failed ? A.red('failed=' + r.failed) : 'failed=0'}    skipped=0    rescued=0    ignored=0`);
  run.unreachable = Object.values(recap).some(r => r.unreachable);
  if (!check) S.runs.push(run); onChange();
  return { out: out.join('\n'), code: run.failed ? 2 : 0 };
});
