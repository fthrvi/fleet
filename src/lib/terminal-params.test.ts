import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentTerminalQuery } from "./terminal-params";

test("parses machineId and cmd", () => {
  assert.deepEqual(parseAgentTerminalQuery("/?machineId=3&cmd=claude"), {
    machineId: 3,
    cmd: "claude",
  });
});

test("missing cmd yields null cmd", () => {
  assert.deepEqual(parseAgentTerminalQuery("/?machineId=5"), {
    machineId: 5,
    cmd: null,
  });
});

test("missing/invalid machineId yields null", () => {
  assert.deepEqual(parseAgentTerminalQuery("/?cmd=claude"), {
    machineId: null,
    cmd: "claude",
  });
  assert.deepEqual(parseAgentTerminalQuery("/?machineId=abc"), {
    machineId: null,
    cmd: null,
  });
});

test("url-decodes cmd", () => {
  assert.deepEqual(parseAgentTerminalQuery("/?machineId=1&cmd=claude%20--version"), {
    machineId: 1,
    cmd: "claude --version",
  });
});
