/* ================= LESSONS ================= */
const MODULES = ['Linux', 'Ansible', 'Kubernetes', 'Monitoring & incidents'];
const HOME = '/home/dev';
const has = p => !!N(p);
const lastRun = () => S.runs[S.runs.length - 1];
function nginxSvc(conf, started) {
  mkf('/etc/nginx/nginx.conf', conf);
  mkf('/var/www/html/index.html', '<!DOCTYPE html>\n<html><head><title>Shop</title></head>\n<body><h1>Shop is up</h1></body></html>\n');
  const s = addSvc('nginx', { desc: 'A high performance web server and a reverse proxy server', check: () => nginxCheck(), proc: { user: 'root', cmd: 'nginx: master process /usr/sbin/nginx -g daemon on; master_process on;', port: 80, http: () => fread('/var/www/html/index.html') || '' } });
  if (started) { s.enabled = true; svcStart(s, true); }
  return s;
}
const GOOD_NGINX = `user www-data;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log;

events {
    worker_connections 768;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    access_log /var/log/nginx/access.log;

    server {
        listen 80;
        server_name shop.local;
        root /var/www/html;
        index index.html;
    }
}
`;
function ansibleLab(extra) {
  world('control'); S.cwd = HOME + '/ansible-lab';
  mkd(HOME + '/ansible-lab', 'dev');
  mkf(HOME + '/ansible-lab/ansible.cfg', '[defaults]\ninventory = inventory.ini\nhost_key_checking = False\nremote_user = ubuntu\n', 'dev');
  ['web1', 'web2', 'db1'].forEach(h => S.hosts[h] = newHost(h));
  mkf('/etc/hosts', '127.0.0.1 localhost\n10.0.1.11 web1\n10.0.1.12 web2\n10.0.1.21 db1\n');
  if (extra) extra();
}
const GOOD_INV = '[web]\nweb1\nweb2\n\n[db]\ndb1\n';
function k8sLab(extra) { world('k8s-admin'); S.cwd = HOME + '/k8s-lab'; mkd(HOME + '/k8s-lab', 'dev'); cluster(); if (extra) extra(); reconcile(); }
function seedDep(m, ageMin, history) { const nm = m.metadata.name; S.k8s.deps[nm] = { m, created: Date.now() - ageMin * 60e3, seedAge: ageMin * 60e3, history: history || [{ rev: 1, tmpl: JSON.parse(JSON.stringify(m.spec.template)), cause: '<none>' }] }; }
function dep(name, image, replicas, extra = {}) { const c = Object.assign({ name: extra.cname || name, image }, extra.c || {}); return { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name, namespace: 'default', labels: { app: name } }, spec: { replicas, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { app: name } }, spec: { containers: [c] } } } }; }
const allRunning = nm => { const v = depView(nm); return v.pods.length === v.want && v.ready === v.want && v.want > 0; };
const contImage = nm => S.k8s.deps[nm]?.m.spec.template.spec.containers[0].image;
function monLab(host, extra) { world(host); mkd(HOME + '/monitoring', 'dev'); mkf(HOME + '/monitoring/prometheus.yml', `global:\n  scrape_interval: 15s\n  evaluation_interval: 15s\n\nrule_files:\n  - rules/*.yml\n\nscrape_configs:\n  - job_name: node\n    static_configs:\n      - targets: ['web1:9100', 'web2:9100', 'db1:9100']\n  - job_name: shop\n    static_configs:\n      - targets: ['checkout-0:8080', 'checkout-1:8080', 'catalog-0:8080', 'catalog-1:8080', 'auth-0:8080', 'auth-1:8080']\n`, 'dev'); if (extra) extra(); }

const LESSONS = [
/* ---------- LINUX ---------- */
{ id: 'lx1', mod: 0, title: 'Find your way around', host: 'lab-01',
  ticket: { id: 'TASK-101', sev: 4, text: '<p>Before the billing team changes their database settings, they want a backup of the current <code>app.conf</code>. Nobody remembers where it lives, only that it is somewhere under <code>/srv</code>.</p><p>Back it up into a new <code>backup</code> folder in your home, then pull out the database port line for the team.</p>' },
  notes: `<p>Everything on Linux is a file in one tree starting at <code>/</code>. An <b>absolute path</b> starts with <code>/</code> (<code>/srv/apps</code>). A <b>relative path</b> starts from where you are (<code>apps/billing</code>). <code>~</code> is your home, <code>..</code> is the parent folder.</p>
<p>Don't wander folder by folder when you're hunting. <code>find</code> searches a whole tree by name, and <code>grep</code> searches inside files for text. Wrap name patterns in quotes so the shell doesn't expand the <code>*</code> itself.</p>
<p>The shell can send a command's output into a file: <code>&gt;</code> overwrites the file, <code>&gt;&gt;</code> appends to it.</p>
<p>Watch out for look-alike files (<code>.bak</code>, <code>.old</code>). Read what you found before you trust it.</p>`,
  tools: ['find', 'grep', 'cat', 'mkdir', 'cp', 'ls', '>'],
  nudges: ['find takes a starting folder and a -name pattern. Start from /srv.', 'grep can read a file directly and print only the matching line. Then redirect that output into the answer file.'],
  setup() { world('lab-01');
    for (const app of ['auth', 'search', 'mail', 'billing']) for (const d of ['bin', 'logs', 'config']) mkd(`/srv/apps/${app}/${d}`);
    mkf('/srv/apps/billing/config/app.conf', '# billing service\nservice_name = billing\nlisten_port = 8443\ndb_host = db1.internal\ndb_port = 5432\ndb_name = billing_prod\nlog_level = info\n');
    mkf('/srv/apps/billing/config/app.conf.old', '# old config, do not use\nservice_name = billing\ndb_host = legacy-db\ndb_port = 3306\n');
    mkf('/srv/apps/auth/config/auth.conf', 'service_name = auth\nlisten_port = 9000\n');
    mkf('/srv/apps/search/config/search.yaml', 'shards: 3\n'); mkf('/srv/apps/mail/logs/mail.log', 'Oct 22 08:00:01 mail queue flushed\n'); mkf('/srv/apps/billing/logs/billing.log', 'Oct 22 08:12:44 invoice batch done\n'); mkf('/srv/apps/billing/bin/run.sh', '#!/bin/bash\n/opt/billing/bin/billing --config ../config/app.conf\n', 'root', 0o755); },
  objectives: [
    { t: 'A folder named <code>backup</code> exists in your home', ok: () => N(HOME + '/backup')?.t === 'd' },
    { t: 'It contains <code>app.conf</code>, identical to the real config', ok: () => fread(HOME + '/backup/app.conf') === fread('/srv/apps/billing/config/app.conf') },
    { t: '<code>~/answer.txt</code> holds the line that sets <code>db_port</code> (just that line)', ok: () => (fread(HOME + '/answer.txt') || '').trim() === 'db_port = 5432' } ] },
{ id: 'lx2', mod: 0, title: 'Users, groups and permissions', host: 'lab-01',
  ticket: { id: 'SEC-214', sev: 3, text: '<p>Security scan finding: <code>/opt/deploy/deploy.sh</code> is world-writable. Anyone on the box could change what our deploys run.</p><p>Create a <code>deploy</code> service user and an <code>ops</code> group for it. The script should belong to <code>deploy</code> and the <code>ops</code> group, be runnable by its owner, readable by the group, and closed to everyone else.</p>' },
  notes: `<p>Every file has an <b>owner</b>, a <b>group</b>, and three permission sets: owner, group, others. Each set is some mix of <b>r</b>ead, <b>w</b>rite, e<b>x</b>ecute. <code>ls -l</code> shows them as <code>-rwxr-x---</code>.</p>
<p>In numbers, r=4, w=2, x=1, added per set. <code>750</code> means owner rwx (7), group r-x (5), others nothing (0). Symbolic changes work too: <code>chmod o-w file</code> removes write for others.</p>
<p>Creating users and groups and changing owners needs root. Prefix the command with <code>sudo</code>. If you get "Permission denied", that's usually the reason.</p>
<p>A user's groups are listed by <code>id username</code>. Adding to a group without dropping existing ones uses <code>usermod -aG</code>.</p>`,
  tools: ['sudo', 'groupadd', 'useradd', 'usermod', 'id', 'chown', 'chmod', 'ls -l'],
  nudges: ['Order matters: the group has to exist before you can put someone in it or give a file to it.', 'Check your work with ls -l and id deploy. The last three permission letters should all be dashes.'],
  setup() { world('lab-01'); mkf('/opt/deploy/deploy.sh', '#!/bin/bash\nset -e\necho "pulling latest release"\nrsync -a /srv/releases/current/ /var/www/html/\nsystemctl reload nginx\n', 'root', 0o666); mkf('/opt/deploy/README', 'Deploy scripts. Owned by the deploy user.\n', 'root', 0o644); },
  objectives: [
    { t: 'User <code>deploy</code> and group <code>ops</code> exist', ok: () => hasUser('deploy') && hasGroup('ops') },
    { t: '<code>deploy</code> is a member of <code>ops</code>', ok: () => S.users.deploy?.groups.includes('ops') },
    { t: 'The script is owned by <code>deploy</code>, group <code>ops</code>', ok: () => N('/opt/deploy/deploy.sh')?.o === 'deploy' && N('/opt/deploy/deploy.sh')?.g === 'ops' },
    { t: 'Owner can run it, group can only read it, others get nothing', ok: () => { const m = N('/opt/deploy/deploy.sh')?.m ?? 0; return (m & 0o100) && (m & 0o040) && !(m & 0o007) && !(m & 0o020); } } ] },
{ id: 'lx3', mod: 0, title: 'A service that won\'t start', host: 'lab-01',
  ticket: { id: 'INC-1187', sev: 2, text: '<p>The shop website is down after last night\'s config change. <code>curl localhost</code> is refused. Someone edited the nginx config by hand and went home.</p><p>Get nginx running again, and make sure it comes back by itself if the server reboots.</p>' },
  notes: `<p>Services are managed by <b>systemd</b>. <code>systemctl status name</code> shows whether it runs and the last log lines. <code>start</code>, <code>stop</code>, <code>restart</code> change the state now. <code>enable</code> makes it start at boot. Changing state needs root.</p>
<p>When a service fails, the reason is in its logs: <code>journalctl -u name</code>. Read the last error line carefully. It usually names the file and the line number.</p>
<p>Many daemons can check their own config before you restart them. For nginx, that's <code>nginx -t</code>. Test first, restart second, so you never take a running server down with a broken file.</p>
<p>System config files belong to root, so open them with <code>sudo nano</code>.</p>`,
  tools: ['systemctl', 'journalctl', 'nginx -t', 'sudo nano', 'curl'],
  nudges: ['The status output tells you where to look next. The logs tell you the exact line.', 'There may be more than one mistake in the file. Test again after each fix.'],
  setup() { world('lab-01'); const bad = GOOD_NGINX.replace('        listen 80;', '        listn 80;').replace('        index index.html;', '        index index.html'); const s = nginxSvc(bad, false); s.state = 'failed'; s.enabled = false; slog(s, 'systemd[1]: Starting nginx.service - A high performance web server and a reverse proxy server...'); slog(s, 'nginx[4120]: nginx: [emerg] unknown directive "listn" in /etc/nginx/nginx.conf:18'); slog(s, "systemd[1]: nginx.service: Failed with result 'exit-code'."); slog(s, 'systemd[1]: Failed to start nginx.service - A high performance web server and a reverse proxy server.'); },
  objectives: [
    { t: 'The nginx config passes its own test', ok: () => nginxCheck() === null },
    { t: 'nginx is running', ok: () => S.services.nginx.state === 'active' },
    { t: 'nginx is enabled at boot', ok: () => S.services.nginx.enabled },
    { t: 'You confirmed the site answers on port 80', ok: () => S.services.nginx.state === 'active' && !!S.flags['curl:80'] } ] },
{ id: 'lx4', mod: 0, title: 'Who is on my port?', host: 'lab-01',
  ticket: { id: 'INC-1203', sev: 2, text: '<p>The <code>myapp</code> API won\'t start after a deploy. It listens on port 8080 and the logs say the address is already in use.</p><p>Someone left something running on that port. Find it, stop it, then bring <code>myapp</code> up and check it answers.</p>' },
  notes: `<p>Only one process can listen on a port. When a service says <b>address already in use</b>, find who holds the port before anything else.</p>
<p><code>ss -tulpn</code> lists listening ports. The last column names the process, but only for your own processes unless you run it with <code>sudo</code>. <code>lsof -i :PORT</code> answers the same question.</p>
<p><code>ps aux</code> shows every process with its owner and PID. <code>kill PID</code> asks a process to stop. <code>kill -9</code> forces it, and is the last resort, not the first.</p>
<p>Stopping another user's process needs root. Before you kill anything on a real server, make sure you know what it is.</p>`,
  tools: ['journalctl', 'ss -tulpn', 'lsof', 'ps aux', 'kill', 'systemctl'],
  nudges: ['Try listing ports with and without sudo and compare what you can see.', 'Once you have the PID, check what it is with ps before stopping it. Then start myapp again.'],
  setup() { world('lab-01'); S.users.jenkins = { uid: 1101, groups: ['jenkins'], home: '/var/lib/jenkins', shell: '/bin/bash' }; S.groups.jenkins = 1101;
    mkf('/opt/myapp/server.js', "require('http').createServer((q,s)=>s.end('ok')).listen(8080)\n");
    const rogue = { user: 'jenkins', cmd: 'python3 -m http.server 8080', port: 8080, cpu: 0.4, mem: 0.6, http: () => '<!DOCTYPE HTML>\n<html><title>Directory listing for /</title><body><h1>Directory listing for /</h1><ul><li>build-4471.tar.gz</li></ul></body></html>' };
    spawn(rogue);
    const s = addSvc('myapp', { desc: 'Shop API (node)', check: () => localPort(8080) ? ['node[5520]: Error: listen EADDRINUSE: address already in use :::8080', 'node[5520]:     at Server.setupListenHandle [as _listen2] (node:net:1872:16)'] : null, proc: { user: 'www-data', cmd: '/usr/bin/node /opt/myapp/server.js', port: 8080, cpu: 1.1, mem: 2.3, http: () => '{"status":"ok","service":"myapp","version":"2.4.1"}' } });
    s.enabled = true; svcStart(s); },
  objectives: [
    { t: 'The stray process on port 8080 is gone', ok: () => !S.procs.some(p => p.cmd.includes('http.server')) },
    { t: '<code>myapp</code> is running', ok: () => S.services.myapp.state === 'active' },
    { t: 'You checked that <code>localhost:8080</code> answers with myapp\'s JSON', ok: () => S.services.myapp.state === 'active' && String(S.flags['curl:8080'] || '').includes('myapp') } ] },
{ id: 'lx5', mod: 0, title: 'Disk full at 3 a.m.', host: 'lab-01',
  ticket: { id: 'INC-1240', sev: 2, text: '<p>Nightly backups are failing with <code>No space left on device</code>. The root disk is full.</p><p>Free up space without deleting anything the business needs: the database backups, the main app log and the system log stay. Then stop whatever filled the disk from doing it again.</p>' },
  notes: `<p><code>df -h</code> shows how full each filesystem is. <code>du -sh path/*</code> shows which folders use the space. Drill down one level at a time, biggest first. <code>find / -size +500M</code> lists very large files directly.</p>
<p>Logs are the usual suspect, especially a <b>debug</b> log someone forgot to switch off. Removing the file frees the space today. Fixing the setting that produced it stops it happening again tomorrow.</p>
<p><code>truncate -s 0 file</code> empties a file but keeps it in place, which is safer when a program still writes to it.</p>
<p>Before deleting, ask: does anyone need this? Backups and audit logs are never the thing to delete in a hurry.</p>`,
  tools: ['df -h', 'du -sh', 'find -size', 'ls -lh', 'rm', 'truncate', 'grep', 'sudo nano'],
  nudges: ['Start at /, then follow the biggest folder down. /var is a good bet.', 'The application\'s own config decides how chatty its logging is. Look for it under /etc.'],
  setup() { world('lab-01'); S.diskBase = 8.1 * 1073741824;
    mkf('/var/log/app/app.log', 'Oct 22 02:10:01 INFO order 81723 paid\n', 'root', 0o644, { size: 128 * 1048576 });
    mkf('/var/log/app/debug.log', 'Oct 22 02:10:01.002 DEBUG cache lookup key=sess:91 hit=false\nOct 22 02:10:01.003 DEBUG sql SELECT * FROM carts WHERE id=91\n', 'root', 0o644, { size: 9.55 * 1073741824 });
    mkf('/var/log/syslog', 'Oct 22 02:13:44 lab-01 CRON[2201]: (root) CMD (/usr/local/bin/backup.sh)\nOct 22 02:13:44 lab-01 backup.sh: gzip: write error: No space left on device\n', 'root', 0o640, { size: 84 * 1048576 });
    mkf('/var/log/nginx/access.log', '10.0.0.4 - - [22/Oct/2026:02:01:12] "GET / HTTP/1.1" 200 512\n', 'root', 0o640, { size: 310 * 1048576 });
    mkf('/var/backups/db/shop-2026-10-20.sql.gz', '', 'root', 0o600, { size: 1.2 * 1073741824 });
    mkf('/var/backups/db/shop-2026-10-21.sql.gz', '', 'root', 0o600, { size: 1.21 * 1073741824 });
    mkf('/etc/app/app.conf', '# shop api settings\nlisten = 8080\nlog_dir = /var/log/app\nlog_level = debug\n# levels: error, warn, info, debug\n');
    mkf('/usr/local/bin/backup.sh', '#!/bin/bash\npg_dump shop | gzip > /var/backups/db/shop-$(date +%F).sql.gz\n', 'root', 0o755); },
  objectives: [
    { t: 'Root filesystem usage is under 80%', ok: () => diskUsed() / DISK < 0.8 },
    { t: 'Backups, <code>app.log</code> and <code>syslog</code> are still there', ok: () => has('/var/backups/db/shop-2026-10-20.sql.gz') && has('/var/backups/db/shop-2026-10-21.sql.gz') && has('/var/log/app/app.log') && has('/var/log/syslog') },
    { t: 'The app no longer logs at debug level', ok: () => { const c = fread('/etc/app/app.conf') || ''; const m = /^\s*log_level\s*=\s*(\w+)/m.exec(c); return !!m && ['info', 'warn', 'error'].includes(m[1]); } } ] },
{ id: 'lx6', mod: 0, title: 'Automate a health check', host: 'lab-01',
  ticket: { id: 'TASK-130', sev: 4, text: '<p>The team wants a small health report written every 5 minutes, so the on-call person can see the state of the box at a glance.</p><p>Write <code>~/health.sh</code>. Each run should write <code>~/report.txt</code> with the disk usage and nginx\'s status. Run it once to prove it works, then schedule it.</p>' },
  notes: `<p>A shell script is a text file of commands, run top to bottom. Start it with <code>#!/bin/bash</code>. To run it as <code>./health.sh</code> it needs the execute bit (<code>chmod +x</code>).</p>
<p>Inside a script, <code>&gt;</code> creates or overwrites a file and <code>&gt;&gt;</code> appends. Use <code>&gt;</code> for the first line of a report so old runs don't pile up. <code>$(date)</code> inserts a command's output into a line.</p>
<p><b>cron</b> runs commands on a schedule. <code>crontab -e</code> edits your jobs. Five fields come before the command: minute, hour, day of month, month, day of week. <code>*/15</code> in the first field means every 15 minutes.</p>
<p>Cron runs with almost no environment. Always give it absolute paths, never <code>~</code> or relative ones. (This script runs fine from the lab terminal either way, but cron jobs with relative paths are a classic silent failure.)</p>`,
  tools: ['nano', 'chmod +x', './script.sh', 'df -h', 'systemctl', 'crontab -e', 'crontab -l'],
  nudges: ['Two commands are enough: one writes the disk usage, the next appends nginx\'s status.', 'Check report.txt with cat after running the script, before you schedule anything.'],
  setup() { world('lab-01'); nginxSvc(GOOD_NGINX, true); S.diskBase = 9.4 * 1073741824; },
  objectives: [
    { t: '<code>~/health.sh</code> exists and is executable', ok: () => { const n = N(HOME + '/health.sh'); return !!n && !!(n.m & 0o100); } },
    { t: 'Running it produced <code>~/report.txt</code> with disk usage and nginx\'s status', ok: () => { const r = fread(HOME + '/report.txt') || ''; return S.flags.scriptRan > 0 && /Filesystem/.test(r) && /nginx/.test(r) && /active/.test(r); } },
    { t: 'Cron runs it every 5 minutes using its absolute path', ok: () => S.crontab.split('\n').some(l => /^\s*\*\/5\s+\*\s+\*\s+\*\s+\*\s+(\S+\s+)?\/home\/dev\/health\.sh\b/.test(l)) } ] },
/* ---------- ANSIBLE ---------- */
{ id: 'an1', mod: 1, title: 'Inventory and first contact', host: 'control',
  ticket: { id: 'TASK-201', sev: 4, text: '<p>You now manage three servers from this control machine: two web servers, <code>web1</code> and <code>web2</code>, and one database, <code>db1</code>.</p><p>Write the inventory Ansible will use, sorted into a <code>web</code> group and a <code>db</code> group. Then prove you can reach every server, and that you can target the web servers alone.</p>' },
  notes: `<p>Ansible connects to servers over SSH and needs no agent on them. It finds servers in an <b>inventory</b>. The simplest format is INI: a <code>[group]</code> header, then one host per line.</p>
<pre><code>[groupname]
host-a
host-b</code></pre>
<p>This folder's <code>ansible.cfg</code> already points to <code>inventory.ini</code>, so you don't need <code>-i</code> every time.</p>
<p><b>Ad-hoc commands</b> run one module on many hosts: <code>ansible PATTERN -m MODULE</code>. The pattern can be <code>all</code>, a group, or a host. The <code>ping</code> module checks that Ansible can log in and run Python. It's not a network ping.</p>
<p><code>ansible-inventory --graph</code> shows how Ansible understood your file.</p>`,
  tools: ['nano', 'ansible-inventory --graph', 'ansible', '-m ping', 'cat ansible.cfg'],
  nudges: ['Group names go in square brackets. Hosts go one per line underneath.', 'Run the ping module twice: once against everything, once against only the web group.'],
  setup() { ansibleLab(); mkf(HOME + '/ansible-lab/README.md', '# ansible-lab\nServers: web1, web2 (web), db1 (database)\n', 'dev'); },
  objectives: [
    { t: '<code>inventory.ini</code> has a <code>web</code> group (web1, web2) and a <code>db</code> group (db1)', ok: () => { const inv = parseInventory(HOME + '/ansible-lab/inventory.ini'); return !inv.warn && !inv.error && JSON.stringify((inv.groups.web || []).slice().sort()) === '["web1","web2"]' && JSON.stringify(inv.groups.db || []) === '["db1"]'; } },
    { t: 'The <code>ping</code> module succeeds on all three servers', ok: () => S.adhoc.some(r => r.mod === 'ping' && ['web1', 'web2', 'db1'].every(h => r.ok.includes(h))) },
    { t: 'You pinged only the web servers using the group name', ok: () => S.adhoc.some(r => r.mod === 'ping' && r.pat === 'web' && r.ok.length === 2) } ] },
{ id: 'an2', mod: 1, title: 'Your first playbook', host: 'control',
  ticket: { id: 'TASK-207', sev: 4, text: '<p>Both web servers need nginx, installed, running, and set to start at boot. The database server must not get it.</p><p>Do it with a playbook, not by hand, and prove the playbook is safe to run again.</p>' },
  notes: `<p>A <b>playbook</b> is YAML: a list of <b>plays</b>. Each play picks hosts and lists tasks. Each task calls one module with arguments. Indentation is structure in YAML; use spaces, never tabs.</p>
<pre><code>- name: Describe the play
  hosts: some_group
  become: true          # run tasks as root on the target
  tasks:
    - name: Describe the task
      module_name:
        arg: value</code></pre>
<p>Useful modules here: <code>apt</code> (<code>name</code>, <code>state: present</code>) and <code>service</code> (<code>name</code>, <code>state: started</code>, <code>enabled: true</code>).</p>
<p>Ansible is <b>declarative</b>: you describe the end state, not the steps. A good playbook is <b>idempotent</b>: the second run finds nothing to change and reports <code>changed=0</code>. That's what makes it safe to run anytime.</p>
<p>In this lab, installing a package does not start its service. Declare the state you want instead of relying on install side effects.</p>`,
  tools: ['nano site.yml', 'ansible-playbook', 'apt', 'service', 'become', 'curl http://web1'],
  nudges: ['If a task fails with a permission error, think about who the task runs as on the target.', 'Read the PLAY RECAP after each run. Run it again until it says changed=0.'],
  setup() { ansibleLab(() => mkf(HOME + '/ansible-lab/inventory.ini', GOOD_INV, 'dev')); },
  objectives: [
    { t: 'nginx is installed and running on web1 and web2', ok: () => ['web1', 'web2'].every(h => S.hosts[h].pkgs.has('nginx') && S.hosts[h].svcs.nginx?.active) },
    { t: 'nginx is enabled at boot on both', ok: () => ['web1', 'web2'].every(h => S.hosts[h].svcs.nginx?.enabled) },
    { t: 'db1 does not have nginx', ok: () => !S.hosts.db1.pkgs.has('nginx') },
    { t: 'A repeat run of the playbook reports <code>changed=0</code> with no failures', ok: () => S.runs.some((r, i) => i > 0 && r.changed === 0 && r.failed === 0 && !r.unreachable && r.tasks.some(t => t.mod === 'apt') && r.tasks.some(t => t.mod === 'service')) && ['web1', 'web2'].every(h => S.hosts[h].svcs.nginx?.active) } ] },
{ id: 'an3', mod: 1, title: 'Templates and variables', host: 'control',
  ticket: { id: 'TASK-215', sev: 4, text: '<p>When debugging behind a load balancer, the team can\'t tell which server answered. Each web server\'s home page should show its own host name.</p><p>Each page should also show the environment name, <code>staging</code>, defined once in the playbook as a variable called <code>env_name</code>.</p>' },
  notes: `<p>A <b>template</b> is a file with placeholders that Ansible fills in for each host. Templates use Jinja2: <code>{{ variable_name }}</code>. By convention they end in <code>.j2</code> and live in a <code>templates/</code> folder next to the playbook.</p>
<p>Some variables come for free. <code>inventory_hostname</code> is the host's name as written in your inventory. You can define your own in a play with a <code>vars:</code> map.</p>
<p>The <code>template</code> module takes <code>src</code> (the .j2 file) and <code>dest</code> (where it lands on the server). nginx serves <code>/var/www/html/index.html</code> here.</p>
<p>If a run fails with <b>undefined variable</b>, check the spelling in both places. A typo in a variable name is the most common template bug.</p>`,
  tools: ['mkdir templates', 'nano', 'template', 'vars', 'ansible-playbook', 'curl http://web1'],
  nudges: ['Write the .j2 file first, then a play that renders it onto the web group.', 'curl each web server to see what it serves.'],
  setup() { ansibleLab(() => { mkf(HOME + '/ansible-lab/inventory.ini', GOOD_INV, 'dev'); mkf(HOME + '/ansible-lab/site.yml', '- name: Web servers\n  hosts: web\n  become: true\n  tasks:\n    - name: Install nginx\n      apt:\n        name: nginx\n        state: present\n\n    - name: Run nginx\n      service:\n        name: nginx\n        state: started\n        enabled: true\n', 'dev'); for (const h of ['web1', 'web2']) { S.hosts[h].pkgs.add('nginx'); S.hosts[h].svcs.nginx = { active: true, enabled: true }; } }); },
  objectives: [
    { t: 'A template in <code>templates/</code> uses a variable', ok: () => descendants(HOME + '/ansible-lab/templates').some(k => N(k).t === 'f' && /\{\{\s*\w+/.test(fread(k))) },
    { t: 'The playbook defines <code>env_name: staging</code>', ok: () => kids(HOME + '/ansible-lab').filter(k => /\.ya?ml$/.test(k)).some(k => { try { const d = jsyaml.load(fread(k)); return Array.isArray(d) && d.some(p => p && p.vars && p.vars.env_name === 'staging'); } catch (e) { return false; } }) },
    { t: 'web1 and web2 each serve a page with their own name and "staging"', ok: () => ['web1', 'web2'].every(h => { const pg = S.hosts[h].files['/var/www/html/index.html'] || ''; const other = h === 'web1' ? 'web2' : 'web1'; return pg.includes(h) && !pg.includes(other) && pg.includes('staging'); }) },
    { t: 'You checked both pages with curl', ok: () => ['web1', 'web2'].every(h => (S.flags['curlHost:' + h] || '').includes(h)) } ] },
{ id: 'an4', mod: 1, title: 'Handlers: restart only when needed', host: 'control',
  ticket: { id: 'INC-1302', sev: 3, text: '<p>Customers see brief errors every time the config playbook runs, even when nothing changed. Someone wrote a task that restarts nginx on every run.</p><p>Roll out the new setting <code>worker_connections 2048</code> from <code>files/nginx.conf</code>, and fix the playbook so nginx restarts only when its config actually changes.</p>' },
  notes: `<p>A task that says <code>state: restarted</code> restarts every time. That's a hidden outage on every run.</p>
<p><b>Handlers</b> fix this. A handler is a task in a <code>handlers:</code> list at play level. It only runs if another task <b>notifies</b> it, and only when that task reported <code>changed</code>. It runs once, at the end of the play, however many tasks notified it.</p>
<pre><code>tasks:
  - name: Some task
    some_module: ...
    notify: name of handler
handlers:
  - name: name of handler
    some_module: ...</code></pre>
<p>The <code>notify</code> text must match the handler's <code>name</code> exactly.</p>`,
  tools: ['cat web.yml', 'nano', 'notify', 'handlers', 'ansible-playbook'],
  nudges: ['Change the config file first, then rewrite the playbook. The restart moves out of tasks.', 'Run twice. The first run should show RUNNING HANDLER, the second should show changed=0 and no handler.'],
  setup() { ansibleLab(() => { mkf(HOME + '/ansible-lab/inventory.ini', GOOD_INV, 'dev'); const conf = 'worker_processes auto;\nevents {\n    worker_connections 1024;\n}\nhttp {\n    include /etc/nginx/mime.types;\n    sendfile on;\n    keepalive_timeout 65;\n}\n'; mkf(HOME + '/ansible-lab/files/nginx.conf', conf, 'dev'); mkf(HOME + '/ansible-lab/web.yml', '- name: Configure web servers\n  hosts: web\n  become: true\n  tasks:\n    - name: Push nginx config\n      copy:\n        src: nginx.conf\n        dest: /etc/nginx/nginx.conf\n\n    - name: Restart nginx\n      service:\n        name: nginx\n        state: restarted\n', 'dev'); for (const h of ['web1', 'web2']) { S.hosts[h].pkgs.add('nginx'); S.hosts[h].svcs.nginx = { active: true, enabled: true }; S.hosts[h].files['/etc/nginx/nginx.conf'] = conf; } }); },
  objectives: [
    { t: 'Both web servers run with <code>worker_connections 2048</code>', ok: () => ['web1', 'web2'].every(h => /worker_connections\s+2048;/.test(S.hosts[h].files['/etc/nginx/nginx.conf'] || '') && S.hosts[h].svcs.nginx?.active) },
    { t: 'A run where the config change triggered a restart handler', ok: () => S.runs.some(r => r.handlers.some(hd => hd.hosts.length === 2) && r.tasks.some(t => (t.mod === 'copy' || t.mod === 'template') && t.st === 'changed')) },
    { t: 'A later run with <code>changed=0</code> and no restart', ok: () => { const i = S.runs.findIndex(r => r.handlers.length); return i >= 0 && S.runs.slice(i + 1).some(r => r.changed === 0 && r.failed === 0 && !r.handlers.length && r.tasks.length > 0); } } ] },
{ id: 'an5', mod: 1, title: 'Keeping secrets out of git', host: 'control',
  ticket: { id: 'SEC-233', sev: 3, text: '<p><code>vars/secrets.yml</code> holds the production database password in plain text, and this repo is about to be pushed to GitHub.</p><p>Encrypt it, then run <code>app.yml</code> so <code>db1</code> gets its config file. Expect the first run to teach you something.</p>' },
  notes: `<p><b>Ansible Vault</b> encrypts files that hold secrets, so they can live in git safely. <code>ansible-vault encrypt file</code> encrypts in place. <code>ansible-vault view file</code> shows it decrypted.</p>
<p>A playbook that loads a vaulted file needs the password at run time: add <code>--ask-vault-pass</code> (or point to a password file with <code>--vault-password-file</code>).</p>
<p>Modules don't create missing parent folders. If the destination folder doesn't exist on the server, create it first with the <code>file</code> module (<code>state: directory</code>).</p>
<p>Read Ansible's error messages to the end. They usually say exactly what's missing.</p>`,
  tools: ['ansible-vault', 'ansible-playbook --ask-vault-pass', 'file', 'nano'],
  nudges: ['Encrypt first, then run. If the run complains about the destination, fix the playbook rather than the server.', 'The file module can make sure a directory exists before the template task runs.'],
  setup() { ansibleLab(() => { mkf(HOME + '/ansible-lab/inventory.ini', GOOD_INV, 'dev'); mkf(HOME + '/ansible-lab/vars/secrets.yml', 'db_user: shop\ndb_password: "Tr0ub4dor&3"\n', 'dev'); mkf(HOME + '/ansible-lab/templates/app.env.j2', 'DB_HOST={{ inventory_hostname }}\nDB_USER={{ db_user }}\nDB_PASSWORD={{ db_password }}\n', 'dev'); mkf(HOME + '/ansible-lab/app.yml', '- name: Configure the app on the database server\n  hosts: db\n  become: true\n  vars_files:\n    - vars/secrets.yml\n  tasks:\n    - name: Write app environment file\n      template:\n        src: app.env.j2\n        dest: /etc/shop/app.env\n', 'dev'); S.hosts.db1.pkgs.add('postgresql'); S.hosts.db1.svcs.postgresql = { active: true, enabled: true }; }); },
  objectives: [
    { t: '<code>vars/secrets.yml</code> is vault-encrypted', ok: () => !!N(HOME + '/ansible-lab/vars/secrets.yml')?.vault },
    { t: 'A successful run used the vaulted file', ok: () => S.runs.some(r => r.vault && r.failed === 0 && !r.unreachable) },
    { t: 'db1 has <code>/etc/shop/app.env</code> with the password filled in', ok: () => (S.hosts.db1.files['/etc/shop/app.env'] || '').includes('DB_PASSWORD=Tr0ub4dor&3') } ] },
/* ---------- KUBERNETES ---------- */
{ id: 'k1', mod: 2, title: 'Your first Deployment', host: 'k8s-admin',
  ticket: { id: 'TASK-301', sev: 4, text: '<p>Run the web frontend on the cluster: 3 copies of <code>nginx:1.25</code>, as a Deployment named <code>web</code>, with the label <code>app: web</code> on its pods.</p><p>Then prove the Deployment heals itself when a pod dies.</p>' },
  notes: `<p>A <b>Pod</b> is one or more containers running together. You rarely create pods directly. A <b>Deployment</b> declares how many identical pods you want and keeps that number true, replacing any that die.</p>
<p>A Deployment manifest has three parts that must agree: <code>spec.replicas</code> (how many), <code>spec.selector.matchLabels</code> (which pods it owns), and <code>spec.template</code> (what each pod looks like, including its labels and containers). The selector must match the template's labels.</p>
<pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  name: ...
spec:
  replicas: ...
  selector:
    matchLabels: { key: value }
  template:
    metadata:
      labels: { key: value }
    spec:
      containers:
        - name: ...
          image: ...</code></pre>
<p><code>kubectl apply -f file.yaml</code> creates or updates. <code>kubectl get pods</code> shows status. You can also generate a starting point with <code>kubectl create deployment</code>.</p>`,
  tools: ['nano web.yaml', 'kubectl apply -f', 'kubectl get pods', 'kubectl get deploy', 'kubectl delete pod'],
  nudges: ['If apply rejects the file, the error usually names the exact field.', 'After you delete a pod, list pods again and compare names and ages.'],
  setup() { k8sLab(); },
  objectives: [
    { t: 'Deployment <code>web</code> runs <code>nginx:1.25</code> with pod label <code>app: web</code>', ok: () => { const d = S.k8s.deps.web; return !!d && contImage('web') === 'nginx:1.25' && d.m.spec.template.metadata?.labels?.app === 'web'; } },
    { t: 'All 3 replicas are Running', ok: () => S.k8s.deps.web && S.k8s.deps.web.m.spec.replicas === 3 && allRunning('web') },
    { t: 'You deleted a pod and the Deployment replaced it', ok: () => (S.k8s.flags.deletedOwned || 0) > 0 && S.k8s.deps.web && allRunning('web') } ] },
{ id: 'k2', mod: 2, title: 'Service with no endpoints', host: 'k8s-admin',
  ticket: { id: 'INC-1355', sev: 2, text: '<p>The <code>web</code> pods are all Running, and a <code>web</code> Service exists, yet <code>curl http://web</code> fails from inside the cluster.</p><p>Find out why the Service doesn\'t reach the pods and fix it. The manifest is in <code>web-svc.yaml</code>.</p>' },
  notes: `<p>A <b>Service</b> gives a stable name and IP to a changing set of pods. It finds its pods with a <b>selector</b>: every Running pod whose labels match it becomes an <b>endpoint</b>. Traffic to the Service <code>port</code> is forwarded to each pod's <code>targetPort</code>.</p>
<p>Two classic mistakes: a selector that doesn't match the pod labels (the Service has zero endpoints), and a <code>targetPort</code> that isn't where the container listens (endpoints exist, but connections are refused).</p>
<p><code>kubectl get endpoints NAME</code> and <code>kubectl describe svc NAME</code> show both. <code>kubectl get pods --show-labels</code> isn't supported here, but <code>kubectl describe pod</code> lists labels and ports.</p>
<p>This terminal sits inside the cluster network, so <code>curl http://SERVICE_NAME</code> works directly.</p>`,
  tools: ['kubectl get endpoints', 'kubectl describe svc', 'kubectl describe pod', 'nano', 'kubectl apply -f', 'curl http://web'],
  nudges: ['Compare what the Service selects with the labels the pods actually carry.', 'Once endpoints appear, check which port nginx listens on inside the pod.'],
  setup() { k8sLab(() => { seedDep(dep('web', 'nginx:1.25', 3, { c: { ports: [{ containerPort: 80 }] }, cname: 'nginx' }), 40); const svc = 'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    app: webapp\n  ports:\n    - port: 80\n      targetPort: 8080\n'; mkf(HOME + '/k8s-lab/web-svc.yaml', svc, 'dev'); applyDoc(jsyaml.load(svc), 'web-svc.yaml'); S.k8s.svcs.web.created = Date.now() - 38 * 60e3; }); },
  objectives: [
    { t: 'The <code>web</code> Service has endpoints', ok: () => S.k8s.svcs.web && endpoints(S.k8s.svcs.web).length === 3 },
    { t: 'It forwards to the port nginx listens on', ok: () => { const s = S.k8s.svcs.web; if (!s) return false; const p = S.k8s.pods.find(x => x.owner === 'web'); return !!p && resolveTargetPort(p, s.m.spec.ports[0].targetPort) === 80; } },
    { t: '<code>curl http://web</code> returns the nginx page', ok: () => !!S.k8s.flags['curl:web'] && S.k8s.svcs.web && endpoints(S.k8s.svcs.web).length > 0 } ] },
{ id: 'k3', mod: 2, title: 'ImagePullBackOff', host: 'k8s-admin',
  ticket: { id: 'INC-1361', sev: 3, text: '<p>A teammate shipped a new version of the <code>shop</code> frontend and went to lunch. Its pods never become ready.</p><p>Get <code>shop</code> running again on the nginx 1.25 line they meant to deploy.</p>' },
  notes: `<p>Pod status tells you which phase broke:</p>
<ul><li><b>Pending</b>: not scheduled on a node yet.</li><li><b>ErrImagePull / ImagePullBackOff</b>: the node can't download the image. Usually a typo in the name or tag, a private registry, or a tag that was never pushed.</li><li><b>CrashLoopBackOff</b>: the container starts, then exits.</li></ul>
<p>The <b>Events</b> at the bottom of <code>kubectl describe pod</code> give the exact reason. Read them before changing anything.</p>
<p>Two ways to change a Deployment: edit its YAML and <code>apply</code> it, or use <code>kubectl set image deployment/NAME CONTAINER=IMAGE</code>. Either one rolls out new pods.</p>`,
  tools: ['kubectl get pods', 'kubectl describe pod', 'kubectl set image', 'kubectl get deploy -o yaml'],
  nudges: ['Read the image name in the Events character by character.', 'set image needs the container name, which describe shows under Containers.'],
  setup() { k8sLab(() => { seedDep(dep('shop', 'nginx:1.255', 2, { cname: 'frontend', c: { ports: [{ containerPort: 80 }] } }), 22); mkf(HOME + '/k8s-lab/shop.yaml', jsyaml.dump(dep('shop', 'nginx:1.255', 2, { cname: 'frontend', c: { ports: [{ containerPort: 80 }] } })), 'dev'); }); },
  objectives: [
    { t: '<code>shop</code> uses a valid nginx 1.25 image', ok: () => /^nginx:1\.25(-alpine)?$/.test(contImage('shop') || '') },
    { t: 'Both <code>shop</code> pods are Running', ok: () => S.k8s.deps.shop && S.k8s.deps.shop.m.spec.replicas === 2 && allRunning('shop') } ] },
{ id: 'k4', mod: 2, title: 'CrashLoopBackOff and ConfigMaps', host: 'k8s-admin',
  ticket: { id: 'INC-1370', sev: 2, text: '<p>The <code>api</code> pods keep restarting. Nobody touched the image.</p><p>The DBA confirms the database lives at <code>db.internal</code>. Fix the API the proper way: configuration goes in a ConfigMap named <code>api-config</code>, not hardcoded in the Deployment.</p>' },
  notes: `<p><b>CrashLoopBackOff</b> means the container starts, then exits, and Kubernetes keeps retrying with growing delays. The cause is in the app's own output: <code>kubectl logs POD</code>. Add <code>--previous</code> to see the run that just crashed.</p>
<p>A <b>ConfigMap</b> stores non-secret settings as key/value pairs, separate from the image. Create one with YAML or with <code>kubectl create configmap NAME --from-literal=KEY=value</code>.</p>
<p>A container reads it as environment variables, either one key at a time:</p>
<pre><code>env:
  - name: SOME_VAR
    valueFrom:
      configMapKeyRef: { name: ..., key: ... }</code></pre>
<p>or all keys at once with <code>envFrom: [ { configMapRef: { name: ... } } ]</code>. Export the Deployment to a file, edit it, and apply it.</p>`,
  tools: ['kubectl logs', 'kubectl create configmap', 'kubectl get deploy api -o yaml > api.yaml', 'nano', 'kubectl apply -f'],
  nudges: ['The logs name the missing setting exactly.', 'Create the ConfigMap first, then point the container at it. Pods referencing a missing ConfigMap won\'t start at all.'],
  setup() { k8sLab(() => { seedDep(dep('api', 'shopco/api:2.1', 2, { c: { ports: [{ containerPort: 3000 }] } }), 18); }); },
  objectives: [
    { t: 'ConfigMap <code>api-config</code> has <code>DB_HOST=db.internal</code>', ok: () => S.k8s.cms['api-config']?.m.data?.DB_HOST === 'db.internal' },
    { t: 'The api reads <code>DB_HOST</code> from that ConfigMap', ok: () => { const c = S.k8s.deps.api?.m.spec.template.spec.containers[0]; if (!c) return false; return (c.env || []).some(e => e.name === 'DB_HOST' && e.valueFrom?.configMapKeyRef?.name === 'api-config') || (c.envFrom || []).some(e => e.configMapRef?.name === 'api-config') && !(c.env || []).some(e => e.name === 'DB_HOST' && e.value !== undefined); } },
    { t: 'All <code>api</code> pods are Running', ok: () => S.k8s.deps.api && allRunning('api') } ] },
{ id: 'k5', mod: 2, title: 'Stuck in Pending', host: 'k8s-admin',
  ticket: { id: 'INC-1374', sev: 3, text: '<p>The new <code>analytics</code> worker has been Pending for 20 minutes. The cluster has one node with 2 CPUs and 4 GiB of memory.</p><p>The team says the worker needs about 512 MiB. Get it scheduled, and keep a memory request on it so the scheduler still knows what it needs.</p>' },
  notes: `<p><b>Pending</b> means the scheduler hasn't found a node for the pod. <code>kubectl describe pod</code> shows a <code>FailedScheduling</code> event explaining why. Common reasons: not enough CPU or memory, or a node selector that matches nothing.</p>
<p><b>Requests</b> are what the scheduler reserves for a container. A pod only lands on a node with that much free. <b>Limits</b> cap what it may use at run time.</p>
<p>Memory units: <code>Mi</code> and <code>Gi</code> are powers of 1024. <code>512Mi</code> is half a gibibyte. A missing letter (<code>G</code> versus <code>Gi</code>, or <code>Gi</code> where <code>Mi</code> was meant) is a common typo.</p>
<p><code>kubectl describe node</code> shows capacity and what's already reserved.</p>`,
  tools: ['kubectl describe pod', 'kubectl describe node', 'kubectl get deploy -o yaml', 'kubectl set resources', 'kubectl apply -f'],
  nodes: null,
  nudges: ['Compare the request in the pod spec with the node\'s capacity.', 'kubectl set resources deployment/NAME --requests=memory=... works, or edit the YAML.'],
  setup() { k8sLab(() => { seedDep(dep('analytics', 'shopco/analytics:3.0', 1, { cname: 'worker', c: { resources: { requests: { cpu: '250m', memory: '512Gi' } } } }), 21); }); },
  objectives: [
    { t: 'The <code>analytics</code> pod is Running', ok: () => S.k8s.deps.analytics && allRunning('analytics') },
    { t: 'It still requests memory, between 256Mi and 1Gi', ok: () => { const m = parseMem(S.k8s.deps.analytics?.m.spec.template.spec.containers[0].resources?.requests?.memory); return m >= 256 * 1048576 && m <= 1073741824; } } ] },
{ id: 'k6', mod: 2, title: 'Bad release: roll back', host: 'k8s-admin',
  ticket: { id: 'INC-1390', sev: 1, text: '<p>Release <code>site 1.1</code> went out 6 minutes ago and every <code>site</code> pod is crashing. The site is down.</p><p>Restore service first, debug later: get back to the last working version, then scale to 4 replicas for the evening traffic peak.</p>' },
  notes: `<p>During an outage the first job is to <b>restore service</b>, not to find the bug. If a release broke things, rolling back is usually the fastest fix.</p>
<p>Every change to a Deployment's pod template creates a <b>revision</b>. <code>kubectl rollout history deployment/NAME</code> lists them, and <code>--revision=N</code> shows what one contained. <code>kubectl rollout undo deployment/NAME</code> goes back one revision, or to a chosen one with <code>--to-revision=N</code>.</p>
<p><code>kubectl rollout status</code> tells you when a rollout has finished. <code>kubectl scale deployment NAME --replicas=N</code> changes the count without touching the template.</p>
<p>Check the logs of the broken version too: the crash message goes in the incident notes.</p>`,
  tools: ['kubectl get pods', 'kubectl logs', 'kubectl rollout history', 'kubectl rollout undo', 'kubectl rollout status', 'kubectl scale'],
  nudges: ['History first: know which revision you\'re going back to.', 'Rollback and scaling are two separate commands.'],
  setup() { k8sLab(() => { const v1 = dep('site', 'shopco/site:1.0', 2, { c: { ports: [{ containerPort: 8080 }] } }); const v2 = dep('site', 'shopco/site:1.1', 2, { c: { ports: [{ containerPort: 8080 }] } }); seedDep(v2, 6, [{ rev: 1, tmpl: JSON.parse(JSON.stringify(v1.spec.template)), cause: 'kubectl apply --filename=site.yaml' }, { rev: 2, tmpl: JSON.parse(JSON.stringify(v2.spec.template)), cause: 'kubectl set image deployment/site site=shopco/site:1.1' }]); kEvent('Normal', 'ScalingReplicaSet', 'deployment/site', 'Scaled up replica set site to 2'); }); },
  objectives: [
    { t: '<code>site</code> is back on <code>shopco/site:1.0</code> via a rollout', ok: () => contImage('site') === 'shopco/site:1.0' && S.k8s.flags.undone?.has('site') },
    { t: '4 replicas, all Running', ok: () => S.k8s.deps.site?.m.spec.replicas === 4 && allRunning('site') },
    { t: 'You read the crash logs of the broken version', ok: () => S.k8s.flags.logsRead?.has('site') } ] },
/* ---------- MONITORING ---------- */
{ id: 'm1', mod: 3, title: 'Ask the metrics', host: 'monitor',
  ticket: { id: 'TASK-401', sev: 4, text: '<p>Before you build dashboards and alerts, you need queries you trust. Write three PromQL queries, each in its own file under <code>~/monitoring/queries/</code>:</p><p><code>cpu.promql</code>: CPU busy percent per server. <code>error_ratio.promql</code>: share of 5xx responses per service. <code>disk_free.promql</code>: free space on <code>/</code> as a percent, per server.</p>' },
  notes: `<p>Prometheus stores <b>time series</b>: a metric name plus labels, sampled every few seconds. <code>prom metrics</code> lists what exists here and <code>prom series NAME</code> shows every label combination.</p>
<p><b>Counters</b> only go up (requests served, CPU seconds used). The raw number is useless; you want its speed: <code>rate(counter[5m])</code> is the per-second increase over 5 minutes. <b>Gauges</b> go up and down (free bytes) and are used as they are.</p>
<p><b>Aggregation</b> collapses series: <code>sum by (service) (...)</code> adds everything up but keeps one series per service. Dividing two vectors works when both sides have the same labels, so aggregate both sides the same way first.</p>
<p>Filter with matchers inside braces: <code>{mode="idle"}</code>, <code>{status=~"5.."}</code> (regex). CPU busy is usually measured as <i>100 minus the idle percentage</i>, averaged over the CPUs of each server.</p>
<p>Try queries with <code>promql '...'</code> until the numbers look right, then save them. <code>promql queries/cpu.promql</code> runs a saved file.</p>`,
  tools: ['prom metrics', 'prom series', "promql '...'", 'rate()', 'sum by ()', 'avg by ()', 'nano'],
  nudges: ['Build each query in small steps: first the selector, then rate, then aggregation, then the math.', 'For the error ratio: 5xx requests per second divided by all requests per second, both summed by service.'],
  setup() { monLab('monitor', () => { mkd(HOME + '/monitoring/queries', 'dev'); monitoring({ err: { checkout: 0.031, catalog: 0.006, auth: 0.012 } }); S.cwd = HOME + '/monitoring'; }); },
  objectives: [
    { t: '<code>queries/cpu.promql</code> gives CPU busy % per instance', ok: () => { const q = fread(HOME + '/monitoring/queries/cpu.promql'); return !!q && matchesTruth(q.trim(), 'cpu'); } },
    { t: '<code>queries/error_ratio.promql</code> gives the 5xx share per service', ok: () => { const q = fread(HOME + '/monitoring/queries/error_ratio.promql'); return !!q && matchesTruth(q.trim(), 'err'); } },
    { t: '<code>queries/disk_free.promql</code> gives free % of <code>/</code> per instance', ok: () => { const q = fread(HOME + '/monitoring/queries/disk_free.promql'); return !!q && matchesTruth(q.trim(), 'disk'); } } ] },
{ id: 'm2', mod: 3, title: 'Build a service dashboard', host: 'monitor',
  ticket: { id: 'TASK-408', sev: 4, text: '<p>On-call engineers want one screen that answers "is the shop healthy?" in five seconds.</p><p>Build a dashboard in <code>~/monitoring/dashboards/</code> with at least these: traffic per service over time, error ratio per service, CPU per server, and free disk per server as a stat or gauge. Save it with <code>dash apply</code> and open it.</p>' },
  notes: `<p>A good dashboard reads top to bottom like a diagnosis. Many teams follow the <b>RED</b> method for services (<b>R</b>ate, <b>E</b>rrors, <b>D</b>uration) and <b>USE</b> for machines (<b>U</b>tilization, <b>S</b>aturation, <b>E</b>rrors).</p>
<p>Choose the panel type by question. <b>timeseries</b>: how has it changed? <b>stat</b>: what is it right now? <b>gauge</b>: how close is it to a limit? Thresholds turn a number into a colour, so give the stat and gauge panels sensible ones.</p>
<p>Dashboards here are YAML. <code>man dash</code> shows the format. Reuse the queries you wrote in the previous lesson; a dashboard is only as good as its queries.</p>
<p>Keep panels focused: a panel with 30 lines answers nothing. Aggregate to the level someone will act on.</p>`,
  tools: ['man dash', 'nano', 'dash apply', 'dash open', "promql '...'"],
  nudges: ['Start with one panel, apply, open it, then add the rest.', 'Traffic per service is a rate of the request counter, summed by service.'],
  setup() { monLab('monitor', () => { mkd(HOME + '/monitoring/dashboards', 'dev'); monitoring({ err: { checkout: 0.024, catalog: 0.005, auth: 0.009 } }); S.cwd = HOME + '/monitoring'; mkf(HOME + '/monitoring/queries/cpu.promql', '100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100\n', 'dev'); }); },
  objectives: [
    { t: 'A dashboard with at least 4 panels is saved', ok: () => Object.values(S.mon.dashboards).some(d => d.def.panels.length >= 4) },
    { t: 'A timeseries panel shows requests per second per service', ok: () => Object.values(S.mon.dashboards).some(d => d.def.panels.some(p => p.type === 'timeseries' && matchesTruth(String(p.query), 'rps'))) },
    { t: 'A panel shows the error ratio per service', ok: () => Object.values(S.mon.dashboards).some(d => d.def.panels.some(p => matchesTruth(String(p.query), 'err'))) },
    { t: 'A panel shows CPU busy % per server', ok: () => Object.values(S.mon.dashboards).some(d => d.def.panels.some(p => matchesTruth(String(p.query), 'cpu'))) },
    { t: 'A stat or gauge panel with thresholds shows free disk per server', ok: () => Object.values(S.mon.dashboards).some(d => d.def.panels.some(p => (p.type === 'stat' || p.type === 'gauge') && Array.isArray(p.thresholds) && p.thresholds.length && matchesTruth(String(p.query), 'disk'))) },
    { t: 'You opened the dashboard', ok: () => !!S.flags.dashOpened } ] },
{ id: 'm3', mod: 3, title: 'Alert on symptoms', host: 'monitor',
  ticket: { id: 'TASK-415', sev: 3, text: '<p>Nobody should have to stare at dashboards. Write alert rules in <code>~/monitoring/rules/alerts.yml</code>:</p><p><code>HighErrorRate</code> when a service returns more than 5% errors for 5 minutes. <code>DiskAlmostFull</code> when <code>/</code> has less than 15% free for 10 minutes. Give each a <code>severity</code> label and a <code>summary</code>. Check them, load them, and see what fires.</p>' },
  notes: `<p>An alert rule is a PromQL expression with a <b>threshold</b> built in. Every series the expression returns is an active alert. <code>for:</code> says how long it must stay true before it fires, which filters out short blips.</p>
<pre><code>groups:
  - name: some-group
    rules:
      - alert: AlertName
        expr: &lt;query&gt; &gt; &lt;threshold&gt;
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.service }} ..."</code></pre>
<p>Alert on <b>symptoms</b> users feel (errors, latency, a disk about to fill), not on every cause. Use <code>severity</code> to route: critical pages someone, warning goes to a channel.</p>
<p>Always validate before loading: <code>promtool check rules FILE</code>. Then <code>prom reload</code> and <code>prom alerts</code>. A rule that fires for the wrong things is as bad as one that never fires.</p>`,
  tools: ['nano', 'promtool check rules', 'prom reload', 'prom alerts', "promql '...'", 'cat prometheus.yml'],
  nudges: ['Reuse your error ratio and disk queries, then add the comparison at the end.', 'Expected: HighErrorRate for one service, DiskAlmostFull for one server. If more fire, check your threshold and units.'],
  setup() { monLab('monitor', () => { mkd(HOME + '/monitoring/rules', 'dev'); monitoring({ err: { checkout: 0.071, catalog: 0.006, auth: 0.011 }, nodes: { 'db1:9100': { disk: 0.087 } } }); S.cwd = HOME + '/monitoring'; }); },
  objectives: [
    { t: 'Rules pass <code>promtool</code> and are loaded', ok: () => S.mon.rulesLoaded && S.mon.rules.length >= 2 },
    { t: '<code>HighErrorRate</code> matches checkout only, with <code>for</code> of at least 1m', ok: () => { const r = S.mon.rules.find(x => x.alert === 'HighErrorRate'); if (!r || !r.for || durSec(String(r.for)) < 60) return false; try { const v = pq(r.expr); return v.type === 'vector' && v.s.length === 1 && v.s[0].l.service === 'checkout'; } catch (e) { return false; } } },
    { t: '<code>DiskAlmostFull</code> matches db1 only', ok: () => { const r = S.mon.rules.find(x => x.alert === 'DiskAlmostFull'); if (!r || !r.for) return false; try { const v = pq(r.expr); return v.type === 'vector' && v.s.length >= 1 && v.s.every(x => x.l.instance === 'db1:9100'); } catch (e) { return false; } } },
    { t: 'Each rule has a <code>severity</code> label and a <code>summary</code>', ok: () => S.mon.rules.length >= 2 && S.mon.rules.every(r => r.labels?.severity && r.annotations?.summary) } ] },
{ id: 'm4', mod: 3, title: 'You are on call', host: 'monitor',
  ticket: { id: 'INC-2207', sev: 2, text: '<p><b>PAGE:</b> <code>HighErrorRate</code> firing for <code>service="checkout"</code>. Customers report failed payments.</p><p>Run the incident: acknowledge it and take command, set the severity by the policy in <code>~/runbooks/severity.md</code>, find what changed and mitigate, post an update, and resolve once the numbers prove recovery. The lab clock runs 10x, so recovery shows within a minute.</p>' },
  notes: `<p>Incident response is a loop: <b>acknowledge</b> (so escalation stops and people know someone is on it), <b>assess</b> impact and set severity, <b>mitigate</b> (stop the bleeding), <b>communicate</b>, then <b>resolve</b> when the data says so.</p>
<p>Severity is decided by <b>impact</b>, not by how scary it feels. Check the numbers against the written policy. Your team's runbooks are in <code>~/runbooks</code>.</p>
<p>The first question for any sudden change: <b>what changed?</b> Deploys cause most incidents. <code>kubectl rollout history</code> and pod logs answer it fast. Prefer the quickest safe mitigation (often a rollback) over a fix-forward under pressure.</p>
<p>Status updates should say what you know, what you're doing, and when the next update is. <code>incident note ID "..."</code> adds one to the timeline. Don't resolve on hope: confirm with the same metric that paged you.</p>`,
  tools: ['incident', 'cat runbooks/*.md', "promql '...'", 'kubectl rollout history', 'kubectl logs', 'kubectl rollout undo'],
  nudges: ['Order: ack, assign yourself, measure the error ratio, set severity, then go looking for the change.', 'The 5-minute rate takes a short while to fall after you fix things. Re-run your query until it is under 1%, then resolve.'],
  setup() { monLab('monitor', () => {
      monitoring(); cluster(); S.cwd = HOME;
      const good = dep('checkout', 'shopco/checkout:3.1', 2, { c: { ports: [{ containerPort: 8080 }], env: [{ name: 'PAYMENT_TIMEOUT_MS', value: '2000' }] } }); const bad = dep('checkout', 'shopco/checkout:3.2', 2, { c: { ports: [{ containerPort: 8080 }], env: [{ name: 'PAYMENT_TIMEOUT_MS', value: '200' }] } });
      seedDep(bad, 14, [{ rev: 4, tmpl: JSON.parse(JSON.stringify(good.spec.template)), cause: 'release 3.1 (pipeline #881)' }, { rev: 5, tmpl: JSON.parse(JSON.stringify(bad.spec.template)), cause: 'release 3.2 (pipeline #902)' }]);
      seedDep(dep('catalog', 'nginx:1.27', 2), 3000); seedDep(dep('auth', 'shopco/api:2.1', 2, { c: { env: [{ name: 'DB_HOST', value: 'db.internal' }] } }), 3000);
      reconcile();
      const t0 = S.mon.t0; S.mon.err.checkout.push({ t: t0 - 14 * 60, s: 0.118 });
      mkf(HOME + '/runbooks/severity.md', '# Severity policy\n\nSEV1  Site down or payments failing for (nearly) all customers. Page leadership.\nSEV2  A customer-facing feature degraded: error ratio above 5% on a user path,\n      or major slowness. Incident commander + status page update.\nSEV3  Minor or internal impact: error ratio below 5%, no customer reports.\n\nMeasure before you decide. Raise or lower severity as you learn more.\n', 'dev');
      mkf(HOME + '/runbooks/checkout.md', '# checkout runbook\n\nService: checkout (Kubernetes deployment "checkout", 2 replicas)\nCalls: payment provider over HTTPS\n\nFirst checks\n1. Error ratio per service (5m) in Prometheus.\n2. Did anything ship recently? kubectl rollout history deployment/checkout\n3. What do the pods say? kubectl logs deploy/checkout\n\nMitigation\n- A bad release: roll back first, investigate after.\n- Payment provider down: enable "pay later" banner (ask #payments).\n', 'dev');
      mkf(HOME + '/monitoring/rules/alerts.yml', 'groups:\n  - name: shop\n    rules:\n      - alert: HighErrorRate\n        expr: sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m])) > 0.05\n        for: 5m\n        labels:\n          severity: critical\n        annotations:\n          summary: "{{ $labels.service }} error ratio above 5%"\n', 'dev'); S.mon.rules = loadRules().rules; S.mon.rulesLoaded = true;
      S.mon.incidents['INC-2207'] = { id: 'INC-2207', title: 'HighErrorRate: checkout returning 5xx', alert: 'HighErrorRate{service="checkout", severity="critical"}', status: 'triggered', sev: null, owner: null, opened: t0 - 9 * 60, notes: 0, timeline: [{ t: t0 - 14 * 60, who: 'pipeline', text: 'Deployed checkout 3.2 (pipeline #902)' }, { t: t0 - 9 * 60, who: 'alertmgr', text: 'HighErrorRate firing for service="checkout" (value 0.118)' }, { t: t0 - 9 * 60, who: 'pager', text: 'Paged on-call: dev' }, { t: t0 - 4 * 60, who: 'pager', text: 'Escalation in 5 minutes if not acknowledged' }] };
    }); },
  intro: () => A.red('━━ PAGE ━━ ') + A.bold('INC-2207  HighErrorRate firing: service="checkout"  (critical)') + '\n' + A.dim('Opened 9 min ago · not acknowledged · run "incident list"'),
  objectives: [
    { t: 'INC-2207 acknowledged, and you are the commander', ok: () => { const i = S.mon.incidents['INC-2207']; return i.status !== 'triggered' && i.owner === 'dev'; } },
    { t: 'Severity set according to the policy', ok: () => S.mon.incidents['INC-2207'].sev === 'SEV2' },
    { t: 'checkout rolled back and its 5m error ratio is under 1%', ok: () => contImage('checkout') === 'shopco/checkout:3.1' && allRunning('checkout') && truthErr('checkout') < 0.01 },
    { t: 'An update was posted, then the incident resolved after recovery', ok: () => { const i = S.mon.incidents['INC-2207']; return i.status === 'resolved' && i.notes >= 1 && i.resolvedRatio !== undefined && i.resolvedRatio < 0.01; } } ] },
{ id: 'm5', mod: 3, title: 'Write the postmortem', host: 'monitor',
  ticket: { id: 'INC-2207', sev: 4, text: '<p>Checkout is healthy again. Now write the blameless postmortem in <code>~/postmortems/INC-2207.md</code> so it doesn\'t happen twice.</p><p>Your notes from the incident are in <code>incident show INC-2207</code>, and the release diff summary is in <code>~/notes/release-3.2.txt</code>.</p>' },
  notes: `<p>A <b>postmortem</b> turns an incident into lessons. <b>Blameless</b> means you describe what the system allowed to happen, not who made a mistake. People act on what they know at the time; the fix is in the process and tooling.</p>
<p>A common structure, one <code>##</code> heading each:</p>
<ul><li><b>Summary</b>: two or three sentences anyone can read.</li><li><b>Impact</b>: who was affected, how badly (numbers, e.g. a percentage), and for how long (minutes).</li><li><b>Timeline</b>: times and events, from the change to the resolution.</li><li><b>Root cause</b>: the technical chain of why, as specific as you can.</li><li><b>Action items</b>: concrete tasks with an owner, as checkboxes (<code>- [ ] ...</code>).</li></ul>
<p>Good action items prevent the whole class of problem: a test, a guard rail, an alert, not "be more careful".</p>`,
  tools: ['incident show INC-2207', 'cat notes/release-3.2.txt', 'nano', 'mkdir'],
  nudges: ['Copy the times from the incident timeline into your Timeline section.', 'Root cause should name the release and the setting that changed in it.'],
  setup() { monLab('monitor', () => { monitoring(); S.cwd = HOME; const t0 = S.mon.t0;
      S.mon.incidents['INC-2207'] = { id: 'INC-2207', title: 'HighErrorRate: checkout returning 5xx', alert: 'HighErrorRate{service="checkout", severity="critical"}', status: 'resolved', sev: 'SEV2', owner: 'dev', opened: t0 - 70 * 60, notes: 2, timeline: [
        { t: t0 - 75 * 60, who: 'pipeline', text: 'Deployed checkout 3.2 (pipeline #902)' }, { t: t0 - 70 * 60, who: 'alertmgr', text: 'HighErrorRate firing for service="checkout" (value 0.118)' }, { t: t0 - 70 * 60, who: 'pager', text: 'Paged on-call: dev' }, { t: t0 - 62 * 60, who: 'dev', text: 'Acknowledged the page' }, { t: t0 - 61 * 60, who: 'dev', text: 'Severity set to SEV2' }, { t: t0 - 58 * 60, who: 'dev', text: 'checkout 3.2 logs show payment calls timing out after 200ms; rolling back to 3.1' }, { t: t0 - 57 * 60, who: 'dev', text: 'Rolled back deployment/checkout to revision 4 (3.1)' }, { t: t0 - 51 * 60, who: 'dev', text: 'Error ratio back to 0.4%. Monitoring.' }, { t: t0 - 45 * 60, who: 'dev', text: 'Status changed to resolved' }] };
      mkf(HOME + '/notes/release-3.2.txt', 'checkout 3.2 release notes (pipeline #902)\n- new payment client library v5\n- PAYMENT_TIMEOUT_MS default changed from 2000 to 200 (was meant for the fraud-check call, applied to all payment calls)\n- tests: unit tests passed; load test skipped (staging env down)\n\nPayment provider p95 latency is ~180ms, p99 ~450ms.\n', 'dev'); }); },
  objectives: [
    { t: 'The file has Summary, Impact, Timeline, Root cause and Action items sections', ok: () => { const c = fread(HOME + '/postmortems/INC-2207.md') || ''; return ['summary', 'impact', 'timeline', 'root cause', 'action items'].every(h => new RegExp('^#{1,3}\\s*' + h + '\\b', 'im').test(c)); } },
    { t: 'Impact gives a percentage and a duration in minutes', ok: () => { const s = pmSection('impact'); return /\d+(\.\d+)?\s?%/.test(s) && /\d+\s?(min|minute)/i.test(s); } },
    { t: 'Root cause names release 3.2 and the timeout change', ok: () => { const s = pmSection('root cause'); return /3\.2/.test(s) && /timeout/i.test(s); } },
    { t: 'At least 3 action items as checkboxes', ok: () => (pmSection('action items').match(/^\s*[-*]\s+\[ \]\s+\S/gm) || []).length >= 3 },
    { t: 'Blameless: no blame words (fault, blame, careless, stupid)', ok: () => { const c = fread(HOME + '/postmortems/INC-2207.md'); return !!c && c.length > 200 && !/\b(fault|blame|blamed|careless|stupid|idiot|incompetent)\b/i.test(c); } } ] },
];
function pmSection(name) { const c = fread(HOME + '/postmortems/INC-2207.md') || ''; const re = new RegExp('^#{1,3}\\s*' + name + '\\b[^\\n]*\\n([\\s\\S]*?)(?=^#{1,3}\\s|$(?![\\s\\S]))', 'im'); const m = re.exec(c); return m ? m[1] : ''; }
