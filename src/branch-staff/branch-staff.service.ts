import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignBranchStaffDto } from './dto/assign-branch-staff.dto';
import { BranchStaffAssignment } from './entities/branch-staff-assignment.entity';

@Injectable()
export class BranchStaffService {
  constructor(
    @InjectRepository(BranchStaffAssignment)
    private readonly assignmentsRepository: Repository<BranchStaffAssignment>,
  ) {}

  async assign(branchId: number, dto: AssignBranchStaffDto) {
    const assignment = this.assignmentsRepository.create({
      branchId,
      userId: dto.userId,
      role: dto.role,
      permissions: dto.permissions ?? [],
    });
    return this.assignmentsRepository.save(assignment);
  }

  async findByBranch(branchId: number) {
    return this.assignmentsRepository.find({
      where: { branchId },
      order: { createdAt: 'DESC' },
      relations: { user: true, branch: true },
    });
  }
}
