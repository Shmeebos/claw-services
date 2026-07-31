import assert from "node:assert/strict";
import test from "node:test";
import { LatestRequestCoordinator } from "./request-sequence";

test("invalidating an active request aborts it and prevents stale completion", () => {
  const coordinator = new LatestRequestCoordinator();
  const stale = coordinator.begin();

  coordinator.invalidate();

  assert.equal(stale.signal.aborted, true);
  assert.equal(stale.isCurrent(), false);
  assert.equal(stale.finish(), false);
});

test("only the latest request lease may commit or clear busy state", () => {
  const coordinator = new LatestRequestCoordinator();
  const first = coordinator.begin();
  const second = coordinator.begin();

  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(first.finish(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);
  assert.equal(second.finish(), true);
  assert.equal(second.isCurrent(), false);
});
