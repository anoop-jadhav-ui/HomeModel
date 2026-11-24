import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('output/vendor', { recursive: true });
for (const name of ['three.module.js', 'three.core.js']) {
  await copyFile(`node_modules/three/build/${name}`, `output/vendor/${name}`);
}
await copyFile('node_modules/three/examples/jsm/controls/OrbitControls.js', 'output/vendor/OrbitControls.js');
await copyFile('node_modules/three/LICENSE', 'output/vendor/THREE-LICENSE.txt');
