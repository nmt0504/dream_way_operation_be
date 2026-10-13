// TypeScript 7 (native) has no JS API, so typescript-eslint cannot use it.
// Give typescript-eslint its own TypeScript 6 instead of the project's TS 7 peer.
const TS_FOR_ESLINT = '~6.0.3';

function readPackage(pkg) {
  const isTsEslint =
    pkg.name === 'typescript-eslint' ||
    pkg.name === 'ts-api-utils' ||
    pkg.name.startsWith('@typescript-eslint/');

  if (isTsEslint && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = { ...pkg.dependencies, typescript: TS_FOR_ESLINT };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
