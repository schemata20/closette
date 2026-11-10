import {mkdir, readdir, copyFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist/client');
await mkdir(out, {recursive:true});
for (const file of await readdir(root)) {
  if (/\.(html|css|js|webp|png|jpe?g|pdf)$/.test(file)) await copyFile(resolve(root,file),resolve(out,file));
}
await writeFile(resolve(out,'robots.txt'), 'User-agent: *\nDisallow: /admin\nDisallow: /order\nDisallow: /checkout\n');
console.log('Built static assets in dist/client. Server code and secrets are excluded.');
