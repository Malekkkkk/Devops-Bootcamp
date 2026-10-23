// Builds index.html: one self-contained file (styles, markup, js-yaml and the app inlined).
// No dependencies. Run: node scripts/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const jsFiles = readdirSync(join(root, 'src/js')).filter((f) => f.endsWith('.js')).sort();
const app = jsFiles.map((f) => `/* ===== src/js/${f} ===== */\n${read('src/js/' + f)}`).join('\n');

// Function replacers so "$" in the sources is never treated as a pattern.
const html = read('src/index.template.html')
  .replace('/* {{STYLES}} */', () => read('src/styles.css'))
  .replace('<!-- {{BODY}} -->', () => read('src/body.html'))
  .replace('/* {{VENDOR}} */', () => read('vendor/js-yaml.min.js'))
  .replace('/* {{APP}} */', () => app);

writeFileSync(join(root, 'index.html'), html);
console.log(`index.html built from ${jsFiles.length} modules (${(html.length / 1024).toFixed(0)} KB)`);
