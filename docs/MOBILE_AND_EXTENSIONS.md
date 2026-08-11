# Mobile and WebExtension client

V4 treats mobile/extension delivery as another client of the shared audit platform. The analytics engine, connector, persistence, reporting and V4 UI stay shared; the extension adds only browser packaging and launch controls.

## Targets

### iPhone / iPad

Primary mobile collector target: **Safari Web Extension** packaged inside an iOS/iPadOS app.

The extension source in `apps/web-extension/` uses standard WebExtension files so it can be packaged for Safari rather than maintaining a separate mobile auditor implementation.

### Desktop

The same package is intended to work as a Manifest V3 extension in Chrome/Edge for private testing and, later, normal extension-store distribution.

### Android

Do not make the commercial Android strategy depend on Chrome extensions. The long-term Android experience should be the cloud/web/mobile client backed by supported account connectors. Browser-side collection can be revisited only where a supported browser extension environment exists.

## User experience

1. Install/enable Engagement Auditor.
2. Open `instagram.com` and sign in normally.
3. Tap/click the browser extension button.
4. Tap **Run Engagement Audit**.
5. The existing V4 auditor opens over the Instagram page.

No Developer Tools, snippet, console paste, or copied JavaScript is required.

## Permission model

The extension deliberately requests a narrow permission set:

- `activeTab`
- Instagram host access only
- one content script on Instagram pages

It does **not** request `<all_urls>` and does not ship a generic cross-origin request proxy.

The content script is injected at `document_idle` but remains dormant until it receives the explicit launch message from the toolbar popup.

## Code policy

All executable extension logic is packaged locally. Do not introduce:

- remotely hosted scripts
- `eval()` / `new Function()`
- downloaded executable logic
- arbitrary URL fetch proxies
- automated follow/unfollow/like/comment/DM mutations

CI verifies these constraints against the generated package.

## Build

```bash
npm run build:extension
npm run verify:extension
```

Generated package:

```text
dist/web-extension/
├── manifest.json
├── content.js
├── popup.html
├── popup.css
└── popup.js
```

`content.js` is generated from the same modular V4 source used by the copyable browser build. It is not maintained by hand.

## Desktop Chrome / Edge development test

1. Run `npm run build:extension`.
2. Open the browser's extensions management page.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select `dist/web-extension/`.
6. Open Instagram and sign in.
7. Click the Engagement Auditor extension button and choose **Run Engagement Audit**.

## Safari / iOS packaging

Apple's current Safari Web Extension Packager can convert the generated `dist/web-extension/` folder into an Xcode project containing an iOS app and Safari extension.

On a Mac with a current Xcode toolchain:

```bash
npm run validate
xcrun safari-web-extension-packager --ios-only --swift dist/web-extension
```

The packager can also be given `--project-location`, `--app-name`, and `--bundle-identifier` when those release values are finalized.

Do not commit generated signing credentials, provisioning profiles, developer certificates, or private App Store configuration to this repository.

Apple also provides a web-based Safari Web Extension Packager through App Store Connect, which can later be used for TestFlight/App Store packaging without making the generated Xcode project the source of truth.

## Architecture boundary

```text
                         Shared V4 platform
               analytics · product · reporting
                           storage
                              │
                     browser runtime
                              │
              ┌───────────────┴───────────────┐
              │                               │
       Copyable browser JS             WebExtension client
                                              │
                                   ┌──────────┴──────────┐
                                   │                     │
                              Chrome / Edge         Safari iOS
```

The WebExtension is a delivery mechanism, not a fork of the analytics product.

## Commercial path

The extension can later become the bridge between browser-side audience audits and Engagement Auditor Cloud:

- sign-in/account linking
- upload of user-approved completed audit summaries
- audit history
- agency/client workspaces
- scheduled reports
- alerts and longitudinal analytics

Those cloud features belong behind explicit authentication/consent and must not be added by silently uploading data from the community extension.
