function unquote(value) {
  const text = String(value ?? "").trim();
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
  return text;
}

export function normalizeSafariBundleIdentifiers(source, {
  appBundleIdentifier = "com.jaetxylor.engagementauditor.dev"
} = {}) {
  if (typeof source !== "string" || !source.length) {
    throw new TypeError("A generated Xcode project.pbxproj source string is required.");
  }
  if (!/^[A-Za-z0-9.-]+$/.test(appBundleIdentifier) || !appBundleIdentifier.includes(".")) {
    throw new TypeError(`Invalid app bundle identifier: ${appBundleIdentifier}`);
  }

  const extensionBundleIdentifier = `${appBundleIdentifier}.Extension`;
  let appReplacements = 0;
  let extensionMatches = 0;
  let totalMatches = 0;

  const output = source.replace(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g, (full, rawValue) => {
    totalMatches += 1;
    const current = unquote(rawValue);

    if (current === extensionBundleIdentifier) {
      extensionMatches += 1;
      return `PRODUCT_BUNDLE_IDENTIFIER = ${extensionBundleIdentifier};`;
    }

    // Apple's Safari Web Extension Packager may derive the containing app id
    // from the app name while applying --bundle-identifier to the extension.
    // The embedded extension must be a child of the containing app id, so the
    // generated app configurations are normalized to the explicit base id.
    appReplacements += 1;
    return `PRODUCT_BUNDLE_IDENTIFIER = ${appBundleIdentifier};`;
  });

  if (totalMatches < 4) {
    throw new Error(`Expected app and extension bundle identifiers in generated Xcode project; found ${totalMatches}.`);
  }
  if (extensionMatches < 2) {
    throw new Error(`Expected generated extension identifier ${extensionBundleIdentifier} in Debug and Release configurations; found ${extensionMatches}.`);
  }
  if (appReplacements < 2) {
    throw new Error(`Expected at least two containing-app bundle identifier configurations; replaced ${appReplacements}.`);
  }

  const remainingIdentifiers = [...output.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)]
    .map(match => unquote(match[1]));
  const unexpected = remainingIdentifiers.filter(value => ![
    appBundleIdentifier,
    extensionBundleIdentifier
  ].includes(value));

  if (unexpected.length) {
    throw new Error(`Unexpected bundle identifiers remain after normalization: ${[...new Set(unexpected)].join(", ")}`);
  }

  return {
    source: output,
    appBundleIdentifier,
    extensionBundleIdentifier,
    appReplacements,
    extensionMatches,
    totalMatches
  };
}
