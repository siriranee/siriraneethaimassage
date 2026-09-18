import type {
  CmsBookingOccupancy,
  CmsClosure,
} from "@/domain/cms/types";

type TransactionalAvailabilityReader = {
  listConfirmedBookingOccupancy(
    from: string,
    to: string,
  ): Promise<readonly CmsBookingOccupancy[]>;
  listClosures(from?: string, to?: string): Promise<readonly CmsClosure[]>;
};

/**
 * Read availability inputs strictly in sequence. MongoDB does not support
 * parallel operations that share one transaction session.
 */
export async function readTransactionalAvailability(
  repository: TransactionalAvailabilityReader,
  localDate: string,
) {
  const bookings = await repository.listConfirmedBookingOccupancy(
    localDate,
    localDate,
  );
  const closures = await repository.listClosures(localDate, localDate);

  return { bookings, closures } as const;
}
