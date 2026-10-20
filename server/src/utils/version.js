import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

// Release identity, reported by /api/health and the startup log so an error can be traced to a release.
// GIT_SHA is set at deploy time; K_REVISION is the Cloud Run revision name.
export const version = pkg.version;
export const commit = process.env.GIT_SHA || 'unknown';
export const revision = process.env.K_REVISION || null;
