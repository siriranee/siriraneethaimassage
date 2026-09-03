import type {
  CmsBookingHold,
  CmsBookingOccupancy,
  CmsClosure,
} from "@/domain/cms/types";

type TransactionalAvailabilityReader = {
  listBookingOccupancy(
    from: string,
    to: string,
  ): Promise<readonly CmsBookingOccupancy[]>;
  listActiveHolds(nowIso: string): Promise<readonly CmsBookingHold[]>;
  listClosures(from?: string, to?: string): Promise<readonly CmsClosure[]>;
};

/**
 * Read availability inputs strictly in sequence. MongoDB does not support
 * parallel operations that share one transaction session.
 */
export async function readTransactionalAvailability(
  repository: TransactionalAvailabilityReader,
  localDate: string,
  nowIso: string,
) {
  const bookings = await repository.listBookingOccupancy(localDate, localDate);
  const holds = await repository.listActiveHolds(nowIso);
  const closures = await repository.listClosures(localDate, localDate);

  return { bookings, holds, closures } as const;
}
