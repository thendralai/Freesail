/**
 * @fileoverview Freesail CLI
 *
 * Entry point for the `freesail` command-line tool.
 *
 * Usage:
 *   freesail validate catalog  — validate an existing catalog package
 *   freesail prepare catalog   — bundle catalog.json from catalog.include.json + local schemas
 *   freesail include catalog    — add a package to catalog.include.json and re-prepare
 *   freesail run gateway       — start the Freesail gateway server
 *   freesail new catalog       — scaffold a new catalog package
 */

const args = process.argv.slice(2);
const [verb, noun] = args;

function printHelp(): void {
  console.log('Freesail CLI');
  console.log('');
  console.log('Usage:');
  console.log('  freesail <command> <target> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  new catalog       Scaffold a new catalog package');
  console.log('  include catalog    Add a package to catalog.include.json and re-prepare');
  console.log('  prepare catalog   Bundle catalog.json from catalog.include.json + local schemas');
  console.log('  validate catalog  Validate an existing catalog package');
  console.log('  run gateway       Start the Freesail gateway server');
  console.log('');
  console.log('Options (new catalog):');
  console.log('  --dir, -d <path>          Target directory');
  console.log('');
  console.log('Options (prepare catalog):');
  console.log('  --dir, -d <path>          Catalog root directory (default: current directory)');
  console.log('');
  console.log('Options (validate catalog):');
  console.log('  --dir, -d <path>          Catalog root directory (default: current directory)');
  console.log('');
  console.log('Options (include catalog):');
  console.log('  --dir, -d <path>          Catalog root directory (default: current directory)');
  console.log('  --package, -p <name>      Package to import from');
  console.log('');
  console.log('Options (run gateway):');
  console.log('  --http-port <port>        Port for the HTTP/SSE server (default: 3001)');
  console.log('  --http-host <host>        Host to bind the HTTP server to (default: 0.0.0.0)');
  console.log('  --mcp-mode <mode>         MCP transport: stdio or http (default: http)');
  console.log('  --mcp-port <port>         Port for MCP HTTP server (default: 3000)');
  console.log('  --mcp-host <host>         Host to bind MCP HTTP server to (default: 127.0.0.1)');
  console.log('  --log-file <file>         Write logs to file (in addition to console)');
  console.log('');
  console.log('General:');
  console.log('  --help, -h                Show this help message');
}

if (verb === '--help' || verb === '-h' || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

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
} else if (verb === 'include') {
  if (noun === 'catalog') {
    import('./commands/catalog-import.js').then((m) => m.run());
  } else {
    console.error(`Unknown target for include: ${noun ?? '(none)'}`);
    console.error('Usage: freesail include catalog');
    process.exit(1);
  }
} else {
  console.error(`Unknown command: ${verb ?? '(none)'}\n`);
  printHelp();
  process.exit(1);
}
