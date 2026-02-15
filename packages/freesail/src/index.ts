// packages/freesail/src/index.ts

// 1. Core is always available at the top level (Flat)
export * from '@freesail/core';
export * as Core from '@freesail/core'; // Also provide namespace for power users

// 2. Framework-specific UI logic (Namespaced)
export * as ReactUI from '@freesail/react';
