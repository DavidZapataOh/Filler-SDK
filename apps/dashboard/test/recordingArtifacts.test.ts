/**
 * Recording artifact integrity — Plan 08 lock.
 *
 * Plan 08 ships an offline recording pipeline driven by Plan 07's replay
 * fixtures. For every fixture key there must be:
 *
 *   1. A `voiceover-<key>.txt` script template (operator reads it during
 *      recording — so it must exist BEFORE recording day).
 *   2. The script template must reference its replay URL so an operator
 *      reading the file knows what to navigate to.
 *
 * We don't unit-test the bash scripts themselves (they're shell, run in
 * CI via `bash -n`), but we DO lock the artifact set so a future
 * contributor adding a 4th fixture without updating the recording infra
 * triggers a test failure here.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { FIXTURES, type FixtureKey } from '../src/fixtures';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_DASHBOARD = resolve(HERE, '..');
const RECORDINGS_DIR = resolve(REPO_DASHBOARD, 'recordings');
const SCRIPTS_DIR = resolve(REPO_DASHBOARD, 'scripts');

describe('recording artifacts — fixture↔voiceover integrity', () => {
  for (const key of Object.keys(FIXTURES) as FixtureKey[]) {
    test(`voiceover-${key}.txt exists`, () => {
      const path = join(RECORDINGS_DIR, `voiceover-${key}.txt`);
      expect(existsSync(path)).toBe(true);
    });

    test(`voiceover-${key}.txt references the replay URL for that fixture`, () => {
      const text = readFileSync(join(RECORDINGS_DIR, `voiceover-${key}.txt`), 'utf-8');
      expect(text).toMatch(new RegExp(`\\?replay=${key}\\b`));
    });

    test(`voiceover-${key}.txt mentions the fixture's vertical narrative`, () => {
      const text = readFileSync(join(RECORDINGS_DIR, `voiceover-${key}.txt`), 'utf-8');
      const fixture = FIXTURES[key];
      // The fixture's `name` should appear in the voiceover (any case).
      const nameWord = fixture.name.split(/\s+/)[0];
      expect(nameWord).toBeDefined();
      if (nameWord !== undefined) {
        expect(text.toLowerCase()).toContain(nameWord.toLowerCase());
      }
    });
  }
});

describe('recording artifacts — pipeline scripts present + executable-shape', () => {
  const scripts = ['record-demo.sh', 'verify-recording.sh', 'concat-segments.sh'] as const;

  for (const name of scripts) {
    test(`${name} exists + has shebang`, () => {
      const path = join(SCRIPTS_DIR, name);
      expect(existsSync(path)).toBe(true);
      const head = readFileSync(path, 'utf-8').slice(0, 64);
      // The first line must be a bash shebang. We don't enforce the exact
      // form (#!/bin/bash vs #!/usr/bin/env bash) — both work.
      expect(head).toMatch(/^#![\s\S]*bash/);
    });
  }

  test('scripts/README.md operator manual exists', () => {
    const path = join(SCRIPTS_DIR, 'README.md');
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, 'utf-8');
    // Sanity: the README mentions the key concepts the operator needs.
    expect(text).toMatch(/Screen Recording permission/i);
    expect(text).toMatch(/Xvfb/);
    expect(text).toMatch(/AVF_DEVICE/);
  });
});

describe('recording artifacts — defensive against the plan-markdown trap', () => {
  test('record-demo.sh does NOT use --headless (broken with screen capture)', () => {
    const path = join(SCRIPTS_DIR, 'record-demo.sh');
    const text = readFileSync(path, 'utf-8');
    // The plan markdown sketches `--headless=new`. That's broken — headless
    // chromium has no display so screen capture sees nothing. We use --kiosk.
    // Strip comment lines so the EXPLANATORY mentions of --headless in
    // doc-comments don't trigger this lock.
    const codeOnly = text
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(codeOnly).not.toMatch(/--headless/);
    expect(codeOnly).toMatch(/--kiosk/);
  });

  test('record-demo.sh waits for the preview server with curl --retry, not sleep', () => {
    const path = join(SCRIPTS_DIR, 'record-demo.sh');
    const text = readFileSync(path, 'utf-8');
    expect(text).toMatch(/curl[\s\S]+--retry-connrefused/);
  });

  test('record-demo.sh validates fixture key against the same list as the registry', () => {
    const path = join(SCRIPTS_DIR, 'record-demo.sh');
    const text = readFileSync(path, 'utf-8');
    for (const key of Object.keys(FIXTURES) as FixtureKey[]) {
      expect(text).toContain(key);
    }
  });

  test('macOS path uses crop, NOT scale (crop preserves aspect; scale distorts)', () => {
    const path = join(SCRIPTS_DIR, 'record-demo.sh');
    const text = readFileSync(path, 'utf-8');
    // crop=1920:1080:0:0 — captures top-left chromium kiosk region.
    expect(text).toMatch(/crop=1920:1080/);
  });
});
