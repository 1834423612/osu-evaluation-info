#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?GitHub runner temporary directory is required}"
: "${GITHUB_PATH:?GitHub runner path file is required}"

# Hosted images cache Node 24, but their default node can still be Node 22.
runtime_bin=""
while IFS= read -r candidate; do
  if [[ -x "$candidate" ]]; then
    runtime_bin="$(dirname "$candidate")"
    break
  fi
done < <(find "${RUNNER_TOOL_CACHE:-/opt/hostedtoolcache}/node" -path '*/24.*/x64/bin/node' -type f 2>/dev/null | sort -Vr)

if [[ -z "$runtime_bin" ]]; then
  # Verified fallback when the hosted image has no cached Node 24.
  runtime_version="24.18.1"
  runtime_archive="node-v${runtime_version}-linux-x64.tar.xz"
  runtime_dir="$(mktemp -d "$RUNNER_TEMP/catalog-node.XXXXXX")"
  runtime_url="https://nodejs.org/dist/v${runtime_version}"
  curl --fail --silent --show-error --location --retry 3 "$runtime_url/$runtime_archive" -o "$runtime_dir/$runtime_archive"
  curl --fail --silent --show-error --location --retry 3 "$runtime_url/SHASUMS256.txt" -o "$runtime_dir/SHASUMS256.txt"
  (
    cd "$runtime_dir"
    awk -v archive="$runtime_archive" '$2 == archive { print }' SHASUMS256.txt > archive.sha256
    test -s archive.sha256
    sha256sum --check archive.sha256
    tar -xJf "$runtime_archive"
  )
  runtime_bin="$runtime_dir/node-v${runtime_version}-linux-x64/bin"
fi

export PATH="$runtime_bin:$PATH"
node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) process.exit(1)'
printf '%s\n' "$runtime_bin" >> "$GITHUB_PATH"

# Avoid third-party Actions so owner-only repository policies are respected.
package_tools="$RUNNER_TEMP/catalog-pnpm"
npm install --global --prefix "$package_tools" --ignore-scripts --no-audit --no-fund pnpm@11.18.0
export PATH="$package_tools/bin:$PATH"
printf '%s\n' "$package_tools/bin" >> "$GITHUB_PATH"
node --version
pnpm --version
