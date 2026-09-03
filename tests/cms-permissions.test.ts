import assert from "node:assert/strict";
import test from "node:test";

import {
  canCmsRole,
  getCmsRoleDescription,
  isCmsRole,
} from "@/domain/cms/permissions";

test("administrator and staff permissions stay separated", () => {
  assert.equal(canCmsRole("administrator", "users:manage"), true);
  assert.equal(canCmsRole("administrator", "content:publish"), true);
  assert.equal(canCmsRole("staff", "bookings:write"), true);
  assert.equal(canCmsRole("administrator", "bookings:delete"), true);
  assert.equal(canCmsRole("staff", "bookings:delete"), false);
  assert.equal(canCmsRole("staff", "calendar:write"), true);
  assert.equal(canCmsRole("staff", "users:manage"), false);
  assert.equal(canCmsRole("staff", "content:publish"), false);
  assert.equal(canCmsRole(undefined, "dashboard:view"), false);
});

test("role validation rejects untrusted values", () => {
  assert.equal(isCmsRole("administrator"), true);
  assert.equal(isCmsRole("staff"), true);
  assert.equal(isCmsRole("owner"), false);
  assert.match(getCmsRoleDescription("staff"), /bookings and calendar/i);
});
