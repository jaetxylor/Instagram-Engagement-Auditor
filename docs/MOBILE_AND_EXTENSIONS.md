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

## Mobile ergonomics

The extension adds mobile-only presentation overrides after launching the shared V4 UI:

- iPhone/iPad safe-area inset support
- minimum 44 px touch targets
- 16 px form controls to avoid unwanted iOS input zoom
- coarse-pointer/tap behavior
- touch-friendly expandable rows
- safe-area-aware toast positioning
- momentum scrolling and contained overscroll

These adjustments live in the extension delivery layer rather than forking the V4 analytics/product logic.

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

Apple's Safari Web Extension Packager can convert the generated `dist/web-extension/` folder into an Xcode project containing an iOS app and Safari extension.

CI performs this conversion on a macOS runner using the generated extension resources, then compiles the resulting app and extension for the iOS Simulator without signing.

The packager currently applies the requested bundle identifier to the extension while deriving a different containing-app identifier from the app name. Because an embedded iOS extension must use a child identifier of its containing app, `scripts/fix-safari-project.mjs` normalizes the generated project to:

```text
Containing app: com.jaetxylor.engagementauditor.dev
Safari extension: com.jaetxylor.engagementauditor.dev.Extension
```

The normalization is fail-closed and covered by tests so a future Apple project-format change cannot silently rewrite unrelated identifiers.

On a Mac with a current Xcode toolchain:

```bash
npm run validate
xcrun safari-web-extension-packager \
  --ios-only \
  --swift \
  --copy-resources \
  --no-open \
  --no-prompt \
  --force \
  --app-name "Engagement Auditor" \
  --bundle-identifier "com.jaetxylor.engagementauditor.dev" \
  --project-location "$PWD/build/safari" \
  "$PWD/dist/web-extension"

PBXPROJ="$(find build/safari -name project.pbxproj -print -quit)"
node scripts/fix-safari-project.mjs "$PBXPROJ" com.jaetxylor.engagementauditor.dev
```

### CI packaging status

The automated Safari packaging gate currently verifies that:

- the V4 WebExtension build and safety checks pass
- Apple's Safari packager accepts the extension
- a valid Xcode project is generated
- the app embeds a single Safari extension product
- app/extension bundle identifiers have the required parent-child relationship
- the generated app and extension compile successfully for a generic iOS Simulator destination with signing disabled

The remaining Safari packager warnings are branding-only: the extension manifest does not yet provide final icon assets or a large icon. Those should be resolved when the production Engagement Auditor icon is finalized rather than with a disposable placeholder.

Do not commit generated signing credentials, provisioning profiles, developer certificates, or private App Store configuration to this repository.

The generated Xcode project remains a CI/release artifact; the WebExtension source is the source of truth.

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
