# Functional validation

On 2026-10-07, the first build passed a real-model smoke check in Chromium
141.0.7390.37 on macOS. The check imported the pinned model folder through the
setup UI, verified the assets, enabled local-file access, closed the browser,
restarted it, blocked HTTP requests, and set the browser context offline.

Results:

- Cached GLiNER2 inference found the exact synthetic name and email expected
  by the readiness check. This check requires model results, not regex fallback.
- The saved HTML fixture produced five masks: a name, address, two emails,
  and a phone number. Original page markup and input values were preserved.
- Changing page content added a new name/email pair and triggered a rescan.
- Manual selection masking and scrolling to new content completed offline.
- Restore removed the overlay and left the source page intact.
- The monitored browser context attempted zero HTTP/HTTPS requests during
  the offline phase.
- Rendered setup, mosaic, and blurred loading screenshots were visually inspected.
- The updated browser check delivered model-loading and intermediate scan
  progress to the content script. The first scan reported every completed
  text block in order, and progress stayed within its actual total during
  cached rescans, dynamic content, and scrolling.
- TypeScript checks and six contract tests passed, including real-tokenizer
  parity with the pinned upstream tensor fixture.

The isolated headless harness adds a local-file origin permission to represent
the permission a user grants by invoking the extension. The distributed
manifest uses activeTab and does not include that test-only permission.
Native OS shortcut handling remains for manual testing.

This establishes functional browser-offline behavior with a cold model load.
It is not an accuracy benchmark, a physical network isolation test, or a claim
that all personal information on all websites will be found. False positives,
missed entities, language quality, complex layouts, animations, and memory/
latency on other devices need evaluation. Images and closed shadow roots are
outside this version's automatic detection scope.

Reproduce with README.md's development commands. The harness writes synthetic
screenshots and a JSON evidence record into ignored artifacts/.
