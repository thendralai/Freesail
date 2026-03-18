/**
 * @fileoverview Freesail CLI
 *
 * Entry point for the `freesail` command-line tool.
 *
 * Usage:
 *   freesail validate catalog  — validate an existing catalog package
 *   freesail prepare catalog   — generate catalog.json from decomposed schema files
 *   freesail run gateway       — start the Freesail gateway server
 *   freesail new catalog       — scaffold a new catalog package
 *   freesail update catalog    — update common files in an existing catalog
 */

const [, , verb, noun] = process.argv;

if (verb === 'validate') {
  if (noun === 'catalog') {
    import('./commands/catalog-validate.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for validate: ${noun ?? '(none)'}`);
    console.error('Usage: freesail validate catalog');
    process.exit(1);
  }
} else if (verb === 'prepare') {
  if (noun === 'catalog') {
    import('./commands/catalog-prepare.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for prepare: ${noun ?? '(none)'}`);
    console.error('Usage: freesail prepare catalog');
    process.exit(1);
  }
} else if (verb === 'run') {
  if (noun === 'gateway') {
    import('./commands/gateway-run.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for run: ${noun ?? '(none)'}`);
    console.error('Usage: freesail run gateway');
    process.exit(1);
  }
} else if (verb === 'new') {
  if (noun === 'catalog') {
    import('./commands/catalog-new.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for new: ${noun ?? '(none)'}`);
    console.error('Usage: freesail new catalog');
    process.exit(1);
  }
} else if (verb === 'update') {
  if (noun === 'catalog') {
    import('./commands/catalog-update.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for update: ${noun ?? '(none)'}`);
    console.error('Usage: freesail update catalog');
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${verb ?? '(none)'}`);
  console.error('Usage:');
  console.error('  freesail validate catalog');
  console.error('  freesail prepare catalog');
  console.error('  freesail run gateway');
  console.error('  freesail new catalog');
  console.error('  freesail update catalog');
  process.exit(1);
}
