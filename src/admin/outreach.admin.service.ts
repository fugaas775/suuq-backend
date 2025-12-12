import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SupplyOutreachTask,
  SupplyOutreachStatus,
} from './entities/supply-outreach-task.entity';
import { CreateOutreachTaskDto } from './dto/create-outreach-task.dto';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { User } from '../users/entities/user.entity';

interface CreateTaskOptions extends CreateOutreachTaskDto {
  createdByAdminId: number;
}

@Injectable()
export class AdminOutreachService {
  constructor(
    @InjectRepository(SupplyOutreachTask)
    private readonly tasksRepo: Repository<SupplyOutreachTask>,
    @InjectRepository(ProductRequest)
    private readonly requestRepo: Repository<ProductRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private sanitizePayload(
    payload?: Record<string, any>,
  ): Record<string, any> | null {
    if (!payload || typeof payload !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return null;
    }
  }

  async createTask(options: CreateTaskOptions): Promise<SupplyOutreachTask> {
    const {
      requestIds,
      createdByAdminId,
      term,
      assignedVendorId,
      note,
      payload,
    } = options;
    const uniqueRequestIds = Array.from(new Set(requestIds)).filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (!uniqueRequestIds.length) {
      throw new BadRequestException(
        'requestIds must include at least one valid id',
      );
    }

    const requests = await this.requestRepo.find({
      where: { id: In(uniqueRequestIds) },
    });
    if (!requests.length) {
      throw new NotFoundException(
        'No product requests were found for the provided requestIds',
      );
    }

    const missing = uniqueRequestIds.filter(
      (id) => !requests.some((req) => req.id === id),
    );
    if (missing.length) {
      throw new BadRequestException(
        `Unknown product request ids: ${missing.join(', ')}`,
      );
    }

    let assignedVendor: User | null = null;
    if (typeof assignedVendorId === 'number') {
      assignedVendor = await this.userRepo.findOne({
        where: { id: assignedVendorId },
      });
      if (!assignedVendor) {
        throw new BadRequestException(
          'assignedVendorId does not reference an existing user',
        );
      }
    }

    const locationCounts = new Map<
      string,
      { country: string | null; city: string | null; count: number }
    >();
    for (const req of requests) {
      const country = (req.preferredCountry || '').toUpperCase() || null;
      const city = req.preferredCity || null;
      const key = `${country || '??'}:${city || '??'}`;
      const entry = locationCounts.get(key) || { country, city, count: 0 };
      entry.count += 1;
      locationCounts.set(key, entry);
    }

    const summaryPayload = {
      requestCount: requests.length,
      latestRequestAt: requests.reduce<Date | null>((latest, req) => {
        if (!req.createdAt) return latest;
        return !latest || req.createdAt > latest ? req.createdAt : latest;
      }, null),
      locations: Array.from(locationCounts.values()).sort(
        (a, b) => b.count - a.count,
      ),
    };

    const task = this.tasksRepo.create({
      term,
      status: SupplyOutreachStatus.PENDING,
      requestIds: uniqueRequestIds,
      requestCount: requests.length,
      payload: {
        ...summaryPayload,
        ...(this.sanitizePayload(payload) || {}),
      },
      note: note || null,
      createdByAdmin: { id: createdByAdminId } as User,
      createdByAdminId,
      ...(assignedVendor
        ? {
            assignedVendor,
            assignedVendorId: assignedVendor.id,
            assignedAt: new Date(),
            status: SupplyOutreachStatus.ASSIGNED,
          }
        : {}),
    });

    const saved = await this.tasksRepo.save(task);
    return this.tasksRepo.findOne({
      where: { id: saved.id },
      relations: ['createdByAdmin', 'assignedVendor'],
    });
  }
}
