export const CONNECTOR_CAPABILITIES = Object.freeze([
  "account",
  "followers",
  "following",
  "posts",
  "like_identities",
  "comment_identities",
  "aggregate_insights",
  "profile_counts"
]);

const CAPABILITY_SET = new Set(CONNECTOR_CAPABILITIES);

export function defineConnector({
  id,
  version,
  sourceType,
  capabilities = [],
  methods = {}
} = {}) {
  if (!id) throw new TypeError("Connector id is required.");
  if (!version) throw new TypeError("Connector version is required.");
  if (!sourceType) throw new TypeError("Connector sourceType is required.");

  const normalizedCapabilities = [...new Set(capabilities.map(String))];
  for (const capability of normalizedCapabilities) {
    if (!CAPABILITY_SET.has(capability)) {
      throw new TypeError(`Unknown connector capability: ${capability}`);
    }
  }

  const connector = {
    id: String(id),
    version: String(version),
    sourceType: String(sourceType),
    capabilities: Object.freeze(normalizedCapabilities),
    supports(capability) {
      return normalizedCapabilities.includes(capability);
    },
    ...methods
  };

  return Object.freeze(connector);
}

export function assertConnector(connector) {
  if (!connector || typeof connector !== "object") throw new TypeError("Connector must be an object.");
  if (!connector.id || !connector.version || !connector.sourceType) throw new TypeError("Connector identity is incomplete.");
  if (!Array.isArray(connector.capabilities)) throw new TypeError("Connector capabilities must be an array.");
  if (typeof connector.supports !== "function") throw new TypeError("Connector must provide supports(capability).");
  return connector;
}

export function requireCapability(connector, capability) {
  assertConnector(connector);
  if (!connector.supports(capability)) {
    throw new Error(`Connector ${connector.id} does not support capability: ${capability}`);
  }
  return connector;
}
