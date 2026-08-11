# Instagram Engagement Auditor

A read-only browser-based Instagram audit tool for analyzing follower relationships, post engagement, inactivity confidence, engagement-rate estimates, and follower/following ratios.

Created by [@jaetxylor](https://github.com/jaetxylor).

## Features

- Scan followers and following
- Identify accounts you follow that do not follow you back
- Scan likes and comments on your own posts
- Cross-check post engagement against your followers
- Separate accounts into high-confidence inactive, likely inactive, uncertain, low observed engagement, and active groups
- Measure identity-response coverage so incomplete Instagram responses are not treated as proof of inactivity
- Calculate a HypeAuditor-style profile engagement-rate estimate using recent post likes/comments and follower count
- Optional follower/following profile-ratio analysis
- Find followed accounts whose **following count is higher than their follower count**
- Export audit data to CSV and JSON
- Local browser-session processing; no external account database
- No automated follow, unfollow, like, comment, or DM actions

## Quick start

### Option A — Copy from the project page

If GitHub Pages is enabled for this repository:

1. Open the project page.
2. Click **Copy auditor code**.
3. Open [Instagram](https://www.instagram.com/) on desktop and log in.
4. Open Developer Tools.
5. Go to **Sources → Snippets**.
6. Create a new snippet.
7. Paste the copied code into the snippet.
8. Run the snippet.
9. The Engagement Auditor interface will open over Instagram.

Using a DevTools Snippet is recommended over repeatedly pasting code directly into the Console.

### Option B — Copy the JavaScript file directly

1. Open [`instagram-engagement-auditor.js`](./instagram-engagement-auditor.js).
2. Copy the entire file.
3. Open Instagram in your desktop browser and log in.
4. Open **Developer Tools → Sources → Snippets**.
5. Create a new snippet and paste the code.
6. Run the snippet.

## Core audit workflow

The scanner runs through five phases:

1. **Followers** — loads the accounts following you.
2. **Following** — loads the accounts you follow.
3. **Posts** — loads your profile posts.
4. **Engagement** — reads liker/commenter identities returned to your logged-in browser session.
5. **Scoring** — calculates engagement classifications, confidence, coverage, and profile-level metrics.

During relationship pagination, Instagram does not always expose the total number of pages in advance. The interface therefore shows the current phase and loaded-account count rather than pretending it knows an exact relationship-pagination percentage.

## Engagement classifications

A major goal of the auditor is to distinguish **absence of observed engagement** from **proof of inactivity**.

Depending on the interaction identity coverage returned by Instagram, followers may be classified as:

- **High-confidence inactive** — no observed likes/comments and strong identity coverage
- **Likely inactive** — no observed likes/comments with medium confidence
- **Uncertain** — no observed likes/comments, but coverage is too incomplete to make a strong negative claim
- **Low observed engagement** — some engagement exists, but it falls below the configured participation threshold
- **Active** — engagement exceeds the low-engagement threshold

The tool also displays per-post coverage diagnostics comparing the visible interaction totals with the liker/commenter identities Instagram actually returned.

## Engagement-rate estimate

The profile analytics section includes a **HypeAuditor-style ER estimate**.

The implementation is intentionally transparent:

```text
ER per post = (likes + comments) / followers × 100
```

It uses up to the 12 most recent usable posts, removes statistical outliers with the standard 1.5×IQR rule, and reports the median of the remaining per-post ER values.

This is an independent estimate inspired by the publicly described methodology. It is **not** an official HypeAuditor score and does not reproduce any proprietary scoring algorithm.

## Follow-ratio analysis

After the main audit completes, you can optionally enrich followed accounts with profile follower/following counts.

The ratio scanner can be scoped to groups such as:

- current filtered results
- high-confidence inactive accounts you follow
- likely inactive accounts you follow
- uncertain accounts you follow
- low-engagement accounts you follow
- accounts not following you back
- all accounts you follow

For enriched profiles, the auditor calculates:

```text
Following / Followers ratio
Following - Followers delta
```

and provides a dedicated view for followed accounts where:

```text
Following > Followers
```

Profile enrichment is optional because checking every followed account can require many additional authenticated requests.

## Exports

The auditor can export:

- follower engagement classifications
- observed likes/comments
- engagement participation rate
- confidence and coverage data
- relationship state
- profile follower/following counts when enriched
- following/follower ratio and delta
- profile-level engagement-rate metrics
- per-post coverage diagnostics

Exports are available as **CSV** and **JSON**.

## Privacy and safety

The project is designed as a read-only audit tool.

It does **not** intentionally:

- unfollow accounts
- follow accounts
- like posts
- comment on posts
- send DMs
- upload your follower data to an external server
- ask you to enter your Instagram password into the tool

The script operates inside your existing logged-in Instagram browser session and reads data available to that session.

## Important limitations

Instagram's private web endpoints are undocumented and can change without notice. Responses may also be incomplete, rate-limited, or unavailable for some accounts/posts.

Because of that:

- treat low-confidence negative results as unknown rather than definitive inactivity
- review coverage diagnostics before making decisions based on the results
- avoid repeatedly running large scans in a short period
- use the tool at your own risk

This project is independent and is not affiliated with, endorsed by, sponsored by, or officially connected with Instagram or Meta.

## GitHub Pages / copy button

This repository includes an `index.html` landing page with a **Copy auditor code** button.

To publish it with GitHub Pages:

1. Open the repository's **Settings**.
2. Open **Pages**.
3. Choose deployment from a branch.
4. Select the `main` branch and repository root.
5. Save the Pages configuration.

Once deployed, visitors can copy the current JavaScript directly from the landing page without manually opening the source file.

## Development

The project is intentionally lightweight and dependency-free.

Main files:

```text
instagram-engagement-auditor.js   Browser auditor
index.html                        Copy-code landing page
README.md                         Documentation
LICENSE                           Apache License 2.0
NOTICE                            Attribution notice
```

Before publishing changes to the main script, run a JavaScript syntax check such as:

```bash
node --check instagram-engagement-auditor.js
```

## License

Licensed under the **Apache License 2.0**. See [`LICENSE`](./LICENSE).

Copyright 2026 @jaetxylor.
