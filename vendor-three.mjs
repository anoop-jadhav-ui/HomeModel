import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('output/vendor', { recursive: true });
const packageRoot = new URL('../', import.meta.resolve('three'));
for (const name of ['three.module.js', 'three.core.js']) {
  await copyFile(new URL(`build/${name}`, packageRoot), `output/vendor/${name}`);
}
for (const [source, target] of [
  ['controls/OrbitControls.js', 'OrbitControls.js'],
  ['geometries/RoundedBoxGeometry.js', 'RoundedBoxGeometry.js'],
  ['environments/RoomEnvironment.js', 'RoomEnvironment.js'],
  ['objects/Reflector.js', 'Reflector.js']
]) {
  await copyFile(new URL(`examples/jsm/${source}`, packageRoot), `output/vendor/${target}`);
}
await copyFile(new URL('LICENSE', packageRoot), 'output/vendor/THREE-LICENSE.txt');
