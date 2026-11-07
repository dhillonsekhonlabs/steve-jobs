#!/bin/sh
# Conscious for macOS and Linux (and Git Bash on Windows): puts the great minds into Claude Code and Codex.
#
#   curl -fsSL https://raw.githubusercontent.com/dhillonsekhonlabs/steve-jobs/main/install.sh | sh
#
# Run it again to update. It installs to ~/.conscious, or to CONSCIOUS_HOME if that is set, and
# prints the one line that removes everything it added. It uses the Node already on this machine,
# and only when there is none (or it is older than 18) does it bring its own, from nodejs.org,
# checked against Node's published checksum. CONSCIOUS_SOURCE installs from a folder or another
# repository instead of GitHub; run from a checkout, it installs that checkout.
set -eu

repo="https://github.com/dhillonsekhonlabs/steve-jobs"
node_line="https://nodejs.org/dist/latest-v24.x"
home="${CONSCIOUS_HOME:-$HOME/.conscious}"

fail() { printf 'conscious: %s\n' "$*" >&2; exit 1; }
node_ok() { [ -n "$1" ] && "$1" -e 'process.exit(+process.versions.node.split(".")[0] >= 18 ? 0 : 1)' >/dev/null 2>&1; }

# Git Bash on Windows: Node and the agents want Windows paths.
win=""
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) command -v cygpath >/dev/null 2>&1 && win=1 ;; esac
native() { if [ -n "$win" ]; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

mkdir -p "$home"
home="$(cd "$home" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

# ---- Node: the one on this machine, the one an earlier install brought, or a new one
node=""
if command -v node >/dev/null 2>&1 && node_ok "$(command -v node)"; then
  node="$(command -v node)"
elif node_ok "$home/node/bin/node"; then
  node="$home/node/bin/node"
else
  [ -z "$win" ] || fail "no Node 18 or newer here; on Windows, install.ps1 brings its own"
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "no Node 18 or newer here, and nodejs.org has no build for $(uname -s): install Node, then run this again" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) fail "no Node 18 or newer here, and nodejs.org has no build for $(uname -m)" ;;
  esac
  echo "No Node 18 or newer here, so Conscious brings its own ($os-$arch, from nodejs.org)."
  line="$(curl -fsSL "$node_line/SHASUMS256.txt" | grep -E "^[0-9a-f]{64}  node-v[0-9.]+-$os-$arch\.tar\.gz\$" | head -n 1)" ||
    fail "couldn't reach nodejs.org"
  [ -n "$line" ] || fail "nodejs.org lists no $os-$arch build"
  sum="${line%% *}"
  file="${line##* }"
  stem="${file%.tar.gz}"
  curl -fsSL "$node_line/$file" -o "$tmp/$file" || fail "couldn't download $file"
  if command -v sha256sum >/dev/null 2>&1; then got="$(sha256sum "$tmp/$file" | cut -d' ' -f1)"
  else got="$(shasum -a 256 "$tmp/$file" | cut -d' ' -f1)"; fi
  [ "$got" = "$sum" ] || fail "the Node download didn't match its checksum"
  tar -xzf "$tmp/$file" -C "$tmp" "$stem/bin/node" || fail "couldn't unpack $file"
  mkdir -p "$home/node/bin"
  mv "$tmp/$stem/bin/node" "$home/node/bin/node"
  node_ok "$home/node/bin/node" || fail "the Node it brought doesn't run"
  node="$home/node/bin/node"
fi

# ---- Conscious itself: the program and the minds, nothing else
src="${CONSCIOUS_SOURCE:-}"
case "$0" in
  *install.sh) here="$(cd "$(dirname "$0")" && pwd)"; [ -n "$src" ] || { [ -f "$here/bin/conscious.mjs" ] && src="$here"; } || true ;;
esac
[ -n "$src" ] || src="$repo"
if [ ! -d "$src" ]; then
  mkdir -p "$tmp/src"
  if curl -fsSL "${src%/}/archive/refs/heads/main.tar.gz" -o "$tmp/src.tgz" 2>/dev/null &&
    tar -xzf "$tmp/src.tgz" -C "$tmp/src" --strip-components=1 2>/dev/null; then :
  else
    # A private repository answers only to git, with the person's own credentials.
    command -v git >/dev/null 2>&1 || fail "couldn't download Conscious from $src"
    rm -rf "$tmp/src"
    git clone --quiet --depth 1 "$src" "$tmp/src" || fail "couldn't get Conscious from $src"
  fi
  src="$tmp/src"
fi
[ -f "$src/bin/conscious.mjs" ] && [ -d "$src/minds" ] || fail "$src has no bin/conscious.mjs and minds/"
rm -rf "$home/app.new" "$home/app.old"
mkdir -p "$home/app.new"
cp -R "$src/bin" "$src/minds" "$home/app.new/"
if [ -d "$home/app" ]; then mv "$home/app" "$home/app.old"; fi
mv "$home/app.new" "$home/app"
rm -rf "$home/app.old"

# ---- into the agents
script="$(native "$home/app/bin/conscious.mjs")"
node_path="$(native "$node")"
case "$node_path" in *.exe|*.EXE) ;; *) [ -z "$win" ] || node_path="$node_path.exe" ;; esac
"$node" "$script" check >/dev/null || fail "the minds it got didn't pass their check: \"$node\" \"$script\" check"
"$node" "$script" install --node "$node_path" || fail "install stopped; the lines above say why"
echo
echo "To update, run the same line again. To remove everything it added:"
echo "  \"$node\" \"$script\" uninstall --all"
