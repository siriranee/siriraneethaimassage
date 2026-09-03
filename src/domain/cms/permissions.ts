import { cmsRoles, type CmsRole } from "@/domain/cms/types";

export const cmsPermissions = [
  "dashboard:view",
  "bookings:view",
  "bookings:write",
  "bookings:delete",
  "calendar:view",
  "calendar:write",
  "content:view",
  "content:write",
  "content:publish",
  "settings:view",
  "settings:write",
  "users:manage",
  "audit:view",
] as const;

export type CmsPermission = (typeof cmsPermissions)[number];

const rolePermissions: Readonly<Record<CmsRole, readonly CmsPermission[]>> = {
  administrator: cmsPermissions,
  staff: [
    "dashboard:view",
    "bookings:view",
    "bookings:write",
    "calendar:view",
    "calendar:write",
    "content:view",
    "settings:view",
  ],
};

export function isCmsRole(value: unknown): value is CmsRole {
  return (
    typeof value === "string" &&
    cmsRoles.some((role) => role === value)
  );
}

export function canCmsRole(
  role: CmsRole | undefined,
  permission: CmsPermission,
) {
  return Boolean(role && rolePermissions[role].includes(permission));
}

export function getCmsRoleLabel(role: CmsRole) {
  return role === "administrator" ? "Administrator" : "Staff";
}

export function getCmsRoleDescription(role: CmsRole) {
  return role === "administrator"
    ? "Full CMS, publishing, security and user-management access."
    : "Manage bookings and calendar availability; view website content.";
}
