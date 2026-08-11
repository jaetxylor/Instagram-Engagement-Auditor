import test from "node:test";
import assert from "node:assert/strict";
import { defineConnector, requireCapability } from "../src/connectors/contract.mjs";

test("connector advertises supported capabilities", () => {
  const connector = defineConnector({
    id: "browser-instagram",
    version: "4.0.0",
    sourceType: "browser",
    capabilities: ["account", "followers", "following", "posts"],
    methods: {
      async getAccountContext() { return { id: "1" }; },
      async listFollowers() { return []; },
      async listFollowing() { return []; },
      async listPosts() { return []; }
    }
  });

  assert.equal(connector.supports("followers"), true);
  assert.equal(connector.supports("aggregate_insights"), false);
  assert.equal(requireCapability(connector, "posts"), connector);
});

test("unknown capabilities are rejected", () => {
  assert.throws(() => defineConnector({
    id: "bad",
    version: "1",
    sourceType: "browser",
    capabilities: ["magic"]
  }), /Unknown connector capability/);
});

test("advertised capabilities require their implementation methods", () => {
  assert.throws(() => defineConnector({
    id: "broken",
    version: "1",
    sourceType: "browser",
    capabilities: ["posts"],
    methods: {}
  }), /requires methods\.listPosts/);
});

test("missing capability produces an explicit runtime error", () => {
  const connector = defineConnector({
    id: "import",
    version: "1",
    sourceType: "import",
    capabilities: ["posts"],
    methods: {
      async listPosts() { return []; }
    }
  });

  assert.throws(() => requireCapability(connector, "followers"), /does not support capability/);
});
