import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchShift } from './entities/branch-shift.entity';
import { BranchShiftStaff } from './entities/branch-shift-staff.entity';
import { BranchStaffService } from './branch-staff.service';
import {
  CreateBranchShiftDto,
  UpdateBranchShiftDto,
} from './dto/branch-shift.dto';

type Actor = {
  id: number | null;
  email?: string | null;
  roles?: string[];
};

/**
 * Parse a UTC-offset string like "+3", "+03:30", "-5" into total offset minutes.
 * Returns null if the string is not in offset format.
 */
function parseUtcOffsetMinutes(tz: string): number | null {
  const match = tz.trim().match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const sign = match[1] === '+' ? 1 : -1;
  const h = parseInt(match[2], 10);
  const m = parseInt(match[3] ?? '0', 10);
  return sign * (h * 60 + m);
}

function parseIntlParts(
  nowUtc: Date,
  ianaTimezone: string,
): { day: number; totalMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(nowUtc);

  const dayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  // hour12:false can return "24" for midnight — normalize to 0
  const hour =
    parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const minute = parseInt(
    parts.find((p) => p.type === 'minute')?.value ?? '0',
    10,
  );

  const DAY_MAP: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    day: DAY_MAP[dayStr] ?? nowUtc.getUTCDay(),
    totalMinutes: hour * 60 + minute,
  };
}

/**
 * Parse a branch-local time from a UTC Date + branch timezone value.
 * Handles:
 *   - IANA timezone names (e.g. "Africa/Nairobi")
 *   - UTC offset strings (e.g. "+3", "+03:30", "-5")
 *   - null/empty → falls back to the server's local timezone
 */
function getBranchLocalMinutes(
  nowUtc: Date,
  timezone: string | null,
): { day: number; totalMinutes: number } {
  const tz = timezone?.trim() || '';

  // 1. Try as IANA name
  if (tz) {
    try {
      return parseIntlParts(nowUtc, tz);
    } catch {
      // not a valid IANA name — fall through
    }
  }

  // 2. Try as numeric UTC offset ("+3", "+05:30", "-8", etc.)
  if (tz) {
    const offsetMin = parseUtcOffsetMinutes(tz);
    if (offsetMin !== null) {
      const localMs = nowUtc.getTime() + offsetMin * 60_000;
      const local = new Date(localMs);
      return {
        day: local.getUTCDay(),
        totalMinutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
      };
    }
  }

  // 3. Fallback: use server's local timezone (so null-TZ branches use the
  //    same timezone as the machine the backend runs on)
  try {
    const serverTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return parseIntlParts(nowUtc, serverTz);
  } catch {
    // Absolute last resort: UTC
    return {
      day: nowUtc.getUTCDay(),
      totalMinutes: nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes(),
    };
  }
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns true if the given local time (day + totalMinutes) falls within
 * the shift's active window. Handles overnight shifts (startTime > endTime).
 */
export function isWithinShiftWindow(
  shift: { startTime: string; endTime: string; daysOfWeek: string[] },
  day: number,
  totalMinutes: number,
): boolean {
  const activeDays = new Set(shift.daysOfWeek.map((d) => String(d)));
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);

  if (start <= end) {
    // Normal window (same day)
    if (!activeDays.has(String(day))) return false;
    return totalMinutes >= start && totalMinutes < end;
  } else {
    // Overnight: shift started on previous day
    const prevDay = (day + 6) % 7;
    if (activeDays.has(String(day)) && totalMinutes >= start) return true;
    if (activeDays.has(String(prevDay)) && totalMinutes < end) return true;
    return false;
  }
}

@Injectable()
export class BranchShiftService {
  constructor(
    @InjectRepository(BranchShift)
    private readonly shiftsRepo: Repository<BranchShift>,
    @InjectRepository(BranchShiftStaff)
    private readonly shiftStaffRepo: Repository<BranchShiftStaff>,
    private readonly branchStaffService: BranchStaffService,
  ) {}

  // ---- Shift CRUD --------------------------------------------------------

  async findByBranch(branchId: number) {
    return this.shiftsRepo.find({
      where: { branchId },
      relations: ['staffAssignments', 'staffAssignments.user'],
      order: { createdAt: 'ASC' },
    });
  }

  async create(branchId: number, dto: CreateBranchShiftDto, actor: Actor) {
    await this.branchStaffService.assertCanManageBranchStaff(actor, branchId);
    const shift = this.shiftsRepo.create({
      branchId,
      name: dto.name,
      startTime: dto.startTime,
      endTime: dto.endTime,
      daysOfWeek: dto.daysOfWeek.map(String),
    });
    return this.shiftsRepo.save(shift);
  }

  async update(
    branchId: number,
    shiftId: number,
    dto: UpdateBranchShiftDto,
    actor: Actor,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(actor, branchId);
    const shift = await this.shiftsRepo.findOne({
      where: { id: shiftId, branchId },
    });
    if (!shift) throw new NotFoundException('Shift not found.');
    if (dto.name !== undefined) shift.name = dto.name;
    if (dto.startTime !== undefined) shift.startTime = dto.startTime;
    if (dto.endTime !== undefined) shift.endTime = dto.endTime;
    if (dto.daysOfWeek !== undefined)
      shift.daysOfWeek = dto.daysOfWeek.map(String);
    return this.shiftsRepo.save(shift);
  }

  async remove(branchId: number, shiftId: number, actor: Actor) {
    await this.branchStaffService.assertCanManageBranchStaff(actor, branchId);
    const shift = await this.shiftsRepo.findOne({
      where: { id: shiftId, branchId },
    });
    if (!shift) throw new NotFoundException('Shift not found.');
    await this.shiftsRepo.remove(shift);
  }

  // ---- Staff assignment --------------------------------------------------

  async assignStaff(
    branchId: number,
    shiftId: number,
    userId: number,
    actor: Actor,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(actor, branchId);
    const shift = await this.shiftsRepo.findOne({
      where: { id: shiftId, branchId },
    });
    if (!shift) throw new NotFoundException('Shift not found.');

    const existing = await this.shiftStaffRepo.findOne({
      where: { shiftId, userId },
    });
    if (existing)
      throw new ConflictException('Staff already assigned to this shift.');

    const record = this.shiftStaffRepo.create({ shiftId, branchId, userId });
    return this.shiftStaffRepo.save(record);
  }

  async removeStaff(
    branchId: number,
    shiftId: number,
    userId: number,
    actor: Actor,
  ) {
    await this.branchStaffService.assertCanManageBranchStaff(actor, branchId);
    const record = await this.shiftStaffRepo.findOne({
      where: { shiftId, userId },
    });
    if (!record)
      throw new NotFoundException('Staff not assigned to this shift.');
    await this.shiftStaffRepo.remove(record);
  }

  async getShiftsForStaff(
    branchId: number,
    userId: number,
  ): Promise<BranchShift[]> {
    const records = await this.shiftStaffRepo.find({
      where: { branchId, userId },
      relations: ['shift'],
    });
    return records.map((r) => r.shift).filter(Boolean);
  }

  // ---- Shift enforcement -------------------------------------------------

  /**
   * Returns true if the user has NO shift assignments for this branch
   * (unscheduled = always allowed) OR if the current branch-local time falls
   * within at least one active assigned shift window.
   */
  async isUserAllowedNow(
    branchId: number,
    userId: number,
    nowUtc: Date,
    timezone: string | null,
  ): Promise<boolean> {
    const assignments = await this.shiftStaffRepo.find({
      where: { branchId, userId },
      relations: ['shift'],
    });

    // No shifts assigned → no restriction
    if (!assignments.length) return true;

    const { day, totalMinutes } = getBranchLocalMinutes(nowUtc, timezone);

    return assignments
      .filter((a) => a.shift?.isActive)
      .some((a) => isWithinShiftWindow(a.shift, day, totalMinutes));
  }
}
