#!/usr/bin/env bash
# verify-recording.sh — ffprobe-based MP4 validation.
#
# Usage:
#   ./scripts/verify-recording.sh <path-to-mp4> [expected-duration-s]
#
# Checks:
#   - File exists + is non-empty
#   - Has a video stream at 1920×1080
#   - Frame rate ≥ 30 (we record 60 but be lenient — some encoders cap)
#   - Has an audio stream (warn-only if absent — voiceover may be missing)
#   - Duration within ±2s of expected (when provided)
#
# Exit:
#   0  all hard checks pass
#   1  missing input file
#   2  ffprobe missing
#   3  hard validation failure

set -euo pipefail

INPUT="${1:-}"
EXPECTED_DURATION="${2:-}"

if [[ -z "${INPUT}" ]]; then
  echo "usage: $0 <path-to-mp4> [expected-duration-s]"
  exit 1
fi
if [[ ! -f "${INPUT}" ]]; then
  echo "✗ File not found: ${INPUT}"
  exit 1
fi
if [[ ! -s "${INPUT}" ]]; then
  echo "✗ File is empty: ${INPUT}"
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "✗ ffprobe not found. Install ffmpeg (which ships ffprobe)."
  exit 2
fi

echo "→ Validating ${INPUT}"

# === Video stream =========================================================

VIDEO_INFO="$(ffprobe -hide_banner -v error \
  -select_streams v:0 \
  -show_entries stream=width,height,r_frame_rate,codec_name \
  -of default=noprint_wrappers=1:nokey=0 \
  "${INPUT}" || true)"

if [[ -z "${VIDEO_INFO}" ]]; then
  echo "✗ No video stream found."
  exit 3
fi

WIDTH="$(echo "${VIDEO_INFO}" | awk -F= '/^width=/{print $2}')"
HEIGHT="$(echo "${VIDEO_INFO}" | awk -F= '/^height=/{print $2}')"
RATE="$(echo "${VIDEO_INFO}" | awk -F= '/^r_frame_rate=/{print $2}')"
CODEC="$(echo "${VIDEO_INFO}" | awk -F= '/^codec_name=/{print $2}')"

# Frame rate is rational like "60/1" — convert to float-ish comparison.
RATE_NUM="${RATE%/*}"
RATE_DEN="${RATE#*/}"
RATE_FPS="$(awk "BEGIN { printf \"%.1f\", ${RATE_NUM}/${RATE_DEN} }")"

echo "  video: ${CODEC} ${WIDTH}×${HEIGHT} @ ${RATE_FPS}fps"

PASS=true
if [[ "${WIDTH}" != "1920" || "${HEIGHT}" != "1080" ]]; then
  echo "  ✗ Expected 1920×1080, got ${WIDTH}×${HEIGHT}"
  PASS=false
fi

# Lenient: ≥ 30fps. We record 60 but x264 sometimes encodes effective fps lower.
if (( $(echo "${RATE_FPS} < 30" | bc -l 2>/dev/null || echo 0) )); then
  echo "  ✗ Frame rate ${RATE_FPS} < 30"
  PASS=false
fi

# === Audio stream =========================================================

AUDIO_INFO="$(ffprobe -hide_banner -v error \
  -select_streams a:0 \
  -show_entries stream=codec_name,sample_rate \
  -of default=noprint_wrappers=1:nokey=0 \
  "${INPUT}" 2>/dev/null || true)"

if [[ -n "${AUDIO_INFO}" ]]; then
  AUDIO_CODEC="$(echo "${AUDIO_INFO}" | awk -F= '/^codec_name=/{print $2}')"
  AUDIO_RATE="$(echo "${AUDIO_INFO}" | awk -F= '/^sample_rate=/{print $2}')"
  echo "  audio: ${AUDIO_CODEC} @ ${AUDIO_RATE}Hz"
else
  echo "  audio: (none — recorded video-only)"
fi

# === Duration =============================================================

DURATION="$(ffprobe -hide_banner -v error \
  -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 \
  "${INPUT}")"

DURATION_INT="${DURATION%.*}"
SIZE_BYTES="$(stat -f%z "${INPUT}" 2>/dev/null || stat -c%s "${INPUT}" 2>/dev/null)"
SIZE_MB="$(awk "BEGIN { printf \"%.1f\", ${SIZE_BYTES}/1024/1024 }")"

echo "  duration: ${DURATION_INT}s, size: ${SIZE_MB} MB"

if [[ -n "${EXPECTED_DURATION}" ]]; then
  DELTA="$(awk "BEGIN { d = ${DURATION_INT} - ${EXPECTED_DURATION}; print (d < 0) ? -d : d }")"
  if (( $(echo "${DELTA} > 2" | bc -l 2>/dev/null || echo 0) )); then
    echo "  ✗ Duration ${DURATION_INT}s differs from expected ${EXPECTED_DURATION}s by ${DELTA}s"
    PASS=false
  fi
fi

# === Verdict ==============================================================

if [[ "${PASS}" == "true" ]]; then
  echo "✓ Validation passed."
  exit 0
else
  echo "✗ Validation failed."
  exit 3
fi
