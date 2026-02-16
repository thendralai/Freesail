const fs = require('fs');
const path = require('path');
const { globSync } = require('glob'); // You may need to: npm install glob

// 1. Get the "Source of Truth" from root
const rootPkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const newVersion = rootPkg.version;

// 2. Find ALL package.json files in your workspaces
const packageFiles = globSync('packages/**/package.json', {
  ignore: ['**/node_modules/**', 'packages/@freesail-community/**']
});

packageFiles.forEach(filePath => {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // 3. Update the version
  pkg.version = newVersion;
  
  // 4. IMPORTANT: Update internal cross-dependencies
  // This ensures @freesail/react points to the new version of @freesail/core
  if (pkg.dependencies) {
    Object.keys(pkg.dependencies).forEach(dep => {
      if (dep.startsWith('@freesail/')) {
        pkg.dependencies[dep] = `^${newVersion}`;
      }
    });
  }

  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✅ Synced ${pkg.name} to v${newVersion}`);
});