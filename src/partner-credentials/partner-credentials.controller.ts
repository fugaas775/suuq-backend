import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../auth/roles.enum';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePartnerCredentialDto } from './dto/create-partner-credential.dto';
import {
  PartnerCredentialListQueryDto,
  PartnerCredentialSortField,
  SortDirection,
} from './dto/partner-credential-list-query.dto';
import { PartnerCredentialPageResponseDto } from './dto/partner-credential-page-response.dto';
import { PartnerCredentialResponseDto } from './dto/partner-credential-response.dto';
import { PartnerCredential } from './entities/partner-credential.entity';
import {
  PartnerCredentialStatus,
  PartnerType,
} from './entities/partner-credential.entity';
import {
  DEFAULT_POS_PARTNER_SCOPES,
  PosPartnerScope,
} from './partner-credential-scopes';
import { PartnerCredentialsService } from './partner-credentials.service';

@ApiTags('Admin Partner Credentials')
@Controller('admin/v1/partner-credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PartnerCredentialsController {
  constructor(
    private readonly partnerCredentialsService: PartnerCredentialsService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List partner credentials with assigned branch summary when available',
  })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiQuery({
    name: 'partnerType',
    enum: ['POS', 'SUPPLIER', 'INTERNAL'],
    required: false,
  })
  @ApiQuery({ name: 'status', enum: ['ACTIVE', 'REVOKED'], required: false })
  @ApiQuery({ name: 'branchId', type: Number, required: false })
  @ApiQuery({ name: 'search', type: String, required: false })
  @ApiQuery({
    name: 'sortBy',
    enum: PartnerCredentialSortField,
    required: false,
  })
  @ApiQuery({ name: 'sortDirection', enum: SortDirection, required: false })
  @ApiQuery({
    name: 'secondarySortBy',
    enum: PartnerCredentialSortField,
    required: false,
  })
  @ApiQuery({
    name: 'secondarySortDirection',
    enum: SortDirection,
    required: false,
  })
  @ApiOkResponse({
    type: PartnerCredentialPageResponseDto,
    content: {
      'application/json': {
        examples: {
          posCredentialsPage: {
            summary: 'POS credential page with branch summary',
            value: {
              items: [
                {
                  id: 10,
                  name: 'Front Lane Cashier',
                  partnerType: PartnerType.POS,
                  branchId: 3,
                  branch: {
                    id: 3,
                    name: 'Main Branch',
                    code: 'MB-01',
                    city: 'Mogadishu',
                    country: 'Somalia',
                  },
                  scopes: [PosPartnerScope.POS_CHECKOUT_READ],
                  status: PartnerCredentialStatus.ACTIVE,
                  lastUsedAt: '2026-04-01T00:10:00.000Z',
                  revokedAt: null,
                  revokedByUserId: null,
                  revocationReason: null,
                  createdAt: '2026-04-01T00:00:00.000Z',
                  updatedAt: '2026-04-01T00:05:00.000Z',
                },
              ],
              total: 1,
              page: 1,
              perPage: 20,
              totalPages: 1,
            },
          },
        },
      },
    },
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findAll(
    @Query() query: PartnerCredentialListQueryDto,
  ): Promise<PartnerCredentialPageResponseDto> {
    const result = await this.partnerCredentialsService.findAll(query);
    return {
      items: result.items.map((credential) => this.toResponseDto(credential)),
      total: result.total,
      page: result.page,
      perPage: result.perPage,
      totalPages: result.totalPages,
    };
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a partner credential; for POS terminals prefer scopePreset and reserve explicit scopes for advanced overrides',
  })
  @ApiBody({
    type: CreatePartnerCredentialDto,
    examples: {
      cashierTerminal: {
        summary: 'Standard cashier terminal',
        value: {
          name: 'Front Lane Cashier',
          partnerType: 'POS',
          branchId: 3,
          scopePreset: 'CASHIER_TERMINAL',
          keyHash: 'terminal-secret',
        },
      },
      syncOnlyTerminal: {
        summary: 'Inventory sync terminal',
        value: {
          name: 'Backroom Scanner',
          partnerType: 'POS',
          branchId: 3,
          scopePreset: 'SYNC_ONLY',
          keyHash: 'terminal-secret',
        },
      },
      customOverride: {
        summary: 'Advanced custom POS override',
        value: {
          name: 'Hybrid POS Device',
          partnerType: 'POS',
          branchId: 3,
          scopePreset: 'INVENTORY_TERMINAL',
          scopes: ['pos:checkout:write'],
          keyHash: 'terminal-secret',
        },
      },
    },
  })
  @ApiCreatedResponse({
    type: PartnerCredentialResponseDto,
    content: {
      'application/json': {
        examples: {
          cashierPresetResponse: {
            summary: 'Effective scopes returned for a cashier preset',
            value: {
              id: 11,
              name: 'Front Lane Cashier',
              partnerType: PartnerType.POS,
              branchId: 3,
              branch: null,
              scopes: DEFAULT_POS_PARTNER_SCOPES,
              status: PartnerCredentialStatus.ACTIVE,
              lastUsedAt: null,
              revokedAt: null,
              revokedByUserId: null,
              revocationReason: null,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:05:00.000Z',
            },
          },
        },
      },
    },
  })
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async create(
    @Body() dto: CreatePartnerCredentialDto,
  ): Promise<PartnerCredentialResponseDto> {
    const credential = await this.partnerCredentialsService.create(dto);
    return this.toResponseDto(credential);
  }

  private toResponseDto(
    credential: PartnerCredential,
  ): PartnerCredentialResponseDto {
    return {
      id: credential.id,
      name: credential.name,
      partnerType: credential.partnerType,
      branchId: credential.branchId ?? null,
      branch: credential.branch
        ? {
            id: credential.branch.id,
            name: credential.branch.name,
            code: credential.branch.code ?? null,
            city: credential.branch.city ?? null,
            country: credential.branch.country ?? null,
          }
        : null,
      scopes: credential.scopes ?? [],
      status: credential.status,
      lastUsedAt: credential.lastUsedAt ?? null,
      revokedAt: credential.revokedAt ?? null,
      revokedByUserId: credential.revokedByUserId ?? null,
      revocationReason: credential.revocationReason ?? null,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }
}
