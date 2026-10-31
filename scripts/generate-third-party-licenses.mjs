// Assemble notices for packages bundled into the desktop application.
import fs from 'node:fs';
import path from 'node:path';

const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')).packages;
const roots = ['monaco-editor', 'lucide-static', 'unified', 'remark-parse', 'remark-gfm', 'remark-math', 'remark-rehype', 'rehype-raw', 'rehype-sanitize', 'rehype-mathjax', 'rehype-highlight', 'rehype-stringify'];
const seen = new Set();
function resolve(from, name) {
  let dir = from;
  for (;;) {
    const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    if (lock[candidate]) return candidate;
    const parent = dir.lastIndexOf('/node_modules/');
    if (parent >= 0) dir = dir.slice(0, parent);
    else if (dir.startsWith('node_modules/')) dir = '';
    else throw new Error(`Missing dependency ${name} from ${from}`);
  }
}
function visit(dir) {
  if (seen.has(dir)) return;
  seen.add(dir);
  for (const name of Object.keys(lock[dir].dependencies || {})) visit(resolve(dir, name));
}
for (const root of roots) visit(resolve('', root));
const output = ['Third-party license texts for bundled MarkdownRE components', 'Generated from package-lock.json. See THIRD_PARTY_NOTICES.md for additional attribution.', 'Electron distributions also contain Electron and Chromium license files.\n'];
for (const dir of [...seen].sort()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const files = fs.readdirSync(dir).filter(name => /^(license|licence|copying|notice)(\..*)?$|^thirdpartynotices\.txt$/i.test(name) && fs.statSync(path.join(dir, name)).isFile()).sort();
  output.push(`${'='.repeat(72)}\n${pkg.name} ${pkg.version} (${pkg.license || 'see license'})\n${'='.repeat(72)}`);
  if (files.length) {
    for (const file of files) output.push(`--- ${file} ---\n${fs.readFileSync(path.join(dir, file), 'utf8').trim()}`);
  } else if (pkg.name === 'remark-math' || pkg.name === 'rehype-mathjax') {
    output.push('Upstream license: https://github.com/remarkjs/remark-math/blob/main/license');
    if (pkg.name === 'rehype-mathjax') output.push('Package attribution: Copyright (c) Taniguchi Masaya (per package README).');
    output.push(fs.readFileSync('licenses/upstream/remark-math-license.txt', 'utf8').trim());
  } else if (pkg.name === 'mj-context-menu') {
    output.push('Upstream license: https://github.com/zorkow/context-menu/blob/master/LICENSE');
    output.push(fs.readFileSync('licenses/upstream/context-menu-license.txt', 'utf8').trim());
  } else throw new Error(`No license text found for ${pkg.name} in ${dir}`);
}
const result = output.join('\n\n') + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync('THIRD_PARTY_LICENSES.txt') || fs.readFileSync('THIRD_PARTY_LICENSES.txt', 'utf8') !== result) {
    throw new Error('THIRD_PARTY_LICENSES.txt is out of date; regenerate with node scripts/generate-third-party-licenses.mjs');
  }
  console.log(`Verified licenses for ${seen.size} packages.`);
} else {
  fs.writeFileSync('THIRD_PARTY_LICENSES.txt', result);
  console.log(`Wrote licenses for ${seen.size} packages.`);
}
