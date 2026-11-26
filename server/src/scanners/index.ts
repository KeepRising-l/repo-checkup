import { completenessScanner } from './completeness.js';
import { hardcodedPathsScanner } from './hardcodedPaths.js';
import { secretsScanner } from './secrets.js';
import type { ScannerModule } from './types.js';
import { windowsScriptsScanner } from './windowsScripts.js';

export const defaultScanners: ScannerModule[] = [
  completenessScanner,
  windowsScriptsScanner,
  hardcodedPathsScanner,
  secretsScanner,
];
