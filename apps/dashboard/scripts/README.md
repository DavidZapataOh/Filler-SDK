# Demo recording — operator manual

This directory contains the bash scripts that produce the demo MP4 from
the dashboard's replay mode (Plan 07). The pipeline:

```
[ Vite preview server ] → [ chromium kiosk ] → [ ffmpeg screen capture ] → recordings/demo-*.mp4
                                                  ↑
                                       (optional voiceover audio mux)
```

Quick start (assuming prerequisites installed):

```bash
cd apps/dashboard
bun install
bun run build
./scripts/record-demo.sh treasury 95
# → recordings/demo-treasury-YYYYMMDD-HHMMSS.mp4
```

---

## Prerequisites

### macOS (operator manual recording)

1. **ffmpeg** — `brew install ffmpeg`. Confirm with `ffmpeg -version`.
2. **Google Chrome or Chromium** — most operators already have Chrome:
   `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. The
   record script detects either.
3. **Screen Recording permission** — System Settings → Privacy & Security
   → Screen Recording. Grant access to **Terminal** (or whichever shell
   you'll run the script from). Without this, AVFoundation captures a
   black frame.
4. **AVFoundation device check** — the script defaults to device index `1`
   for the primary display. If your Mac reports a different index, list
   devices:
   ```bash
   ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep "video devices"
   ```
   then override via env var:
   ```bash
   AVF_DEVICE=2 ./scripts/record-demo.sh treasury
   ```

### Linux (CI or operator manual)

1. **ffmpeg + chromium** —
   ```bash
   sudo apt-get install -y ffmpeg chromium-browser
   ```
2. **Display** — for unattended/CI runs, use Xvfb:
   ```bash
   sudo apt-get install -y xvfb
   Xvfb :99 -screen 0 1920x1080x24 &
   DISPLAY=:99 ./scripts/record-demo.sh treasury
   ```
   For an operator at a terminal session, `DISPLAY` is already set.

---

## What gets recorded

The script:

1. Builds the dashboard (`bun run build`).
2. Starts Vite preview server on `:4173`. Waits for it to respond (curl
   `--retry-connrefused`, not `sleep`).
3. Launches chromium in `--kiosk` mode (fullscreen, no chrome) at
   `http://localhost:4173/?replay=<fixture>`.
4. Waits 2 s for the first frame to render.
5. Records `<duration>s` via x11grab (Linux) or AVFoundation (macOS) at
   1920×1080 @ 60 fps, libx264 crf 20 + AAC audio (if voiceover present).
6. Outputs to `./recordings/demo-<fixture>-<timestamp>.mp4`.
7. Cleans up chromium + preview server processes (trap on EXIT).

### Why NOT `--headless=new`?

The plan markdown sketches `--headless=new` chromium. **That's broken**
when combined with screen capture: headless chromium has no display, so
x11grab / AVFoundation captures whatever is on the operator's actual
desktop (or an empty Xvfb). For screen capture to see the page, chromium
needs a visible window — `--kiosk` gives us fullscreen-no-chrome.

If you specifically need headless rendering (e.g. for CI without Xvfb),
use the Chrome DevTools Protocol's `Page.startScreencast` or Playwright's
built-in `page.video()` instead. See "Alternative paths" below.

---

## Verifying a recording

After `record-demo.sh` finishes:

```bash
./scripts/verify-recording.sh recordings/demo-treasury-*.mp4 95
```

Checks: 1920×1080, ≥ 30 fps, has video stream, has audio stream (warn-only),
duration within ±2 s of the expected.

---

## Voiceover

Three text scripts in this directory:

| File | Fixture | Duration |
|---|---|---|
| `voiceover-treasury.txt` | treasury rebalance | ~90 s |
| `voiceover-lvr.txt` | LVR-aware solver | ~90 s |
| `voiceover-simple.txt` | simple JIT | ~90 s |

Three production paths:

1. **Manual** (recommended for the final): record yourself with a USB mic +
   Audacity or QuickTime. Save as `voiceover-treasury.mp3` next to this
   README. The recording script auto-muxes when present.
2. **AI TTS** (good for iteration): ElevenLabs / OpenAI TTS produce
   passable voiceovers in 30 s. Use during demo rehearsals to validate
   timing; switch to a manual take for the final.
3. **Hybrid**: AI for the first half (factual recital), manual for the
   close (where emotion matters).

`voiceover-*.txt` includes `[mm:ss]` timecodes per beat. The recording
script does NOT enforce sync — operator drives that during the read.

---

## Fallback: pre-recorded segments

If live recording fails (chromium crash, audio drift, sync issue mid-take),
record each section separately into `recordings/01-hero.mp4`,
`recordings/02-stats.mp4`, etc., then concat:

```bash
cat > /tmp/segments.txt <<EOF
file 'recordings/01-hero.mp4'
file 'recordings/02-stats.mp4'
file 'recordings/03-counter.mp4'
file 'recordings/04-chart.mp4'
file 'recordings/05-files.mp4'
EOF

./scripts/concat-segments.sh /tmp/segments.txt recordings/demo-final.mp4
```

All segments must use the same codec / resolution / framerate. If they
don't, re-encode first:
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 20 -c:a aac normalized.mp4
```

---

## Honest scope notes

- **macOS recording is fragile**. AVFoundation device indexing varies
  across macOS versions; Screen Recording permission must be re-granted
  after Terminal updates; multi-display setups may capture the wrong
  screen. If the operator has a non-default setup, expect ~10 minutes
  of `ffmpeg -list_devices` debugging.
- **Determinism**: the React layer is byte-deterministic (Plan 07's
  fixtures bake all timestamps + cumulative totals). The MP4 output is
  not byte-identical across runs — render scheduling + ffmpeg encoder
  variance introduce frame-level differences. The visual is the same;
  the bytes are not.
- **Recording size**: at 1080p60, crf 20, libx264-slow, expect ~120-180 MB
  for a 95-second clip. The plan's 200 MB acceptance criterion is met
  with ~15 % headroom. If you need < 100 MB, bump crf to 23-25 (visible
  quality drop on dense scenes).
- **No CI guarantee for recording itself**. The CI workflow runs the
  pipeline on Linux with Xvfb + uploads the artifact, but we don't
  visual-diff the output. For the final demo, the operator does a
  manual review pass.

---

## Alternative paths (Sprint 06+ polish)

The current pipeline (chromium kiosk + screen capture) is fragile but
ships zero new TS deps. Cleaner alternatives if needed:

1. **Playwright `page.video()`** — `bun add -D playwright`, ~10 lines of
   TS to record a deterministic WebM, then transcode to MP4 with ffmpeg.
   Cross-platform, no Xvfb needed. Adds ~150 MB chromium download.
2. **Puppeteer + `Page.startScreencast`** — base64 JPEG frames at 30 fps
   max. Lower quality than ffmpeg but fully headless.
3. **Real chromium + DevTools Protocol** — programmatic control of any
   visible chromium window. More setup; offers tab-aware capture.

Defer until Plan 08's bash pipeline proves insufficient.
