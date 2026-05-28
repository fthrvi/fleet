import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLaunchCommand } from "./shell-cd";

test("no cwd → command unchanged", () => {
  assert.equal(buildLaunchCommand("claude"), "claude");
  assert.equal(buildLaunchCommand("claude", null), "claude");
  assert.equal(buildLaunchCommand("claude", ""), "claude");
});

test("~ home is preserved unquoted; subpath single-quoted", () => {
  assert.equal(buildLaunchCommand("claude", "~"), "cd ~ && claude");
  assert.equal(buildLaunchCommand("claude", "~/projects/omni"), "cd ~/'projects/omni' && claude");
});

test("absolute path is single-quoted (spaces safe)", () => {
  assert.equal(buildLaunchCommand("claude", "/abs/path with space"), "cd '/abs/path with space' && claude");
});

test("shell metacharacters in cwd are neutralized (no injection)", () => {
  assert.equal(buildLaunchCommand("ls", "/tmp/$(whoami)"), "cd '/tmp/$(whoami)' && ls");
  assert.equal(buildLaunchCommand("ls", "/a`id`b"), "cd '/a`id`b' && ls");
  assert.equal(buildLaunchCommand("ls", "/a'b"), "cd '/a'\\''b' && ls");
});
