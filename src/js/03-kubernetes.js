/* ================= KUBERNETES ================= */
const IMG = {
  'nginx:1.25': { port: 80, web: true }, 'nginx:1.26': { port: 80, web: true }, 'nginx:1.27': { port: 80, web: true }, 'nginx:latest': { port: 80, web: true }, 'nginx:1.25-alpine': { port: 80, web: true }, 'nginx:1.27-alpine': { port: 80, web: true },
  'httpd:2.4': { port: 80, web: true }, 'redis:7': { port: 6379 }, 'busybox:latest': { port: 0 }, 'busybox:1.36': { port: 0 },
  'shopco/api:2.1': { port: 3000, needEnv: 'DB_HOST', ok: ['api v2.1 starting', 'connecting to postgres at {DB_HOST}:5432', 'listening on :3000'] },
  'shopco/site:1.0': { port: 8080, ok: ['site 1.0 listening on :8080'] },
  'shopco/site:1.1': { port: 8080, crash: ['site 1.1 starting', 'loading config from /etc/site/config.yaml', 'panic: missing required config key "listen_addr"', '', 'goroutine 1 [running]:', 'main.main()', '\t/src/cmd/site/main.go:42 +0x1c5'] },
  'shopco/analytics:3.0': { port: 9000, ok: ['analytics worker ready, batch size 500'] },
  'shopco/checkout:3.1': { port: 8080, ok: ['checkout 3.1 listening on :8080', 'payment provider: connected'] },
  'shopco/checkout:3.2': { port: 8080, ok: ['checkout 3.2 listening on :8080', 'payment provider: connected', 'WARN payment client timeout set to 200ms (PAYMENT_TIMEOUT_MS)', 'ERROR POST /api/checkout 502 upstream timeout after 200ms', 'ERROR POST /api/checkout 502 upstream timeout after 200ms', 'INFO POST /api/checkout 200 184ms', 'ERROR POST /api/checkout 502 upstream timeout after 200ms'] },
};
const imgKey = i => { let s = String(i || '').replace(/^docker\.io\/(library\/)?/, ''); if (!s.includes(':')) s += ':latest'; return s; };
function cluster() { S.k8s = { deps: {}, pods: [], svcs: { kubernetes: { m: { apiVersion: 'v1', kind: 'Service', metadata: { name: 'kubernetes', namespace: 'default' }, spec: { type: 'ClusterIP', ports: [{ name: 'https', port: 443, targetPort: 6443, protocol: 'TCP' }] } }, ip: '10.96.0.1', created: Date.now() - 12 * 86400e3 } }, cms: {}, events: [], ipN: 12, svcN: 40, flags: {} }; }
function h32(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
const ALNUM = 'bcdfghjklmnpqrstvwxz2456789';
function hashName(s, n) { let h = h32(s), o = ''; for (let i = 0; i < n; i++) { o += ALNUM[h % ALNUM.length]; h = Math.floor(h / ALNUM.length) || h32(o + s); } return o; }
function age(ms) { const s = Math.max(1, Math.floor((Date.now() - ms) / 1000)); if (s < 120) return s + 's'; if (s < 7200) return Math.floor(s / 60) + 'm'; if (s < 172800) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; }
function parseMem(v) { if (v === undefined || v === null) return 0; const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|k)?$/.exec(String(v)); if (!m) return NaN; return +m[1] * ({ Ki: 1024, Mi: 1048576, Gi: 1073741824, Ti: 1099511627776, K: 1e3, k: 1e3, M: 1e6, G: 1e9 }[m[2]] || 1); }
function parseCpu(v) { if (v === undefined || v === null) return 0; const s = String(v); if (s.endsWith('m')) return +s.slice(0, -1) / 1000; return +s; }
const NODE = { name: 'lab-node-1', cpu: 2, mem: 4 * 1073741824 };
function resolveEnv(c) {
  const env = {}; const errs = [];
  for (const ef of c.envFrom || []) { const ref = ef.configMapRef?.name; if (ref) { const cm = S.k8s.cms[ref]; if (!cm) errs.push(`configmap "${ref}" not found`); else Object.assign(env, cm.m.data || {}); } }
  for (const e of c.env || []) { if (e.value !== undefined) env[e.name] = String(e.value); else if (e.valueFrom?.configMapKeyRef) { const r = e.valueFrom.configMapKeyRef; const cm = S.k8s.cms[r.name]; if (!cm) errs.push(`configmap "${r.name}" not found`); else if (!(r.key in (cm.m.data || {}))) errs.push(`couldn't find key ${r.key} in ConfigMap default/${r.name}`); else env[e.name] = cm.m.data[r.key]; } }
  return { env, errs };
}
function podState(p) {
  const spec = p.spec; const c = (spec.containers || [])[0] || {}; const im = IMG[imgKey(c.image)];
  let mem = 0, cpu = 0; for (const cc of spec.containers || []) { mem += parseMem(cc.resources?.requests?.memory); cpu += parseCpu(cc.resources?.requests?.cpu); }
  const ev = [['Normal', 'Scheduled', `Successfully assigned default/${p.name} to ${NODE.name}`, 'default-scheduler']];
  if (mem > NODE.mem || cpu > NODE.cpu) { const why = [cpu > NODE.cpu ? 'Insufficient cpu' : null, mem > NODE.mem ? 'Insufficient memory' : null].filter(Boolean).join(', 1 '); return { phase: 'Pending', status: 'Pending', ready: false, ip: null, node: null, events: [['Warning', 'FailedScheduling', `0/1 nodes are available: 1 ${why}. preemption: 0/1 nodes are available: 1 No preemption victims found for incoming pod.`, 'default-scheduler']] }; }
  if (!im) return { phase: 'Pending', status: (Date.now() - p.created) % 20000 < 6000 ? 'ErrImagePull' : 'ImagePullBackOff', ready: false, ip: p.ip, node: NODE.name, events: [...ev, ['Normal', 'Pulling', `Pulling image "${c.image}"`, 'kubelet'], ['Warning', 'Failed', `Failed to pull image "${c.image}": rpc error: code = NotFound desc = failed to pull and unpack image "docker.io/${imgKey(c.image).includes('/') ? '' : 'library/'}${imgKey(c.image)}": not found`, 'kubelet'], ['Warning', 'Failed', 'Error: ErrImagePull', 'kubelet'], ['Normal', 'BackOff', `Back-off pulling image "${c.image}"`, 'kubelet'], ['Warning', 'Failed', 'Error: ImagePullBackOff', 'kubelet']], waitMsg: `trying and failing to pull image` };
  const { env, errs } = resolveEnv(c);
  if (errs.length) return { phase: 'Pending', status: 'CreateContainerConfigError', ready: false, ip: p.ip, node: NODE.name, events: [...ev, ['Normal', 'Pulled', `Container image "${c.image}" already present on machine`, 'kubelet'], ['Warning', 'Failed', 'Error: ' + errs[0], 'kubelet']], waitMsg: 'CreateContainerConfigError' };
  const pulled = [...ev, ['Normal', 'Pulled', `Container image "${c.image}" already present on machine`, 'kubelet'], ['Normal', 'Created', `Created container ${c.name}`, 'kubelet'], ['Normal', 'Started', `Started container ${c.name}`, 'kubelet']];
  const restarts = Math.min(30, 3 + Math.floor((Date.now() - p.created) / 45000));
  if (im.needEnv && !env[im.needEnv]) return { phase: 'Running', status: 'CrashLoopBackOff', ready: false, ip: p.ip, node: NODE.name, restarts, logs: ['api v2.1 starting', `Error: required environment variable ${im.needEnv} is not set`, 'exit status 1'], events: [...pulled, ['Warning', 'BackOff', `Back-off restarting failed container ${c.name} in pod ${p.name}`, 'kubelet']] };
  if (im.crash) return { phase: 'Running', status: 'CrashLoopBackOff', ready: false, ip: p.ip, node: NODE.name, restarts, logs: im.crash, events: [...pulled, ['Warning', 'BackOff', `Back-off restarting failed container ${c.name} in pod ${p.name}`, 'kubelet']] };
  const logs = im.web ? [`/docker-entrypoint.sh: Configuration complete; ready for start up`, `${new Date(p.created).toISOString().slice(0, 19).replace('T', ' ')} [notice] 1#1: nginx/${(imgKey(c.image).split(':')[1] || '1.27').replace('latest', '1.27.2').replace('-alpine', '')}`, `[notice] 1#1: start worker processes`] : (im.ok || ['started']).map(l => l.replace('{DB_HOST}', env.DB_HOST || ''));
  return { phase: 'Running', status: 'Running', ready: true, ip: p.ip, node: NODE.name, logs, env, events: pulled };
}
function newPod(name, owner, tmpl, hash, created) { const ip = '10.244.0.' + (S.k8s.ipN++); return { name, owner, hash, labels: Object.assign({}, tmpl.metadata?.labels || {}), spec: JSON.parse(JSON.stringify(tmpl.spec || {})), created: created ?? Date.now(), ip, restartsBase: 0 }; }
function reconcile() {
  const K = S.k8s; if (!K) return;
  for (const [nm, d] of Object.entries(K.deps)) {
    const tmpl = d.m.spec.template; const hash = hashName(JSON.stringify(tmpl), 10); const want = d.m.spec.replicas ?? 1;
    K.pods = K.pods.filter(p => p.owner !== nm || p.hash === hash);
    let mine = K.pods.filter(p => p.owner === nm);
    while (mine.length < want) { const pn = `${nm}-${hash}-${hashName(nm + hash + K.ipN + Math.random(), 5)}`; const p = newPod(pn, nm, tmpl, hash, d.seedAge ? Date.now() - d.seedAge : undefined); K.pods.push(p); mine.push(p); }
    if (mine.length > want) { const drop = new Set(mine.slice(want).map(p => p.name)); K.pods = K.pods.filter(p => !drop.has(p.name)); }
    d.seedAge = 0;
  }
  K.pods = K.pods.filter(p => !p.owner || K.deps[p.owner]);
}
const labelsStr = l => Object.entries(l || {}).map(([k, v]) => `${k}=${v}`).join(',') || '<none>';
const matchSel = (labels, sel) => sel && Object.keys(sel).length && Object.entries(sel).every(([k, v]) => labels[k] === v);
function endpoints(svc) { const sel = svc.m.spec.selector; if (!sel) return []; const tp = svc.m.spec.ports?.[0]?.targetPort ?? svc.m.spec.ports?.[0]?.port; return S.k8s.pods.filter(p => matchSel(p.labels, sel)).map(p => ({ p, st: podState(p), tp })).filter(x => x.st.ready).map(x => ({ pod: x.p, addr: `${x.p.ip}:${resolveTargetPort(x.p, x.tp)}` })); }
function resolveTargetPort(p, tp) { if (typeof tp === 'number' || /^\d+$/.test(String(tp))) return +tp; const port = (p.spec.containers || []).flatMap(c => c.ports || []).find(x => x.name === tp); return port ? port.containerPort : tp; }
function podContainerPort(p) { const im = IMG[imgKey(p.spec.containers?.[0]?.image)]; return im ? im.port : 0; }
function k8sHttp(host, port) {
  const nm = host.split('.')[0]; const svc = S.k8s.svcs[nm];
  if (!svc || (host.includes('.') && !/^[\w-]+(\.default(\.svc(\.cluster\.local)?)?)?$/.test(host))) return { err: `curl: (6) Could not resolve host: ${host}`, code: 6 };
  const sp = svc.m.spec.ports?.find(x => +x.port === +port);
  if (!sp) return { err: `curl: (28) Failed to connect to ${host} port ${port} after 3002 ms: Timeout was reached`, code: 28 };
  const eps = endpoints(svc);
  if (!eps.length) return { err: `curl: (7) Failed to connect to ${host} port ${port} after 1 ms: Couldn't connect to server`, code: 7 };
  const ep = eps[Math.floor(Math.random() * eps.length)];
  const tp = resolveTargetPort(ep.pod, sp.targetPort ?? sp.port);
  if (tp !== podContainerPort(ep.pod)) return { err: `curl: (7) Failed to connect to ${host} port ${port} after 2 ms: Couldn't connect to server`, code: 7 };
  const im = IMG[imgKey(ep.pod.spec.containers[0].image)];
  const body = im.web ? '<!DOCTYPE html>\n<html>\n<head><title>Welcome to nginx!</title></head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and working.</p>\n</body>\n</html>' : '{"status":"ok"}';
  S.k8s.flags['curl:' + nm] = true; onChange(); return { out: body };
}
function depView(nm) { const d = S.k8s.deps[nm]; const pods = S.k8s.pods.filter(p => p.owner === nm); const ready = pods.filter(p => podState(p).ready).length; return { d, pods, ready, want: d.m.spec.replicas ?? 1 }; }
function kEvent(type, reason, obj, msg) { S.k8s.events.push({ t: Date.now(), type, reason, obj, msg }); }
function validateDeployment(m, src) {
  const nm = m.metadata?.name; if (!nm) return 'error: error validating data: ValidationError(Deployment.metadata): missing required field "name"';
  if (m.apiVersion !== 'apps/v1') return `error: resource mapping not found for name: "${nm}" namespace: "" from "${src}": no matches for kind "Deployment" in version "${m.apiVersion}"\nensure CRDs are installed first`;
  const sp = m.spec; if (!sp) return `error: error validating "${src}": error validating data: ValidationError(Deployment): missing required field "spec"`;
  if (!sp.selector?.matchLabels) return `error: error validating "${src}": error validating data: ValidationError(Deployment.spec): missing required field "selector" in io.k8s.api.apps.v1.DeploymentSpec`;
  if (!sp.template?.spec?.containers?.length) return `The Deployment "${nm}" is invalid: spec.template.spec.containers: Required value`;
  for (const [i, c] of sp.template.spec.containers.entries()) { if (!c.name) return `The Deployment "${nm}" is invalid: spec.template.spec.containers[${i}].name: Required value`; if (!c.image) return `The Deployment "${nm}" is invalid: spec.template.spec.containers[${i}].image: Required value`; for (const e of c.env || []) if (e.value !== undefined && typeof e.value !== 'string') return `Error from server (BadRequest): error when creating "${src}": Deployment in version "v1" cannot be handled as a Deployment: json: cannot unmarshal number into Go struct field EnvVar.spec.template.spec.containers.env.value of type string`; for (const k of ['memory', 'cpu']) { for (const kind of ['requests', 'limits']) { const v = c.resources?.[kind]?.[k]; if (v !== undefined && Number.isNaN(k === 'memory' ? parseMem(v) : parseCpu(v))) return `The Deployment "${nm}" is invalid: spec.template.spec.containers[${i}].resources.${kind}[${k}]: Invalid value: "${v}": must be a valid quantity`; } } }
  if (!matchSel(sp.template.metadata?.labels || {}, sp.selector.matchLabels)) return `The Deployment "${nm}" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{${Object.entries(sp.template.metadata?.labels || {}).map(([k, v]) => `"${k}":"${v}"`).join(', ')}}: \`selector\` does not match template \`labels\``;
  if (sp.replicas !== undefined && (!Number.isInteger(sp.replicas) || sp.replicas < 0)) return `Error from server (BadRequest): error when creating "${src}": Deployment in version "v1" cannot be handled as a Deployment: json: cannot unmarshal string into Go struct field DeploymentSpec.spec.replicas of type int32`;
  const old = S.k8s.deps[nm]; if (old && JSON.stringify(old.m.spec.selector) !== JSON.stringify(sp.selector)) return `The Deployment "${nm}" is invalid: spec.selector: Invalid value: v1.LabelSelector{...}: field is immutable`;
  return null;
}
function setDeployment(m, cause) {
  const K = S.k8s; const nm = m.metadata.name; const old = K.deps[nm];
  m = JSON.parse(JSON.stringify(m)); m.metadata.namespace = 'default';
  if (!old) { K.deps[nm] = { m, created: Date.now(), history: [{ rev: 1, tmpl: JSON.parse(JSON.stringify(m.spec.template)), cause: cause || '<none>' }] }; kEvent('Normal', 'ScalingReplicaSet', 'deployment/' + nm, `Scaled up replica set ${nm}-${hashName(JSON.stringify(m.spec.template), 10)} to ${m.spec.replicas ?? 1}`); reconcile(); return 'created'; }
  const same = JSON.stringify(old.m.spec.template) === JSON.stringify(m.spec.template) && (old.m.spec.replicas ?? 1) === (m.spec.replicas ?? 1);
  if (same) return 'unchanged';
  if (JSON.stringify(old.m.spec.template) !== JSON.stringify(m.spec.template)) { const prevIdx = old.history.findIndex(h => JSON.stringify(h.tmpl) === JSON.stringify(m.spec.template)); const rev = Math.max(...old.history.map(h => h.rev)) + 1; if (prevIdx >= 0) old.history.splice(prevIdx, 1); old.history.push({ rev, tmpl: JSON.parse(JSON.stringify(m.spec.template)), cause: cause || '<none>' }); kEvent('Normal', 'ScalingReplicaSet', 'deployment/' + nm, `Scaled up replica set ${nm}-${hashName(JSON.stringify(m.spec.template), 10)} to ${m.spec.replicas ?? 1}`); }
  old.m = m; reconcile(); return 'configured';
}
function applyDoc(doc, src) {
  const K = S.k8s; if (!doc || typeof doc !== 'object') return { err: `error: error validating "${src}": error validating data: invalid object to validate` };
  const kind = doc.kind; const nm = doc.metadata?.name;
  if (!kind) return { err: `error: error validating "${src}": error validating data: kind not set` };
  if (!doc.apiVersion) return { err: `error: error validating "${src}": error validating data: apiVersion not set` };
  if (kind === 'Deployment') { const e = validateDeployment(doc, src); if (e) return { err: e }; return { out: `deployment.apps/${nm} ${setDeployment(doc, 'kubectl apply --filename=' + src)}` }; }
  if (kind === 'Service') {
    if (doc.apiVersion !== 'v1') return { err: `error: resource mapping not found for name: "${nm}" namespace: "" from "${src}": no matches for kind "Service" in version "${doc.apiVersion}"` };
    if (!nm) return { err: 'error: error validating data: ValidationError(Service.metadata): missing required field "name"' };
    const ports = doc.spec?.ports; if (!ports?.length) return { err: `The Service "${nm}" is invalid: spec.ports: Required value` };
    for (const [i, p] of ports.entries()) if (p.port === undefined) return { err: `The Service "${nm}" is invalid: spec.ports[${i}].port: Invalid value: 0: must be between 1 and 65535, inclusive` };
    const m = JSON.parse(JSON.stringify(doc)); m.spec.type = m.spec.type || 'ClusterIP'; m.spec.ports = m.spec.ports.map(p => Object.assign({ protocol: 'TCP' }, p, { targetPort: p.targetPort ?? p.port }));
    const old = K.svcs[nm]; if (old && JSON.stringify(old.m) === JSON.stringify(m)) return { out: `service/${nm} unchanged` };
    K.svcs[nm] = { m, ip: old ? old.ip : '10.96.' + (K.svcN++) + '.' + (10 + K.svcN % 200), created: old ? old.created : Date.now() };
    return { out: `service/${nm} ${old ? 'configured' : 'created'}` };
  }
  if (kind === 'ConfigMap') {
    if (!nm) return { err: 'error: error validating data: ValidationError(ConfigMap.metadata): missing required field "name"' };
    for (const [k, v] of Object.entries(doc.data || {})) if (typeof v !== 'string') return { err: `Error from server (BadRequest): error when creating "${src}": ConfigMap in version "v1" cannot be handled as a ConfigMap: json: cannot unmarshal ${typeof v === 'number' ? 'number' : 'bool'} into Go struct field ConfigMap.data of type string (put quotes around the value of ${k})` };
    const old = K.cms[nm]; const m = JSON.parse(JSON.stringify(doc)); if (old && JSON.stringify(old.m.data) === JSON.stringify(m.data)) return { out: `configmap/${nm} unchanged` };
    K.cms[nm] = { m, created: old ? old.created : Date.now() }; return { out: `configmap/${nm} ${old ? 'configured' : 'created'}` };
  }
  if (kind === 'Pod') { if (!nm) return { err: 'missing name' }; if (K.pods.find(p => p.name === nm)) return { out: `pod/${nm} unchanged` }; if (!doc.spec?.containers?.length) return { err: `The Pod "${nm}" is invalid: spec.containers: Required value` }; K.pods.push(newPod(nm, null, { metadata: doc.metadata, spec: doc.spec }, null)); return { out: `pod/${nm} created` }; }
  return { err: `error: resource mapping not found for name: "${nm}" namespace: "" from "${src}": no matches for kind "${kind}" in version "${doc.apiVersion}"` };
}
const RES = { po: 'pods', pod: 'pods', pods: 'pods', deploy: 'deployments', deployment: 'deployments', deployments: 'deployments', svc: 'services', service: 'services', services: 'services', cm: 'configmaps', configmap: 'configmaps', configmaps: 'configmaps', no: 'nodes', node: 'nodes', nodes: 'nodes', ep: 'endpoints', endpoints: 'endpoints', ev: 'events', events: 'events', rs: 'replicasets', replicaset: 'replicasets', replicasets: 'replicasets', ns: 'namespaces', namespace: 'namespaces', namespaces: 'namespaces', all: 'all' };
const SING = { pods: 'pod', deployments: 'deployment.apps', services: 'service', configmaps: 'configmap', nodes: 'node', endpoints: 'endpoints', replicasets: 'replicaset.apps' };
function table(rows) { const w = rows[0].map((_, i) => Math.max(...rows.map(r => String(r[i]).length))); return rows.map(r => r.map((c, i) => i === r.length - 1 ? String(c) : String(c).padEnd(w[i] + 3)).join('')).join('\n'); }
function podRow(p, wide) { const st = podState(p); const r = [p.name, st.ready ? '1/1' : '0/1', st.status, st.restarts ? `${st.restarts} (${Math.floor(Math.random() * 50) + 10}s ago)` : '0', age(p.created)]; if (wide) r.push(st.ip || '<none>', st.node || '<none>'); return r; }
function podManifest(p) { const st = podState(p); return { apiVersion: 'v1', kind: 'Pod', metadata: { name: p.name, namespace: 'default', labels: p.labels, ownerReferences: p.owner ? [{ kind: 'ReplicaSet', name: `${p.owner}-${p.hash}` }] : undefined }, spec: p.spec, status: { phase: st.phase, podIP: st.ip || undefined } }; }
function getRows(res, name, opts) {
  const K = S.k8s; const wide = opts.wide;
  if (res === 'pods') { let ps = K.pods; if (name) ps = ps.filter(p => p.name === name); if (opts.sel) ps = ps.filter(p => Object.entries(opts.sel).every(([k, v]) => p.labels[k] === v)); if (name && !ps.length) return { err: `Error from server (NotFound): pods "${name}" not found` }; if (!ps.length) return { none: true }; return { rows: [['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE', ...(wide ? ['IP', 'NODE'] : [])], ...ps.map(p => podRow(p, wide))], list: ps.map(podManifest) }; }
  if (res === 'deployments') { let ns = Object.keys(K.deps); if (name) { if (!K.deps[name]) return { err: `Error from server (NotFound): deployments.apps "${name}" not found` }; ns = [name]; } if (!ns.length) return { none: true }; return { rows: [['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE', ...(wide ? ['CONTAINERS', 'IMAGES', 'SELECTOR'] : [])], ...ns.map(n => { const v = depView(n); const c = v.d.m.spec.template.spec.containers; return [n, `${v.ready}/${v.want}`, v.pods.length, v.ready, age(v.d.created), ...(wide ? [c.map(x => x.name).join(','), c.map(x => x.image).join(','), labelsStr(v.d.m.spec.selector.matchLabels)] : [])]; })], list: ns.map(n => K.deps[n].m) }; }
  if (res === 'replicasets') { const ns = Object.keys(K.deps); return { rows: [['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE'], ...ns.map(n => { const v = depView(n); return [`${n}-${hashName(JSON.stringify(v.d.m.spec.template), 10)}`, v.want, v.pods.length, v.ready, age(v.d.created)]; })] }; }
  if (res === 'services') { let ns = Object.keys(K.svcs); if (name) { if (!K.svcs[name]) return { err: `Error from server (NotFound): services "${name}" not found` }; ns = [name]; } return { rows: [['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE', ...(wide ? ['SELECTOR'] : [])], ...ns.map(n => { const s = K.svcs[n]; return [n, s.m.spec.type, s.ip, '<none>', s.m.spec.ports.map(p => `${p.port}/${p.protocol || 'TCP'}`).join(','), age(s.created), ...(wide ? [labelsStr(s.m.spec.selector)] : [])]; })], list: ns.map(n => K.svcs[n].m) }; }
  if (res === 'endpoints') { let ns = Object.keys(K.svcs); if (name) { if (!K.svcs[name]) return { err: `Error from server (NotFound): endpoints "${name}" not found` }; ns = [name]; } return { rows: [['NAME', 'ENDPOINTS', 'AGE'], ...ns.map(n => { if (n === 'kubernetes') return [n, '192.168.49.2:6443', '12d']; const e = endpoints(K.svcs[n]); return [n, e.length ? e.map(x => x.addr).slice(0, 3).join(',') + (e.length > 3 ? ` + ${e.length - 3} more...` : '') : '<none>', age(K.svcs[n].created)]; })] }; }
  if (res === 'configmaps') { let ns = Object.keys(K.cms); if (name) { if (!K.cms[name]) return { err: `Error from server (NotFound): configmaps "${name}" not found` }; ns = [name]; } return { rows: [['NAME', 'DATA', 'AGE'], ['kube-root-ca.crt', 1, '12d'], ...ns.map(n => [n, Object.keys(K.cms[n].m.data || {}).length, age(K.cms[n].created)])], list: ns.map(n => K.cms[n].m) }; }
  if (res === 'nodes') return { rows: [['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'], [NODE.name, 'Ready', 'control-plane', '12d', 'v1.31.0']] };
  if (res === 'namespaces') return { rows: [['NAME', 'STATUS', 'AGE'], ['default', 'Active', '12d'], ['kube-system', 'Active', '12d'], ['kube-public', 'Active', '12d']] };
  if (res === 'events') { const ev = [...K.events, ...K.pods.flatMap(p => podState(p).events.slice(-2).map(e => ({ t: p.created, type: e[0], reason: e[1], obj: 'pod/' + p.name, msg: e[2] })))].sort((x, y) => x.t - y.t); return { rows: [['LAST SEEN', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE'], ...ev.slice(-25).map(e => [age(e.t), e.type, e.reason, e.obj, e.msg])] }; }
  return { err: `error: the server doesn't have a resource type "${res}"` };
}
function describe(res, name) {
  const K = S.k8s; const evs = rows => rows.length ? 'Events:\n  Type     Reason       Age   From               Message\n  ----     ------       ----  ----               -------\n' + rows.map(e => `  ${e[0].padEnd(8)} ${e[1].padEnd(12)} ${'2m'.padEnd(5)} ${(e[3] || 'kubelet').padEnd(18)} ${e[2]}`).join('\n') : 'Events:  <none>';
  if (res === 'pods') {
    const ps = name ? K.pods.filter(p => p.name === name) : K.pods; if (!ps.length) return { err: name ? `Error from server (NotFound): pods "${name}" not found` : 'No resources found in default namespace.' };
    return { out: ps.map(p => { const st = podState(p); const c = p.spec.containers[0]; const { env } = resolveEnv(c);
      const state = st.status === 'Running' ? `      State:          Running\n        Started:      ${new Date(p.created).toUTCString()}` : st.status === 'CrashLoopBackOff' ? `      State:          Waiting\n        Reason:       CrashLoopBackOff\n      Last State:     Terminated\n        Reason:       Error\n        Exit Code:    ${(st.logs || []).some(l => l.startsWith('panic')) ? 2 : 1}` : st.phase === 'Pending' && !st.node ? '' : `      State:          Waiting\n        Reason:       ${st.status}`;
      const rq = c.resources?.requests ? `      Requests:\n${Object.entries(c.resources.requests).map(([k, v]) => `        ${k}:  ${v}`).join('\n')}\n` : '';
      const envLines = (c.env || []).map(e => `        ${e.name}:  ${e.value !== undefined ? e.value : `<set to the key '${e.valueFrom?.configMapKeyRef?.key}' of config map '${e.valueFrom?.configMapKeyRef?.name}'>`}`).join('\n');
      const envFrom = (c.envFrom || []).map(ef => `        ${ef.configMapRef?.name}  ConfigMap  Optional: false`).join('\n');
      return `Name:             ${p.name}\nNamespace:        default\nNode:             ${st.node ? st.node + '/192.168.49.2' : '<none>'}\nLabels:           ${Object.entries(p.labels).map(([k, v]) => k + '=' + v).join('\n                  ') || '<none>'}\nStatus:           ${st.phase}\nIP:               ${st.ip && st.node ? st.ip : ''}\n${p.owner ? `Controlled By:    ReplicaSet/${p.owner}-${p.hash}\n` : ''}Containers:\n  ${c.name}:\n    Image:          ${c.image}\n    Port:           ${(c.ports || []).map(x => x.containerPort + '/TCP').join(', ') || '<none>'}\n${state}\n      Ready:          ${st.ready ? 'True' : 'False'}\n      Restart Count:  ${st.restarts || 0}\n${rq}${envFrom ? '    Environment Variables from:\n' + envFrom + '\n' : ''}    Environment:${envLines ? '\n' + envLines : '    <none>'}\nConditions:\n  Type              Status\n  PodScheduled      ${st.node ? 'True' : 'False'}\n  Ready             ${st.ready ? 'True' : 'False'}\n${evs(st.events)}`; }).join('\n\n\n') };
  }
  if (res === 'deployments') { const ns = name ? [name] : Object.keys(K.deps); if (name && !K.deps[name]) return { err: `Error from server (NotFound): deployments.apps "${name}" not found` }; return { out: ns.map(n => { const v = depView(n); const t = v.d.m.spec.template; return `Name:                   ${n}\nNamespace:              default\nSelector:               ${labelsStr(v.d.m.spec.selector.matchLabels)}\nReplicas:               ${v.want} desired | ${v.pods.length} updated | ${v.pods.length} total | ${v.ready} available | ${v.pods.length - v.ready} unavailable\nStrategyType:           RollingUpdate\nPod Template:\n  Labels:  ${labelsStr(t.metadata?.labels)}\n  Containers:\n${t.spec.containers.map(c => `   ${c.name}:\n    Image:      ${c.image}\n    Port:       ${(c.ports || []).map(x => x.containerPort + '/TCP').join(', ') || '<none>'}\n    Environment: ${(c.env || []).length ? '\n' + c.env.map(e => `      ${e.name}:  ${e.value ?? '<from configmap ' + e.valueFrom?.configMapKeyRef?.name + '>'}`).join('\n') : '<none>'}${c.resources?.requests ? `\n    Requests:\n${Object.entries(c.resources.requests).map(([k, x]) => `      ${k}:  ${x}`).join('\n')}` : ''}`).join('\n')}\nConditions:\n  Type           Status\n  Available      ${v.ready >= Math.max(1, Math.ceil(v.want * 0.75)) ? 'True' : 'False'}\n  Progressing    True\n${evs(K.events.filter(e => e.obj === 'deployment/' + n).map(e => [e.type, e.reason, e.msg, 'deployment-controller']))}`; }).join('\n\n') }; }
  if (res === 'services') { const ns = name ? [name] : Object.keys(K.svcs); if (name && !K.svcs[name]) return { err: `Error from server (NotFound): services "${name}" not found` }; return { out: ns.map(n => { const s = K.svcs[n]; const e = n === 'kubernetes' ? ['192.168.49.2:6443'] : endpoints(s).map(x => x.addr); const p = s.m.spec.ports[0]; return `Name:              ${n}\nNamespace:         default\nSelector:          ${labelsStr(s.m.spec.selector)}\nType:              ${s.m.spec.type}\nIP:                ${s.ip}\nPort:              ${p.name || '<unset>'}  ${p.port}/TCP\nTargetPort:        ${p.targetPort}/TCP\nEndpoints:         ${e.length ? e.join(',') : '<none>'}\nEvents:            <none>`; }).join('\n\n') }; }
  if (res === 'nodes') { let cpu = 0, mem = 0; S.k8s.pods.filter(p => podState(p).node).forEach(p => p.spec.containers.forEach(c => { cpu += parseCpu(c.resources?.requests?.cpu); mem += parseMem(c.resources?.requests?.memory); })); return { out: `Name:               ${NODE.name}\nRoles:              control-plane\nCapacity:\n  cpu:                2\n  memory:             4Gi\n  pods:               110\nAllocatable:\n  cpu:                2\n  memory:             4Gi\nAllocated resources:\n  Resource           Requests\n  --------           --------\n  cpu                ${Math.round(cpu * 1000)}m (${Math.round(cpu / 2 * 100)}%)\n  memory             ${Math.round(mem / 1048576)}Mi (${Math.round(mem / NODE.mem * 100)}%)` }; }
  if (res === 'configmaps') { if (!K.cms[name]) return { err: `Error from server (NotFound): configmaps "${name}" not found` }; return { out: `Name:         ${name}\nNamespace:    default\n\nData\n====\n${Object.entries(K.cms[name].m.data || {}).map(([k, v]) => `${k}:\n----\n${v}\n`).join('\n')}` }; }
  return { err: `error: the server doesn't have a resource type "${res}"` };
}
function splitRef(a, i) { const x = a[i] || ''; if (x.includes('/')) { const [r, n] = x.split('/'); return { res: RES[r] || r, name: n, used: 1 }; } return { res: RES[x] || x, name: a[i + 1], used: 2 }; }
cmd('kubectl', 'kubectl <command>\n  get <resource> [name] [-o wide|yaml] [-l key=value]   list things (pods, deploy, svc, cm, endpoints, nodes, events)\n  describe <resource> <name>       full details + Events at the bottom (start here when debugging)\n  logs <pod> [--previous]          what the container printed\n  apply -f <file.yaml>             create or update from a manifest\n  delete <resource> <name>         remove something\n  create deployment|configmap ...  quick creation without YAML\n  expose deployment <name> --port=80 [--target-port=80]\n  scale deployment <name> --replicas=N\n  set image deployment/<name> <container>=<image>\n  set env deployment/<name> KEY=value\n  rollout status|history|undo|restart deployment/<name>\n  Tip: kubectl get deploy web -o yaml > web.yaml, edit it, then apply it.', a => {
  if (!S.k8s) return { err: 'The connection to the server localhost:8080 was refused - did you specify the right host or port?', code: 1 };
  const K = S.k8s; const sub = a[0];
  if (!sub) return { out: MAN.kubectl };
  if (sub === 'version') return { out: 'Client Version: v1.31.0\nKustomize Version: v5.4.2\nServer Version: v1.31.0' };
  if (sub === 'cluster-info') return { out: 'Kubernetes control plane is running at https://192.168.49.2:8443\nCoreDNS is running at https://192.168.49.2:8443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy' };
  if (sub === 'config') return { out: 'lab-cluster' };
  if (sub === 'edit') return { err: 'kubectl edit opens an interactive editor, which this lab does not support.\nInstead: kubectl get <resource> <name> -o yaml > file.yaml, edit it with nano, then kubectl apply -f file.yaml', code: 1 };
  if (sub === 'get') {
    const rest = a.slice(1); let out = null, sel = null; const pos = [];
    for (let i = 0; i < rest.length; i++) { const x = rest[i]; if (x === '-o') out = rest[++i]; else if (x.startsWith('-o')) out = x.slice(2).replace(/^=/, ''); else if (x.startsWith('--output=')) out = x.slice(9); else if (x === '-l' || x === '--selector') sel = rest[++i]; else if (x.startsWith('--selector=')) sel = x.slice(11); else if (x === '-w' || x === '--watch' || x === '-A' || x === '--all-namespaces') { } else if (x === '-n' || x === '--namespace') i++; else pos.push(x); }
    if (!pos.length) return { err: 'You must specify the type of resource to get. Use "kubectl api-resources" for a complete list of supported resources.', code: 1 };
    let res, name; if (pos[0].includes('/')) { const [r, n] = pos[0].split('/'); res = RES[r]; name = n; } else { res = RES[pos[0].split(',')[0]]; name = pos[1]; }
    if (!res) return { err: `error: the server doesn't have a resource type "${pos[0]}"`, code: 1 };
    const selObj = sel ? Object.fromEntries(sel.split(',').map(x => x.split('='))) : null;
    if (res === 'all') { const parts = ['pods', 'services', 'deployments', 'replicasets'].map(r => { const g = getRows(r, null, {}); if (!g.rows) return ''; const pre = { pods: 'pod/', services: 'service/', deployments: 'deployment.apps/', replicasets: 'replicaset.apps/' }[r]; return table([g.rows[0], ...g.rows.slice(1).map(row => [pre + row[0], ...row.slice(1)])]); }).filter(Boolean); return { out: parts.join('\n\n') }; }
    const g = getRows(res, name, { wide: out === 'wide', sel: selObj }); if (g.err) return { err: g.err, code: 1 };
    if (g.none) return { err: 'No resources found in default namespace.' };
    if (out === 'yaml' || out === 'json') { const items = g.list || []; const obj = name ? items[0] : { apiVersion: 'v1', kind: 'List', items }; return { out: out === 'json' ? JSON.stringify(obj, null, 2) : jsyaml.dump(obj, { noRefs: true, lineWidth: 120 }).replace(/\n$/, '') }; }
    if (out === 'name') return { out: g.rows.slice(1).map(r => SING[res] + '/' + r[0]).join('\n') };
    if (out && out !== 'wide' && !out.startsWith('jsonpath')) return { err: `error: unable to match a printer suitable for the output format "${out}"`, code: 1 };
    return { out: table(g.rows) };
  }
  if (sub === 'describe') { const r = splitRef(a, 1); if (!r.res || !RES[a[1]?.split('/')[0]]) return { err: `error: the server doesn't have a resource type "${a[1] || ''}"`, code: 1 }; const d = describe(RES[a[1].split('/')[0]], r.name); return d.err ? { err: d.err, code: 1 } : d; }
  if (sub === 'logs') {
    let nm = a.slice(1).find((x, i, arr) => !x.startsWith('-') && arr[i - 1] !== '-c' && arr[i - 1] !== '--tail'); if (!nm) return { err: 'error: expected \'logs [-f] [-p] (POD | TYPE/NAME) [-c CONTAINER]\'.', code: 1 };
    let p; if (nm.includes('/')) { const [r, n] = nm.split('/'); if (RES[r] === 'deployments') { p = K.pods.find(x => x.owner === n); if (!K.deps[n]) return { err: `error: deployments.apps "${n}" not found`, code: 1 }; } else p = K.pods.find(x => x.name === n); } else p = K.pods.find(x => x.name === nm);
    if (!p) return { err: `error: error from server (NotFound): pods "${nm}" not found in namespace "default"`, code: 1 };
    const st = podState(p); if (!st.logs) return { err: `Error from server (BadRequest): container "${p.spec.containers[0].name}" in pod "${p.name}" is waiting to start: ${st.waitMsg || 'ContainerCreating'}`, code: 1 };
    K.flags.logsRead = (K.flags.logsRead || new Set()).add(p.owner || p.name); onChange();
    return { out: st.logs.join('\n') };
  }
  if (sub === 'apply' || sub === 'create' && (a[1] === '-f' || a[1] === '--filename')) {
    const fi = a.indexOf('-f') >= 0 ? a.indexOf('-f') : a.indexOf('--filename'); const f = a[fi + 1]; if (fi < 0 || !f) return { err: 'error: must specify one of -f and -k', code: 1 };
    const p = norm(f); const n = N(p); if (!n) return { err: `error: the path "${f}" does not exist`, code: 1 };
    const paths = n.t === 'd' ? kids(p).filter(k => /\.ya?ml$/.test(k)) : [p];
    const outs = [], errs = [];
    for (const fp of paths) { let docs; try { docs = jsyaml.loadAll(fread(fp)).filter(Boolean); } catch (e) { errs.push(`error: error parsing ${f}: error converting YAML to JSON: yaml: line ${(e.mark?.line ?? 0) + 1}: ${e.reason || e.message}`); continue; }
      if (!docs.length) { errs.push(`error: no objects passed to apply`); continue; }
      for (const d of docs) { const r = applyDoc(d, f); if (r.err) errs.push(r.err); else outs.push(r.out); } }
    onChange(); return { out: outs.join('\n'), err: errs.join('\n'), code: errs.length ? 1 : 0 };
  }
  if (sub === 'delete') {
    if (a[1] === '-f') { const p = norm(a[2] || ''); if (!N(p)) return { err: `error: the path "${a[2]}" does not exist`, code: 1 }; const outs = []; for (const d of jsyaml.loadAll(fread(p)).filter(Boolean)) { const r = { Deployment: 'deployments', Service: 'services', ConfigMap: 'configmaps', Pod: 'pods' }[d.kind]; if (r) outs.push(CMDS.kubectl.run(['delete', r, d.metadata?.name]).out); } onChange(); return { out: outs.join('\n') }; }
    const r = splitRef(a, 1); const res = RES[(a[1] || '').split('/')[0]]; const nm = r.name; if (!res || !nm) return { err: 'error: resource(s) were provided, but no name was specified', code: 1 };
    if (res === 'pods') { const p = K.pods.find(x => x.name === nm); if (!p) return { err: `Error from server (NotFound): pods "${nm}" not found`, code: 1 }; K.pods = K.pods.filter(x => x !== p); if (p.owner) K.flags.deletedOwned = (K.flags.deletedOwned || 0) + 1; reconcile(); onChange(); return { out: `pod "${nm}" deleted` }; }
    if (res === 'deployments') { if (!K.deps[nm]) return { err: `Error from server (NotFound): deployments.apps "${nm}" not found`, code: 1 }; delete K.deps[nm]; reconcile(); onChange(); return { out: `deployment.apps "${nm}" deleted` }; }
    if (res === 'services') { if (!K.svcs[nm]) return { err: `Error from server (NotFound): services "${nm}" not found`, code: 1 }; if (nm === 'kubernetes') return { err: 'Leave the kubernetes service alone; the API server needs it.', code: 1 }; delete K.svcs[nm]; onChange(); return { out: `service "${nm}" deleted` }; }
    if (res === 'configmaps') { if (!K.cms[nm]) return { err: `Error from server (NotFound): configmaps "${nm}" not found`, code: 1 }; delete K.cms[nm]; onChange(); return { out: `configmap "${nm}" deleted` }; }
    return { err: `error: the server doesn't have a resource type "${a[1]}"`, code: 1 };
  }
  if (sub === 'scale') {
    const r = splitRef(a, 1); const rep = a.find(x => x.startsWith('--replicas')); if (!rep) return { err: 'error: required flag(s) "replicas" not set', code: 1 };
    const n = +(rep.includes('=') ? rep.split('=')[1] : a[a.indexOf(rep) + 1]); const d = K.deps[r.name]; if (RES[(a[1] || '').split('/')[0]] !== 'deployments') return { err: 'error: scale only works on deployments in this lab', code: 1 };
    if (!d) return { err: `Error from server (NotFound): deployments.apps "${r.name}" not found`, code: 1 };
    if (!Number.isInteger(n) || n < 0) return { err: `error: invalid argument "${rep}" for "--replicas" flag`, code: 1 };
    d.m.spec.replicas = n; reconcile(); onChange(); return { out: `deployment.apps/${r.name} scaled` };
  }
  if (sub === 'set') {
    const what = a[1]; const ref = a[2] || ''; const [rr, nm] = ref.includes('/') ? ref.split('/') : [ref, a[3]]; const d = K.deps[nm];
    if (RES[rr] !== 'deployments') return { err: 'error: in this lab, "set" works on deployments: kubectl set image deployment/<name> ...', code: 1 };
    if (!d) return { err: `Error from server (NotFound): deployments.apps "${nm}" not found`, code: 1 };
    const kvs = a.slice(ref.includes('/') ? 3 : 4); const m = JSON.parse(JSON.stringify(d.m)); const cs = m.spec.template.spec.containers;
    if (what === 'image') { for (const kv of kvs) { const [cn, img] = kv.split('='); const c = cn === '*' ? cs : cs.filter(x => x.name === cn); if (!c.length) return { err: `error: unable to find container named "${cn}"`, code: 1 }; c.forEach(x => x.image = img); } setDeployment(m, `kubectl set image deployment/${nm} ${kvs.join(' ')}`); onChange(); return { out: `deployment.apps/${nm} image updated` }; }
    if (what === 'env') { const from = kvs.find(x => x.startsWith('--from=')); if (from) { const cmn = from.split('/')[1]; if (!K.cms[cmn]) return { err: `error: configmaps "${cmn}" not found`, code: 1 }; cs.forEach(c => { c.env = (c.env || []).filter(e => !(e.name in (K.cms[cmn].m.data || {}))); Object.keys(K.cms[cmn].m.data || {}).forEach(k => c.env.push({ name: k, valueFrom: { configMapKeyRef: { name: cmn, key: k } } })); }); } else for (const kv of kvs.filter(x => !x.startsWith('-'))) { const [k, ...v] = kv.split('='); if (k.endsWith('-')) cs.forEach(c => c.env = (c.env || []).filter(e => e.name !== k.slice(0, -1))); else cs.forEach(c => { c.env = (c.env || []).filter(e => e.name !== k); c.env.push({ name: k, value: v.join('=') }); }); } setDeployment(m, 'kubectl set env'); onChange(); return { out: `deployment.apps/${nm} env updated` }; }
    if (what === 'resources') { for (const kv of kvs) { const mm = /^--(requests|limits)=(.*)$/.exec(kv); if (!mm) continue; const o = Object.fromEntries(mm[2].split(',').map(x => x.split('='))); cs.forEach(c => { c.resources = c.resources || {}; c.resources[mm[1]] = Object.assign(c.resources[mm[1]] || {}, o); }); } setDeployment(m, 'kubectl set resources'); onChange(); return { out: `deployment.apps/${nm} resource requirements updated` }; }
    return { err: `error: unknown command "${what}" for "kubectl set"`, code: 1 };
  }
  if (sub === 'rollout') {
    const act = a[1]; const ref = a[2] || ''; const [rr, nm] = ref.includes('/') ? ref.split('/') : [ref, a[3]]; const d = K.deps[nm];
    if (RES[rr] !== 'deployments') return { err: 'error: rollout works on deployments: kubectl rollout <status|history|undo|restart> deployment/<name>', code: 1 };
    if (!d) return { err: `Error from server (NotFound): deployments.apps "${nm}" not found`, code: 1 };
    if (act === 'status') { const v = depView(nm); if (v.ready === v.want && v.pods.length === v.want) return { out: `deployment "${nm}" successfully rolled out` }; return { out: `Waiting for deployment "${nm}" rollout to finish: ${v.ready} of ${v.want} updated replicas are available...`, err: 'error: deployment exceeded its progress deadline (the real command would keep waiting; check the pods)', code: 1 }; }
    if (act === 'history') { const rev = a.find(x => x.startsWith('--revision=')); if (rev) { const h = d.history.find(x => x.rev === +rev.split('=')[1]); if (!h) return { err: `error: unable to find the specified revision`, code: 1 }; return { out: `deployment.apps/${nm} with revision #${h.rev}\nPod Template:\n  Labels:  ${labelsStr(h.tmpl.metadata?.labels)}\n  Containers:\n${h.tmpl.spec.containers.map(c => `   ${c.name}:\n    Image:  ${c.image}`).join('\n')}` }; } return { out: `deployment.apps/${nm}\nREVISION  CHANGE-CAUSE\n` + d.history.map(h => `${String(h.rev).padEnd(9)} ${h.cause}`).join('\n') }; }
    if (act === 'undo') { const to = a.find(x => x.startsWith('--to-revision=')); let target; if (to) { target = d.history.find(h => h.rev === +to.split('=')[1]); if (!target) return { err: 'error: unable to find specified revision ' + to.split('=')[1] + ' in history', code: 1 }; } else { if (d.history.length < 2) return { err: `error: no rollout history found for deployment "${nm}"`, code: 1 }; target = d.history[d.history.length - 2]; } const m = JSON.parse(JSON.stringify(d.m)); m.spec.template = JSON.parse(JSON.stringify(target.tmpl)); setDeployment(m, target.cause); K.flags.undone = (K.flags.undone || new Set()).add(nm); onChange(); return { out: `deployment.apps/${nm} rolled back` }; }
    if (act === 'restart') { K.pods = K.pods.filter(p => p.owner !== nm); reconcile(); onChange(); return { out: `deployment.apps/${nm} restarted` }; }
    return { err: `error: unknown command "${act}" for "kubectl rollout"`, code: 1 };
  }
  if (sub === 'expose') {
    const r = splitRef(a, 1); if (RES[(a[1] || '').split('/')[0]] !== 'deployments') return { err: 'error: expose a deployment: kubectl expose deployment <name> --port=80', code: 1 }; const d = K.deps[r.name]; if (!d) return { err: `Error from server (NotFound): deployments.apps "${r.name}" not found`, code: 1 };
    const opt = k => { const x = a.find(y => y.startsWith(`--${k}=`)); if (x) return x.split('=')[1]; const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
    const port = opt('port'); if (!port) return { err: 'error: couldn\'t find port via --port flag or introspection', code: 1 }; const name = opt('name') || r.name; if (K.svcs[name]) return { err: `Error from server (AlreadyExists): services "${name}" already exists`, code: 1 };
    const tp = opt('target-port'); applyDoc({ apiVersion: 'v1', kind: 'Service', metadata: { name }, spec: { type: opt('type') || 'ClusterIP', selector: Object.assign({}, d.m.spec.selector.matchLabels), ports: [{ port: +port, targetPort: tp ? (/^\d+$/.test(tp) ? +tp : tp) : +port }] } }, 'expose'); onChange(); return { out: `service/${name} exposed` };
  }
  if (sub === 'create') {
    const what = a[1], nm = a[2]; const opt = k => { const x = a.find(y => y.startsWith(`--${k}=`)); if (x) return x.slice(k.length + 3); const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
    if (what === 'deployment' || what === 'deploy') { const img = opt('image'); if (!nm || !img) return { err: 'error: required flag(s) "image" not set', code: 1 }; if (K.deps[nm]) return { err: `Error from server (AlreadyExists): deployments.apps "${nm}" already exists`, code: 1 }; const c = { name: img.split('/').pop().split(':')[0], image: img }; if (opt('port')) c.ports = [{ containerPort: +opt('port') }]; setDeployment({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: nm, labels: { app: nm } }, spec: { replicas: +(opt('replicas') || 1), selector: { matchLabels: { app: nm } }, template: { metadata: { labels: { app: nm } }, spec: { containers: [c] } } } }, `kubectl create deployment ${nm} --image=${img}`); onChange(); return { out: `deployment.apps/${nm} created` }; }
    if (what === 'configmap' || what === 'cm') { if (!nm) return { err: 'error: exactly one NAME is required, got 0', code: 1 }; if (K.cms[nm]) return { err: `error: failed to create configmap: configmaps "${nm}" already exists`, code: 1 }; const data = {}; a.filter(x => x.startsWith('--from-literal=')).forEach(x => { const [k, ...v] = x.slice(15).split('='); data[k] = v.join('='); }); K.cms[nm] = { m: { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: nm, namespace: 'default' }, data }, created: Date.now() }; onChange(); return { out: `configmap/${nm} created` }; }
    return { err: `error: in this lab, create supports: deployment, configmap (or use apply -f)`, code: 1 };
  }
  if (sub === 'run') { const nm = a[1]; const img = (a.find(x => x.startsWith('--image=')) || '').slice(8); if (!nm || !img) return { err: 'error: required flag(s) "image" not set', code: 1 }; return applyDoc({ apiVersion: 'v1', kind: 'Pod', metadata: { name: nm, labels: { run: nm } }, spec: { containers: [{ name: nm, image: img }] } }, 'run'); }
  if (sub === 'top') return { out: 'NAME       CPU(cores)   MEMORY(bytes)\n' + K.pods.filter(p => podState(p).ready).map(p => `${p.name.padEnd(30)} ${(3 + p.ip.length % 7) + 'm'}           ${12 + p.ip.length % 9}Mi`).join('\n') };
  if (sub === 'explain') return { out: 'Use the field notes on the left, and kubectl get <resource> <name> -o yaml to see real examples.' };
  if (sub === 'port-forward') return { err: 'port-forward blocks the terminal. In this lab the terminal already sits inside the cluster network: curl http://<service-name> works directly.', code: 1 };
  if (sub === 'exec') return { err: 'exec is not simulated here. Use logs and describe.', code: 1 };
  return { err: `error: unknown command "${sub}" for "kubectl"\nRun 'kubectl --help' for usage.`, code: 1 };
});
