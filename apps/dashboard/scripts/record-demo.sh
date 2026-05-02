#!/usr/bin/env bash
# record-demo.sh — record the dashboard's replay-mode demo as 1080p60 MP4.
#
# Usage:
#   ./scripts/record-demo.sh [fixture] [duration_s] [voiceover_path]
#
# Defaults:
#   fixture       = treasury
#   duration_s    = 95   (90s fixture + 5s outro buffer)
#   voiceover     = ./recordings/voiceover-${fixture}.mp3 (optional;
#                   if absent, recording has no audio track)
#
# Output:
#   ./recordings/demo-${fixture}-${timestamp}.mp4
#
# Two platforms supported:
#   - Linux (intended for CI under Xvfb)  — uses x11grab
#   - macOS (intended for manual operator) — uses avfoundation
#
# Honest scope notes:
#   1. The plan markdown sketches `--headless=new` chromium + screen capture.
#      That combo is broken: headless chromium has no display, so x11grab /
#      avfoundation captures an empty desktop. We use chromium in --kiosk
#      mode (visible fullscreen, no chrome) on a real OR virtual display
#      so screen capture actually sees the page.
#   2. macOS Screen Recording permission must be granted to the terminal
#      running ffmpeg before this works. See ./scripts/README.md.
#   3. The AVFoundation device index for "main display" is usually 1 on
#      modern macOS but varies. Check with:
#        ffmpeg -f avfoundation -list_devices true -i ""
#      and override via the AVF_DEVICE env var.
#
# Exit codes:
#   0  success
#   1  prerequisite missing (ffmpeg / chromium / curl)
#   2  invalid fixture key
#   3  preview server failed to come up
#   4  recording itself failed

set -euo pipefail

# === Args + defaults =====================================================

FIXTURE="${1:-treasury}"
DURATION="${2:-95}"
VOICEOVER="${3:-./recordings/voiceover-${FIXTURE}.mp3}"

case "${FIXTURE}" in
  treasury|lvr|simple) ;;
  *)
    echo "✗ Unknown fixture '${FIXTURE}'. Valid: treasury, lvr, simple."
    exit 2
    ;;
esac

DASHBOARD_PORT="${DASHBOARD_PORT:-4173}"
DASHBOARD_URL="http://localhost:${DASHBOARD_PORT}/?replay=${FIXTURE}"

OUTPUT_DIR="./recordings"
mkdir -p "${OUTPUT_DIR}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT="${OUTPUT_DIR}/demo-${FIXTURE}-${TIMESTAMP}.mp4"

# === Prerequisite checks =================================================

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "✗ Required binary '$1' not found in PATH."
    echo "  See ./scripts/README.md for install instructions."
    exit 1
  fi
}

require ffmpeg
require curl
# chromium-browser on Linux, "Google Chrome" on macOS.
CHROMIUM_BIN=""
for candidate in chromium chromium-browser google-chrome chrome /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome; do
  if command -v "${candidate}" >/dev/null 2>&1 || [[ -x "${candidate}" ]]; then
    CHROMIUM_BIN="${candidate}"
    break
  fi
done
if [[ -z "${CHROMIUM_BIN}" ]]; then
  echo "✗ Chromium / Google Chrome not found."
  echo "  See ./scripts/README.md for install instructions."
  exit 1
fi
echo "→ Using chromium binary: ${CHROMIUM_BIN}"

# === Build + serve dashboard =============================================

echo "→ Building dashboard…"
bun run build

echo "→ Starting preview server on :${DASHBOARD_PORT}…"
bun run preview --port "${DASHBOARD_PORT}" >/tmp/dashboard-preview.log 2>&1 &
SERVER_PID=$!

cleanup() {
  echo "→ Cleaning up…"
  if [[ -n "${CHROMIUM_PID:-}" ]] && kill -0 "${CHROMIUM_PID}" 2>/dev/null; then
    kill "${CHROMIUM_PID}" 2>/dev/null || true
    wait "${CHROMIUM_PID}" 2>/dev/null || true
  fi
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for the server to actually answer — `sleep 3` is fragile under load.
echo "→ Waiting for preview server to come up…"
if ! curl --silent --output /dev/null \
        --retry-connrefused --retry 30 --retry-delay 1 \
        --connect-timeout 2 \
        "http://localhost:${DASHBOARD_PORT}/"; then
  echo "✗ Preview server did not respond within ~30s."
  echo "  See /tmp/dashboard-preview.log for the server output."
  exit 3
fi
echo "✓ Preview server ready."

# === Launch chromium kiosk ===============================================
#
# --kiosk = fullscreen, no browser chrome, no tab bar.
# We deliberately do NOT pass --headless: screen capture needs a visible
# window. On Linux CI, Xvfb provides the display; on macOS, the operator's
# real display.

echo "→ Launching chromium…"
"${CHROMIUM_BIN}" \
  --kiosk \
  --no-first-run \
  --no-default-browser-check \
  --disable-translate \
  --disable-infobars \
  --hide-scrollbars \
  --window-size=1920,1080 \
  --window-position=0,0 \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$(mktemp -d)" \
  "${DASHBOARD_URL}" \
  >/dev/null 2>&1 &
CHROMIUM_PID=$!

# Give chromium a beat to render the initial frame before we start capture.
sleep 2

# === Record =============================================================

echo "→ Recording ${DURATION}s @ 1080p60 → ${OUTPUT}"

# Audio track is optional. If the voiceover file is missing, record video-only.
HAS_AUDIO="false"
if [[ -f "${VOICEOVER}" ]]; then
  HAS_AUDIO="true"
  echo "  ↳ with voiceover: ${VOICEOVER}"
else
  echo "  ↳ no voiceover (file not found at ${VOICEOVER}) — video-only output"
fi

if [[ "${OSTYPE}" == "linux"* ]]; then
  # x11grab against the display the chromium window is on. DISPLAY env var
  # selects which X server (Xvfb in CI: usually :99).
  : "${DISPLAY:=:0}"
  if [[ "${HAS_AUDIO}" == "true" ]]; then
    ffmpeg -y -hide_banner -loglevel warning \
      -f x11grab -video_size 1920x1080 -framerate 60 -i "${DISPLAY}+0,0" \
      -i "${VOICEOVER}" \
      -t "${DURATION}" \
      -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -shortest \
      "${OUTPUT}" || { echo "✗ ffmpeg failed"; exit 4; }
  else
    ffmpeg -y -hide_banner -loglevel warning \
      -f x11grab -video_size 1920x1080 -framerate 60 -i "${DISPLAY}+0,0" \
      -t "${DURATION}" \
      -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p \
      "${OUTPUT}" || { echo "✗ ffmpeg failed"; exit 4; }
  fi

elif [[ "${OSTYPE}" == "darwin"* ]]; then
  # AVFoundation device 1 is usually the primary display on modern macOS.
  # Override via AVF_DEVICE env var when this isn't the case.
  AVF_DEVICE="${AVF_DEVICE:-1}"
  # Crop to the chromium window's region (top-left 1920×1080) instead of
  # scaling the entire desktop — scaling distorts.
  if [[ "${HAS_AUDIO}" == "true" ]]; then
    ffmpeg -y -hide_banner -loglevel warning \
      -f avfoundation -capture_cursor 0 -framerate 60 -i "${AVF_DEVICE}:none" \
      -i "${VOICEOVER}" \
      -t "${DURATION}" \
      -vf "crop=1920:1080:0:0" \
      -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -shortest \
      "${OUTPUT}" || { echo "✗ ffmpeg failed"; exit 4; }
  else
    ffmpeg -y -hide_banner -loglevel warning \
      -f avfoundation -capture_cursor 0 -framerate 60 -i "${AVF_DEVICE}:none" \
      -t "${DURATION}" \
      -vf "crop=1920:1080:0:0" \
      -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p \
      "${OUTPUT}" || { echo "✗ ffmpeg failed"; exit 4; }
  fi

else
  echo "✗ Unsupported OS: ${OSTYPE}"
  exit 1
fi

# === Report =============================================================

SIZE="$(du -h "${OUTPUT}" | cut -f1)"
echo "✓ Recorded to ${OUTPUT} (${SIZE})"

# Soft-validate via ffprobe — catches "0-byte file" / "wrong codec" early.
if command -v ffprobe >/dev/null 2>&1; then
  echo "→ Quick validation via ffprobe…"
  ffprobe -hide_banner -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration -of default=noprint_wrappers=1 "${OUTPUT}" || true
fi

echo
echo "Next steps:"
echo "  1. Inspect: open ${OUTPUT}"
echo "  2. Validate: ./scripts/verify-recording.sh ${OUTPUT}"
echo "  3. Combine with voiceover (if recorded separately): ffmpeg -i ${OUTPUT} -i voice.mp3 -c:v copy -c:a aac final.mp4"
