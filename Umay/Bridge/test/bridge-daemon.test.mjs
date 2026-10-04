import { strict as assert } from "node:assert";
import test from "node:test";

import { nodeMajor, reconnectDelayMs } from "../src/index.mjs";

test("reconnectDelayMs uses capped exponential backoff", () => {
  const first = reconnectDelayMs(1, { minMs: 100, maxMs: 1000, jitterMs: 0 });
  const second = reconnectDelayMs(2, { minMs: 100, maxMs: 1000, jitterMs: 0 });
  const capped = reconnectDelayMs(20, { minMs: 100, maxMs: 1000, jitterMs: 0 });

  assert.equal(first, 100);
  assert.equal(second, 200);
  assert.equal(capped, 1000);
});

test("nodeMajor parses runtime major version", () => {
  assert.equal(nodeMajor("22.11.0"), 22);
  assert.equal(nodeMajor("20.18.1"), 20);
});
