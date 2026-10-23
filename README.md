# Root Access

**Hands-on DevOps practice in your browser.** 22 labs, each a realistic ticket or incident, solved by typing real commands into a simulated terminal. No solutions are given: a lab unlocks only after you clear the one before it.

It was built for junior engineers who know CI/CD and tooling but want practice on the *ops* side: Linux, Ansible, Kubernetes, monitoring and incident response. That's the part that makes technical interviews stressful when you haven't had hands-on time.

## What you practice

| Module | Labs |
| --- | --- |
| **Linux** | Find your way around · Users, groups and permissions · A service that won't start · Who is on my port? · Disk full at 3 a.m. · Automate a health check |
| **Ansible** | Inventory and first contact · Your first playbook · Templates and variables · Handlers: restart only when needed · Keeping secrets out of git |
| **Kubernetes** | Your first Deployment · Service with no endpoints · ImagePullBackOff · CrashLoopBackOff and ConfigMaps · Stuck in Pending · Bad release: roll back |
| **Monitoring & incidents** | Ask the metrics (PromQL) · Build a service dashboard · Alert on symptoms · You are on call · Write the postmortem |

## How it works

- Each lab gives you a **ticket**, a list of **objectives**, and **field notes** that teach the concepts without giving the answer.
- Objectives check the **real state** of the simulated system after every command, so any correct approach passes, not just one specific command.
- Errors behave like the real tools: `Permission denied` without `sudo`, YAML errors from Ansible, `CrashLoopBackOff` in Kubernetes, PromQL parse errors, and so on.
- `man <command>` shows usage, `help` lists commands, and **Get a nudge** points the way when you're stuck.
- `nano` opens an editor for configs, playbooks, manifests and dashboards. **Reset lab** restores the starting state.
- Progress is saved in your browser (localStorage). Nothing is sent anywhere.

It's a simulation: great for building reflexes and confidence, but it doesn't replace practice on real VMs and a real cluster. Use both.

## Run it

**Just open it.** `index.html` is a single self-contained file. Double-click it, or serve the folder with any static server.

**Publish on GitHub Pages.** Push this repo, then go to *Settings → Pages*, set *Source* to *Deploy from a branch*, choose `main` and `/ (root)`. Your app will be at `https://<username>.github.io/<repo>/`.

Requires a modern browser. Fonts load from Google Fonts and fall back to system fonts offline.

## Project layout

```
index.html               built app (committed, so Pages works without a build step)
src/
  index.template.html    page shell
  styles.css             all styles (light and dark themes)
  body.html              page markup
  js/
    01-shell.js          virtual filesystem, shell parser, Linux commands, systemd
    02-ansible.js        inventory parsing, ad-hoc commands, playbooks, handlers, vault
    03-kubernetes.js     kubectl, deployments, services, pod states, rollouts
    04-monitoring.js     metric simulator, PromQL subset, dashboards, alert rules, incidents
    05-lessons.js        every lab: setup, ticket, notes, nudges, objective checks
    06-ui.js             terminal, editor, dashboard viewer, progress
vendor/js-yaml.min.js    YAML parser (MIT, see vendor/js-yaml.LICENSE)
scripts/build.mjs        inlines everything into index.html (no dependencies)
tests/e2e.mjs            solves every lab in a headless browser (contains spoilers)
```

## Develop

```bash
npm install
npx playwright install chromium
npm run build        # rebuild index.html after editing src/
npm test             # build, then solve all 22 labs end to end
npm test -- k4       # run a single lab
```

Always run `npm run build` and commit `index.html` together with your `src/` changes. CI fails if they're out of sync.

> **Spoiler warning:** `tests/e2e.mjs` contains working solutions for every lab. If you're here to learn, solve the labs first.

## Add a lab

Labs live in `src/js/05-lessons.js` as objects in the `LESSONS` array:

```js
{
  id: 'lx7', mod: 0, title: 'Short title', host: 'lab-01',
  ticket: { id: 'INC-1234', sev: 2, text: '<p>What happened and what the learner must achieve.</p>' },
  notes: '<p>The concepts needed, without the answer.</p>',
  tools: ['commands', 'worth', 'trying'],
  nudges: ['A hint that points the way.', 'A more specific hint, still not the answer.'],
  setup() { world('lab-01'); /* build the broken starting state */ },
  objectives: [
    { t: 'Describe the end state', ok: () => /* check the simulated system */ true },
  ],
}
```

Guidelines:

- Objectives check **outcomes**, not commands, so learners can solve it their own way.
- Make every lab start unsolved. The test suite lists objectives that are already true at the start; that's fine only for guard objectives such as "the backups are still there".
- Nudges never reveal the exact command.
- Add a solution for the new lab to `tests/e2e.mjs`.

## Contributing

Issues and pull requests are welcome: new labs, more realistic command output, bug reports when a correct answer isn't accepted. Please include a test solution for any new or changed lab.

## License

[MIT](LICENSE). js-yaml is included under its own MIT license.
