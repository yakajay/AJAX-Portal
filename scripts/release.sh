#!/usr/bin/env bash
# Usage: scripts/release.sh <patch|minor|major>
# Bumps the version in server/ and client/, and adds a dated CHANGELOG section from [Unreleased].
set -euo pipefail
cd "$(dirname "$0")/.."

bump="${1:-}"
[[ "$bump" =~ ^(patch|minor|major)$ ]] || { echo "Usage: $0 <patch|minor|major>" >&2; exit 1; }

(cd server && npm version "$bump" --no-git-tag-version >/dev/null)
version=$(node -p "require('./server/package.json').version")
(cd client && npm version "$version" --no-git-tag-version --allow-same-version >/dev/null)

today=$(date +%F)
node -e '
const fs = require("fs");
const [version, today] = process.argv.slice(1);
const text = fs.readFileSync("CHANGELOG.md", "utf8");
fs.writeFileSync("CHANGELOG.md", text.replace("## [Unreleased]\n", `## [Unreleased]\n\n## [${version}] - ${today}\n### Added\n- TODO: describe this release\n`));
' "$version" "$today"

echo "Bumped to $version. Now edit the [$version] section of CHANGELOG.md, commit, and merge to main."
