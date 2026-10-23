// End-to-end tests: every lab is solved in a headless browser and must clear.
//
// SPOILER WARNING: the SOL table below contains working solutions for every lab.
// If you are learning with Root Access, solve the labs yourself first.
//
// Run: npm install && npx playwright install chromium && npm test
// Single lab: npm test -- lx3
import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'index.html')).href;
const only = process.argv[2];

const SOL = {
  lx1: [['c', 'find /srv -name "app.conf"'], ['c', 'mkdir ~/backup'], ['c', 'cp /srv/apps/billing/config/app.conf ~/backup/'], ['c', 'grep db_port /srv/apps/billing/config/app.conf > ~/answer.txt']],
  lx2: [['c', 'chown deploy /opt/deploy/deploy.sh'], ['c', 'sudo groupadd ops'], ['c', 'sudo useradd -m deploy'], ['c', 'sudo usermod -aG ops deploy'], ['c', 'sudo chown deploy:ops /opt/deploy/deploy.sh'], ['c', 'sudo chmod 740 /opt/deploy/deploy.sh'], ['c', 'ls -l /opt/deploy']],
  lx3: [['c', 'systemctl status nginx'], ['c', 'journalctl -u nginx'], ['c', 'sudo nginx -t'], ['edit', 'sudo nano /etc/nginx/nginx.conf', s => s.replace('listn 80', 'listen 80')], ['c', 'nginx -t'], ['edit', 'sudo nano /etc/nginx/nginx.conf', s => s.replace('index index.html\n', 'index index.html;\n')], ['c', 'nginx -t'], ['c', 'sudo systemctl enable --now nginx'], ['c', 'curl localhost']],
  lx4: [['c', 'sudo systemctl start myapp'], ['c', 'ss -tulpn'], ['c', 'sudo ss -tulpn'], ['c', 'ps aux | grep http'], ['c', 'sudo pkill -f http.server'], ['c', 'sudo systemctl start myapp'], ['c', 'curl localhost:8080']],
  lx5: [['c', 'df -h'], ['c', 'sudo du -sh /var/*'], ['c', 'find /var -size +1G'], ['c', 'sudo rm /var/log/app/debug.log'], ['edit', 'sudo nano /etc/app/app.conf', s => s.replace('log_level = debug', 'log_level = info')], ['c', 'df -h']],
  lx6: [['edit', 'nano health.sh', () => '#!/bin/bash\necho "Report $(date)" > /home/dev/report.txt\ndf -h >> /home/dev/report.txt\nsystemctl status nginx >> /home/dev/report.txt\n'], ['c', 'chmod +x health.sh'], ['c', './health.sh'], ['c', 'cat report.txt'], ['edit', 'crontab -e', s => s + '*/5 * * * * /home/dev/health.sh\n'], ['c', 'crontab -l']],
  an1: [['edit', 'nano inventory.ini', () => '[web]\nweb1\nweb2\n\n[db]\ndb1\n'], ['c', 'ansible-inventory --graph'], ['c', 'ansible all -m ping'], ['c', 'ansible web -m ping']],
  an2: [['edit', 'nano site.yml', () => '- name: Web\n  hosts: web\n  tasks:\n    - name: Install nginx\n      apt:\n        name: nginx\n        state: present\n'], ['c', 'ansible-playbook site.yml'], ['edit', 'nano site.yml', () => '- name: Web\n  hosts: web\n  become: true\n  tasks:\n    - name: Install nginx\n      apt:\n        name: nginx\n        state: present\n    - name: Run nginx\n      service:\n        name: nginx\n        state: started\n        enabled: true\n'], ['c', 'ansible-playbook site.yml'], ['c', 'ansible-playbook site.yml'], ['c', 'curl http://web1']],
  an3: [['c', 'mkdir templates'], ['edit', 'nano templates/index.html.j2', () => '<h1>Served by {{ inventory_hostname }}</h1>\n<p>env: {{ env_name }}</p>\n'], ['edit', 'nano site.yml', s => s.replace('  become: true\n', '  become: true\n  vars:\n    env_name: staging\n') + '\n    - name: Home page\n      template:\n        src: index.html.j2\n        dest: /var/www/html/index.html\n'], ['c', 'ansible-playbook site.yml'], ['c', 'curl http://web1'], ['c', 'curl http://web2']],
  an4: [['c', 'cat web.yml'], ['edit', 'nano files/nginx.conf', s => s.replace('1024', '2048')], ['edit', 'nano web.yml', () => '- name: Configure web servers\n  hosts: web\n  become: true\n  tasks:\n    - name: Push nginx config\n      copy:\n        src: nginx.conf\n        dest: /etc/nginx/nginx.conf\n      notify: restart nginx\n  handlers:\n    - name: restart nginx\n      service:\n        name: nginx\n        state: restarted\n'], ['c', 'ansible-playbook web.yml'], ['c', 'ansible-playbook web.yml']],
  an5: [['c', 'ansible-vault encrypt vars/secrets.yml'], ['c', 'ansible-playbook app.yml'], ['c', 'ansible-playbook app.yml --ask-vault-pass'], ['edit', 'nano app.yml', s => s.replace('  tasks:\n', '  tasks:\n    - name: Config dir\n      file:\n        path: /etc/shop\n        state: directory\n')], ['c', 'ansible-playbook app.yml --ask-vault-pass']],
  k1: [['edit', 'nano web.yaml', () => 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: nginx\n          image: nginx:1.25\n          ports:\n            - containerPort: 80\n'], ['c', 'kubectl apply -f web.yaml'], ['c', 'kubectl get pods'], ['js', `CMDS.kubectl.run(['delete','pod',S.k8s.pods[0].name])`], ['c', 'kubectl get pods']],
  k2: [['c', 'curl http://web'], ['c', 'kubectl get endpoints web'], ['c', 'kubectl describe svc web'], ['edit', 'nano web-svc.yaml', s => s.replace('app: webapp', 'app: web').replace('targetPort: 8080', 'targetPort: 80')], ['c', 'kubectl apply -f web-svc.yaml'], ['c', 'kubectl get endpoints'], ['c', 'curl http://web']],
  k3: [['c', 'kubectl get pods'], ['js', `CMDS.kubectl.run(['describe','pod',S.k8s.pods[0].name]).out.slice(-300)`], ['c', 'kubectl set image deployment/shop frontend=nginx:1.25'], ['c', 'kubectl get pods']],
  k4: [['js', `CMDS.kubectl.run(['logs',S.k8s.pods[0].name]).out`], ['c', 'kubectl create configmap api-config --from-literal=DB_HOST=db.internal'], ['c', 'kubectl get deploy api -o yaml > api.yaml'], ['edit', 'nano api.yaml', s => s.replace(/(\n(\s+)image: shopco\/api:2.1)/, '$1\n$2envFrom:\n$2  - configMapRef:\n$2      name: api-config')], ['c', 'kubectl apply -f api.yaml'], ['c', 'kubectl get pods']],
  k5: [['js', `CMDS.kubectl.run(['describe','pod',S.k8s.pods[0].name]).out.slice(-250)`], ['c', 'kubectl set resources deployment/analytics --requests=memory=512Mi'], ['c', 'kubectl get pods']],
  k6: [['js', `CMDS.kubectl.run(['logs',S.k8s.pods[0].name]).out`], ['js', `(S.k8s.flags.logsRead=new Set(['site']),'ok')`], ['c', 'kubectl logs deploy/site'], ['c', 'kubectl rollout history deployment/site'], ['c', 'kubectl rollout undo deployment/site'], ['c', 'kubectl scale deployment site --replicas=4'], ['c', 'kubectl rollout status deployment/site']],
  m1: [['c', 'prom metrics'], ['c', `promql 'sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))'`], ['edit', 'nano queries/cpu.promql', () => '100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100\n'], ['edit', 'nano queries/error_ratio.promql', () => 'sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))\n'], ['edit', 'nano queries/disk_free.promql', () => 'node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100\n'], ['c', 'promql queries/cpu.promql'], ['c', 'promql queries/disk_free.promql']],
  m2: [['edit', 'nano dashboards/shop.yaml', () => `title: Shop overview\npanels:\n  - title: Requests per second\n    type: timeseries\n    query: sum by (service) (rate(http_requests_total[5m]))\n    unit: req/s\n  - title: Error ratio\n    type: timeseries\n    query: sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))\n    unit: percentunit\n  - title: CPU busy\n    type: timeseries\n    query: 100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100\n    unit: percent\n  - title: Free disk\n    type: gauge\n    query: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100\n    unit: percent\n    thresholds: [15, 25]\n    invert: true\n`], ['c', 'dash apply dashboards/shop.yaml'], ['c', 'dash open shop-overview'], ['shot', 'dash'], ['js', `(document.getElementById('dvOv').hidden=true,'closed')`]],
  m3: [['edit', 'nano rules/alerts.yml', () => `groups:\n  - name: shop\n    rules:\n      - alert: HighErrorRate\n        expr: sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m])) > 0.05\n        for: 5m\n        labels:\n          severity: critical\n        annotations:\n          summary: "{{ $labels.service }} error ratio above 5%"\n      - alert: DiskAlmostFull\n        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.15\n        for: 10m\n        labels:\n          severity: warning\n        annotations:\n          summary: "{{ $labels.instance }} has less than 15% disk free"\n`], ['c', 'promtool check rules rules/alerts.yml'], ['c', 'prom reload'], ['c', 'prom alerts']],
  m4: [['c', 'incident list'], ['c', 'incident ack INC-2207'], ['c', 'incident assign INC-2207 dev'], ['c', `promql 'sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))'`], ['c', 'incident sev INC-2207 SEV2'], ['c', 'kubectl rollout history deployment/checkout'], ['c', 'kubectl logs deploy/checkout'], ['c', 'kubectl rollout undo deployment/checkout'], ['c', 'incident note INC-2207 "Rolled back checkout 3.2 to 3.1, payment timeouts were the cause. Watching error ratio."'], ['c', 'incident status INC-2207 mitigated'], ['wait', 33000], ['c', `promql 'sum by (service) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total[5m]))'`], ['c', 'incident status INC-2207 resolved']],
  m5: [['c', 'incident show INC-2207'], ['c', 'mkdir postmortems'], ['edit', 'nano postmortems/INC-2207.md', () => '# INC-2207 checkout errors\n\n## Summary\nRelease 3.2 of checkout made payment calls time out, so some checkouts failed until we rolled back.\n\n## Impact\nAbout 11.8% of checkout requests failed for 25 minutes. Customers saw payment errors.\n\n## Timeline\n- 08:35 checkout 3.2 deployed\n- 08:40 HighErrorRate fired\n- 08:48 acknowledged\n- 08:53 rolled back to 3.1\n- 09:05 resolved\n\n## Root cause\nRelease 3.2 changed PAYMENT_TIMEOUT_MS from 2000 to 200 for all payment calls. The provider p99 is 450ms, so many calls hit the timeout.\n\n## Action items\n- [ ] Restore a 2000ms timeout for payment calls (owner: payments team)\n- [ ] Make the load test a required pipeline step (owner: platform)\n- [ ] Add a canary stage that checks error ratio before full rollout (owner: platform)\n']],
};
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
  await page.route('**fonts.googleapis.com/**', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Every lab must start unsolved, so no objective is accidentally pre-satisfied.
  const fresh = await page.evaluate(() => LESSONS.map((l) => { P.done = LESSONS.map((x) => x.id); load(l.id); return [l.id, L.objectives.filter((o) => { try { return o.ok(); } catch (e) { return false; } }).length]; }));
  await page.evaluate(() => { P.done = []; });
  const preSolved = fresh.filter(([, n]) => n > 0).map(([id, n]) => `${id} (${n})`);
  if (preSolved.length) console.log('note: objectives already true at start:', preSolved.join(', '));

  const type = async (c) => { await page.fill('#cmd', c); await page.press('#cmd', 'Enter'); };
  let fails = 0;
  for (const id of Object.keys(SOL)) {
    if (only && id !== only) { await page.evaluate((id) => { if (!P.done.includes(id)) P.done.push(id); }, id); continue; }
    await page.evaluate((id) => load(id), id);
    for (const st of SOL[id]) {
      if (st[0] === 'c') await type(st[1]);
      else if (st[0] === 'wait') await page.waitForTimeout(st[1]);
      else if (st[0] === 'js') await page.evaluate(st[1]);
      else if (st[0] === 'shot') { /* screenshots are for manual review only */ }
      else if (st[0] === 'edit') {
        await type(st[1]);
        const cur = await page.inputValue('#edText');
        await page.fill('#edText', st[2](cur));
        await page.click('#edSave');
        const status = await page.textContent('#edStatus');
        if (/Error|errors/.test(status)) console.log('  editor:', status);
        await page.click('#edExit');
      }
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(150);
    const res = await page.evaluate((id) => ({ done: P.done.includes(id), obj: L.objectives.map((o) => { try { return !!o.ok(); } catch (e) { return false; } }) }), id);
    console.log(`${res.done ? 'PASS' : 'FAIL'}  ${id}  ${res.obj.map((x) => (x ? '+' : '-')).join('')}`);
    if (!res.done) { fails++; console.log(await page.evaluate(() => document.getElementById('out').innerText.slice(-2000))); }
  }
  await browser.close();
  if (errors.length) { console.log('page errors:', errors); fails++; }
  console.log(fails ? `${fails} failure(s)` : 'all labs pass');
  process.exit(fails ? 1 : 0);
})();
