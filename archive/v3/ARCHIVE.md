# V3 Fallback Archive

This folder is an immutable fallback snapshot of the last public V3 experience before V4 becomes the active product line.

Archived from `main` at commit `0c2848fc5c02dc5841175e9d3dfd29987a65c189`.

Contents:

- `instagram-engagement-auditor.js` — public V3 browser auditor
- `index.html` — public V3 GitHub Pages copy-code landing page
- `README.md` — public V3 documentation

## Rollback

If a future V4 release needs to be rolled back, restore these archived files to the repository root and validate the JavaScript before deployment.

```bash
cp archive/v3/instagram-engagement-auditor.js ./instagram-engagement-auditor.js
cp archive/v3/index.html ./index.html
cp archive/v3/README.md ./README.md
node --check instagram-engagement-auditor.js
```

Do not modify the files in this folder for normal V4 development. Create a new versioned archive folder for later major-version fallbacks.

Copyright 2026 @jaetxylor. Apache-2.0 applies from the repository root.
