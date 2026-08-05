#!/usr/bin/env bash
# Merge Vite dist + classic static trees into deploy/staging/hosting-out.
# Used by GitHub Actions (Linux). Windows: use assemble-hosting.ps1.
#
# IMPORTANT: When copying into an existing directory, use "src/." not "src"
# otherwise GNU cp nests as dest/src (e.g. booking/booking/pages/...).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONT="${ROOT}/frontend"
DIST="${FRONT}/dist"
OUT="${ROOT}/deploy/staging/hosting-out"
FA="${FRONT}/dist-firebase-app/firebase-app.js"
API_HINT="${STAGING_API_BASE_URL:-yuruicamp-api-staging}"

if [[ ! -d "$DIST" ]]; then
  echo "Missing frontend/dist. Run npm run build in frontend/ first." >&2
  exit 1
fi
if [[ ! -f "$FA" ]]; then
  echo "Missing bundled firebase-app.js at $FA" >&2
  exit 1
fi

echo "==> Clean $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> Copy Vite dist"
cp -a "$DIST"/. "$OUT"/

echo "==> Overlay classic storefront js/css"
mkdir -p "$OUT/storefront/js" "$OUT/storefront/css"
cp -a "$FRONT/storefront/js"/. "$OUT/storefront/js"/
cp -a "$FRONT/storefront/css"/. "$OUT/storefront/css"/
cp -f "$FA" "$OUT/storefront/js/firebase-app.js"
if [[ -f "${FRONT}/dist-firebase-app/firebase-app.js.map" ]]; then
  cp -f "${FRONT}/dist-firebase-app/firebase-app.js.map" "$OUT/storefront/js/firebase-app.js.map"
fi

echo "==> Overlay booking / admin / components / data / assets (merge into existing dirs)"
mkdir -p "$OUT/booking" "$OUT/admin" "$OUT/components" "$OUT/data" "$OUT/assets"
cp -a "$FRONT/booking"/. "$OUT/booking"/
if [[ -f "$DIST/booking/pages/booking-success.html" ]]; then
  mkdir -p "$OUT/booking/pages"
  cp -f "$DIST/booking/pages/booking-success.html" "$OUT/booking/pages/booking-success.html"
fi
cp -a "$FRONT/admin"/. "$OUT/admin"/
cp -a "$FRONT/components"/. "$OUT/components"/
cp -a "$FRONT/data"/. "$OUT/data"/
if [[ -d "$FRONT/assets" ]]; then
  cp -a "$FRONT/assets"/. "$OUT/assets"/
fi
rm -rf "$OUT/admin/scripts" || true

echo "==> Sanity checks"
test -f "$OUT/yurui-env.js"
test -f "$OUT/storefront/pages/home.html"
test -f "$OUT/booking/pages/camp-search.html"
test -f "$OUT/admin/login.html"
# Must NOT be nested (regression guard for GNU cp)
if [[ -d "$OUT/booking/booking" ]]; then
  echo "FAIL: nested booking/booking detected — copy used wrong cp form" >&2
  exit 1
fi
if grep -qE "from ['\"]firebase/" "$OUT/storefront/js/firebase-app.js"; then
  echo "FAIL: firebase-app.js still has bare firebase imports" >&2
  exit 1
fi
if ! grep -q "$API_HINT" "$OUT/yurui-env.js"; then
  echo "WARNING: yurui-env.js may not contain staging API hint ($API_HINT)"
fi

echo "Assemble OK -> $OUT"
