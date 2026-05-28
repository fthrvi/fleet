import { test } from "node:test";
import assert from "node:assert/strict";
import { activeHubUpdates, parseModelEndpoints } from "./device-roles";

test("activeHubUpdates makes target the only active hub", () => {
  const machines = [{ id: 1, isActiveHub: true }, { id: 2, isActiveHub: false }, { id: 3, isActiveHub: false }];
  assert.deepEqual(activeHubUpdates(machines, 2), [
    { id: 1, isActiveHub: false },
    { id: 2, isActiveHub: true },
    { id: 3, isActiveHub: false },
  ]);
});

test("activeHubUpdates is idempotent when target already active", () => {
  const machines = [{ id: 1, isActiveHub: true }, { id: 2, isActiveHub: false }];
  assert.deepEqual(activeHubUpdates(machines, 1), [
    { id: 1, isActiveHub: true },
    { id: 2, isActiveHub: false },
  ]);
});

test("parseModelEndpoints accepts valid JSON array", () => {
  assert.deepEqual(parseModelEndpoints('[{"label":"ollama","baseUrl":"http://mac4:11434","model":"qwen"}]'), {
    ok: true,
    value: [{ label: "ollama", baseUrl: "http://mac4:11434", model: "qwen" }],
  });
});

test("parseModelEndpoints treats empty/whitespace/null as empty list", () => {
  assert.deepEqual(parseModelEndpoints("   "), { ok: true, value: [] });
  assert.deepEqual(parseModelEndpoints(null), { ok: true, value: [] });
});

test("parseModelEndpoints rejects non-array / malformed", () => {
  assert.equal(parseModelEndpoints("{}").ok, false);
  assert.equal(parseModelEndpoints("not json").ok, false);
  assert.equal(parseModelEndpoints('[{"baseUrl":123}]').ok, false);
});
