const fs = require('fs');
const path = require('path');
const { globSync } = require('glob'); // You may need to: npm install glob

// 1. Get the "Source of Truth" from root
const rootPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const newVersion = rootPkg.version;

// 2. Find ALL package.json files in your workspaces
const packageFiles = globSync('packages/**/package.json', {
  ignore: ['**/node_modules/**']
});

const FREESAIL_SCOPES = ['@freesail/', '@freesail-community/'];

function isFreesailDep(dep) {
  return FREESAIL_SCOPES.some(scope => dep.startsWith(scope));
}

packageFiles.forEach(filePath => {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // 3. Update the version
  pkg.version = newVersion;

  // 4. IMPORTANT: Update internal cross-dependencies across all dep sections
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[section]) {
      Object.keys(pkg[section]).forEach(dep => {
        if (isFreesailDep(dep)) {
          pkg[section][dep] = `^${newVersion}`;
        }
      });
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✅ Synced ${pkg.name} to v${newVersion}`);
});