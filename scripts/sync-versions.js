const fs = require('fs');
const path = require('path');

const rootPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const packages = ['packages/core', 'packages/gateway', 'packages/react'];

packages.forEach(pkgPath => {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'));
  pkgJson.version = rootPkg.version;
  fs.writeFileSync(path.join(pkgPath, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');
  console.log(`Updated ${pkgPath} to v${rootPkg.version}`);
});
