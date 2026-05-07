#!/usr/bin/env node
/**
 * Fails fast with a clear message if Node.js is too old (predev/prestart/pretest).
 */
const major = Number(process.version.slice(1).split('.')[0]);
if (Number.isNaN(major) || major < 20) {
  console.error(`Node.js 20 or newer is required. Current: ${process.version}`);
  console.error('Install: https://nodejs.org/en/download/ (LTS) or: brew install node@20');
  process.exit(1);
}
