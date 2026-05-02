#!/usr/bin/env bash
# concat-segments.sh — fallback path: stitch pre-recorded segment MP4s.
#
# When live recording fails (chromium crash, audio sync drift, ffmpeg
# permissions issue), this script combines a sequence of pre-recorded
# segment files into the final demo. Each segment is a polished take of
# a specific demo moment.
#
# Usage:
#   ./scripts/concat-segments.sh <segments.txt> [output.mp4]
#
# segments.txt format (one filename per line, ffmpeg concat-demuxer):
#
#     file '01-hero-before-after.mp4'
#     file '02-stat-killer.mp4'
#     file '03-dev-experience.mp4'
#     file '04-technical-primitive.mp4'
#     file '05-vision-close.mp4'
#
# Notes:
#   - All segments must use the same codec / resolution / framerate. If
#     they don't, ffmpeg's concat will fail. Re-encode mismatched segments
#     first via:
#       ffmpeg -i input.mp4 -c:v libx264 -crf 20 -c:a aac normalized.mp4
#   - The concat-demuxer (`-f concat`) is fast (no re-encode) but strict.
#     If you need to mix codecs, use the concat-FILTER instead — slower
#     but flexible.

set -euo pipefail

SEGMENTS="${1:-}"
OUTPUT="${2:-./recordings/demo-concat-$(date +%Y%m%d-%H%M%S).mp4}"

if [[ -z "${SEGMENTS}" || ! -f "${SEGMENTS}" ]]; then
  echo "usage: $0 <segments.txt> [output.mp4]"
  echo
  echo "segments.txt format:"
  echo "    file '01-hero.mp4'"
  echo "    file '02-stats.mp4'"
  echo "    ..."
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "✗ ffmpeg not found. See ./scripts/README.md."
  exit 1
fi

mkdir -p "$(dirname "${OUTPUT}")"

echo "→ Concatenating segments from ${SEGMENTS} → ${OUTPUT}"

ffmpeg -y -hide_banner -loglevel warning \
  -f concat -safe 0 -i "${SEGMENTS}" \
  -c copy \
  "${OUTPUT}"

echo "✓ Wrote ${OUTPUT} ($(du -h "${OUTPUT}" | cut -f1))"
echo "  Validate via: ./scripts/verify-recording.sh ${OUTPUT}"
