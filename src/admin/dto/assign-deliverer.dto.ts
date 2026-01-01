import { Transform } from 'class-transformer';
import { IsInt } from 'class-validator';

/**
 * Normalizes any of the accepted client keys to delivererId and validates it.
 * Accepted keys: delivererId, userId, deliverer_id, assigneeId, driverId, courierId
 */
export class AssignDelivererDto {
  @Transform(({ obj }) => {
    const val =
      obj?.delivererId ??
      obj?.userId ??
      obj?.deliverer_id ??
      obj?.assigneeId ??
      obj?.driverId ??
      obj?.courierId;
    return val !== undefined && val !== null && val !== ''
      ? Number(val)
      : undefined;
  })
  @IsInt({ message: 'delivererId must be an integer' })
  delivererId!: number;
}
