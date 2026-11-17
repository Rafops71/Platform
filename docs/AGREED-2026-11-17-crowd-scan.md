# Agreed 17 Nov 2026: the crowd scan stops blocking pull requests

Owner decision, 17 Nov 2026 (by button, relayed by Supervisor 2, and confirmed by the owner in this session in his own words: "the speed test runs nightly only and no longer blocks each change"): the crowd scan ("Forty members at once", `scripts/crowd-scan.js`, 5000 ms speed limit) stops BLOCKING pull requests and runs NIGHTLY only. If the server is really slow it is still red in the nightly run. All other grid scans and checks stay on every pull request exactly as before. The 5000 ms limit is NOT changed.

Reason he accepted: staging is a small free-plan server whose speed drifts; the scan measures the server, not the code. Evidence (Builder 3, 17 Nov, job logs): the slowest-in-twenty answers were 3.4 to 4.0 s on 15 and 16 Nov, 4.1 to 4.8 s on passing runs of 17 Nov, and 5.2 to 7.0 s on four failing attempts on pull requests that changed no server-side code; removing about 92,000 old test rows from staging did not help (6.4 to 7.0 s afterwards).

What changed: the step "Forty members at once" is gone from the grid job in `.github/workflows/ci.yml`; it stays in `.github/workflows/security-grid.yml` (nightly and by hand). `scripts/check-ci-targets.js` now requires exactly that difference and fails the build if the scan reappears in the pull-request grid or is missing from the nightly.
