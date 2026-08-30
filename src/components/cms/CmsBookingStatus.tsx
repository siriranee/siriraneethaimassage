import type { BookingStatus } from "@/domain/cms/types";
import { CmsStatusBadge } from "@/components/cms/CmsUi";

const tones = {
  pending: "warning",
  confirmed: "success",
  completed: "purple",
  cancelled: "danger",
  "no-show": "neutral",
} as const;

export function CmsBookingStatus({ status }: Readonly<{ status: BookingStatus }>) {
  const label = status === "no-show"
    ? "No-show"
    : status.charAt(0).toUpperCase() + status.slice(1);

  return <CmsStatusBadge label={label} tone={tones[status]} />;
}
