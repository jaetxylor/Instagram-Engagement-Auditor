import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSafariBundleIdentifiers } from "../scripts/lib/safari-project.mjs";

const fixture = `
/* Debug app */
PRODUCT_BUNDLE_IDENTIFIER = "com.jaetxylor.engagementauditor.Engagement-Auditor";
/* Release app */
PRODUCT_BUNDLE_IDENTIFIER = "com.jaetxylor.engagementauditor.Engagement-Auditor";
/* Debug extension */
PRODUCT_BUNDLE_IDENTIFIER = com.jaetxylor.engagementauditor.dev.Extension;
/* Release extension */
PRODUCT_BUNDLE_IDENTIFIER = com.jaetxylor.engagementauditor.dev.Extension;
`;

test("Safari generated project normalizes containing app id while preserving child extension id", () => {
  const result = normalizeSafariBundleIdentifiers(fixture, {
    appBundleIdentifier: "com.jaetxylor.engagementauditor.dev"
  });

  assert.equal(result.appReplacements, 2);
  assert.equal(result.extensionMatches, 2);
  assert.equal(result.totalMatches, 4);
  assert.equal(
    (result.source.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.jaetxylor\.engagementauditor\.dev;/g) ?? []).length,
    2
  );
  assert.equal(
    (result.source.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.jaetxylor\.engagementauditor\.dev\.Extension;/g) ?? []).length,
    2
  );
  assert.doesNotMatch(result.source, /Engagement-Auditor/);
});

test("Safari identifier normalization rejects malformed identifiers", () => {
  assert.throws(
    () => normalizeSafariBundleIdentifiers(fixture, { appBundleIdentifier: "bad identifier" }),
    /Invalid app bundle identifier/
  );
});

test("Safari identifier normalization fails closed when generated project shape changes", () => {
  assert.throws(
    () => normalizeSafariBundleIdentifiers("PRODUCT_BUNDLE_IDENTIFIER = example.app;"),
    /Expected app and extension bundle identifiers/
  );
});
