/**
 * @fileoverview Freesail CLI
 *
 * Entry point for the `freesail` command-line tool.
 *
 * Usage:
 *   freesail validate catalog  — validate an existing catalog package
 *   freesail run gateway       — start the Freesail gateway server
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
} else if (verb === 'run') {
  if (noun === 'gateway') {
    import('./commands/gateway-run.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for run: ${noun ?? '(none)'}`);
    console.error('Usage: freesail run gateway');
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${verb ?? '(none)'}`);
  console.error('Usage:');
  console.error('  freesail validate catalog');
  console.error('  freesail run gateway');
  process.exit(1);
}
