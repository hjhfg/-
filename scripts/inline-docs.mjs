import fs from 'node:fs';
import path from 'node:path';

const docsDir = path.resolve('docs');
const htmlPath = path.join(docsDir, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Inline CSS bundle
html = html.replace(/<link\s+rel="stylesheet"[^>]*href="\.\/assets\/([^"]+)"[^>]*>/g, (_m, file) => {
  const css = fs.readFileSync(path.join(docsDir, 'assets', file), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// Inline JS bundle safely (escaping closing script sequences inside string literals if any)
html = html.replace(/<script\s+type="module"[^>]*src="\.\/assets\/([^"]+)"[^>]*><\/script>/g, (_m, file) => {
  const js = fs
    .readFileSync(path.join(docsDir, 'assets', file), 'utf8')
    .replace(/<\/script>/gi, '<\\/script>');
  return `<script type="module">\n${js}\n</script>`;
});

fs.writeFileSync(htmlPath, html, 'utf8');
fs.rmSync(path.join(docsDir, 'assets'), { recursive: true, force: true });
fs.writeFileSync(path.join(docsDir, '.nojekyll'), '', 'utf8');
console.log('✅ Built self-contained single-file production web app at docs/index.html');
