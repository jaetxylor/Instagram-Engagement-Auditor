# Release and Rollback Policy

This project keeps the currently public major version stable while the next major version is developed and validated separately.

## Major-version rule

Before a new major version becomes the public version:

1. The current public JavaScript artifact must be copied into `archive/vN/`.
2. The matching public landing page and README must be archived with it.
3. The archive must include rollback instructions and the source commit reference.
4. CI must syntax-check the archived JavaScript.
5. The new major version must remain on a development branch or draft pull request until its user-facing experience has reached feature parity and passed validation.
6. The archived version is treated as immutable. Fixes belong in the active version or a newly versioned archive, not by silently modifying old snapshots.

## Current fallback

V3 is archived at:

```text
archive/v3/
├── ARCHIVE.md
├── README.md
├── index.html
└── instagram-engagement-auditor.js
```

The archived V3 JavaScript blob is the exact same Git blob that powered the public V3 root artifact at the time V4 development began.

## Rollback procedure

If the active major version develops a production-blocking regression:

1. Stop promotion of the affected release.
2. Restore the previous version's archived root files.
3. Run the full validation workflow.
4. Confirm the GitHub Pages copy flow and browser launch flow.
5. Publish the rollback with a clear commit message identifying the reverted major version.
6. Fix the regression on a separate branch before promoting it again.

For V3 specifically:

```bash
cp archive/v3/instagram-engagement-auditor.js ./instagram-engagement-auditor.js
cp archive/v3/index.html ./index.html
cp archive/v3/README.md ./README.md
npm run validate
```

## Promotion gate for V4

V4 should not replace V3 on `main` until all of the following are true:

- Quick, Deep, and Custom audit modes work end to end.
- Resume / Start over works after interrupted engagement scans.
- Results reach functional parity with V3's essential read-only capabilities.
- Coverage/confidence behavior is validated against representative response fixtures.
- CSV and JSON export are available from the shared reporting layer.
- Follow-ratio analysis has a supported V4 workflow or is explicitly excluded from the release scope.
- The generated single-file browser artifact is reproducible from modular source.
- GitHub Pages copies the generated V4 artifact rather than development source files.
- CI is green.
- A manual browser smoke test is completed on Instagram in Chrome/Edge.

The objective is to make rollback boring and predictable rather than emergency reconstruction.
