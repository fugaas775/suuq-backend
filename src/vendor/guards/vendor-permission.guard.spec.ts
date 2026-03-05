import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VendorPermissionGuard } from './vendor-permission.guard';
import { VendorStaffService } from '../vendor-staff.service';
import { VendorPermission } from '../vendor-permissions.enum';

describe('VendorPermissionGuard regression', () => {
  let guard: VendorPermissionGuard;
  const reflectorMock = {
    get: jest.fn(),
  } as unknown as Reflector;
  const vendorStaffServiceMock = {
    validateStaffPermission: jest.fn(),
  } as unknown as VendorStaffService;

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new VendorPermissionGuard(reflectorMock, vendorStaffServiceMock);
  });

  const makeContext = (request: any): any => ({
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  });

  it('uses body.vendorId when header is missing', async () => {
    (reflectorMock.get as jest.Mock).mockReturnValue(
      VendorPermission.MANAGE_PRODUCTS,
    );
    (
      vendorStaffServiceMock.validateStaffPermission as jest.Mock
    ).mockResolvedValue({
      vendor: { id: 77 },
    });

    const request = {
      user: { id: 10 },
      headers: {},
      body: { vendorId: 77 },
      query: {},
      params: {},
    };

    const ok = await guard.canActivate(makeContext(request));

    expect(ok).toBe(true);
    expect(vendorStaffServiceMock.validateStaffPermission).toHaveBeenCalledWith(
      10,
      77,
      VendorPermission.MANAGE_PRODUCTS,
    );
  });

  it('uses body.vendor_id alias when vendorId is absent', async () => {
    (reflectorMock.get as jest.Mock).mockReturnValue(undefined);
    (
      vendorStaffServiceMock.validateStaffPermission as jest.Mock
    ).mockResolvedValue({
      vendor: { id: 88 },
    });

    const request = {
      user: { id: 12 },
      headers: {},
      body: { vendor_id: '88' },
      query: {},
      params: {},
    };

    const ok = await guard.canActivate(makeContext(request));

    expect(ok).toBe(true);
    expect(vendorStaffServiceMock.validateStaffPermission).toHaveBeenCalledWith(
      12,
      88,
      undefined,
    );
  });

  it('prioritizes header x-vendor-id over body vendorId', async () => {
    (reflectorMock.get as jest.Mock).mockReturnValue(undefined);
    (
      vendorStaffServiceMock.validateStaffPermission as jest.Mock
    ).mockResolvedValue({
      vendor: { id: 99 },
    });

    const request = {
      user: { id: 20 },
      headers: { 'x-vendor-id': '99' },
      body: { vendorId: 77 },
      query: {},
      params: {},
    };

    const ok = await guard.canActivate(makeContext(request));

    expect(ok).toBe(true);
    expect(vendorStaffServiceMock.validateStaffPermission).toHaveBeenCalledWith(
      20,
      99,
      undefined,
    );
  });

  it('throws BadRequestException for invalid x-vendor-id header', async () => {
    (reflectorMock.get as jest.Mock).mockReturnValue(undefined);

    const request = {
      user: { id: 10 },
      headers: { 'x-vendor-id': 'not-a-number' },
      body: { vendorId: 77 },
      query: {},
      params: {},
    };

    await expect(
      guard.canActivate(makeContext(request)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      vendorStaffServiceMock.validateStaffPermission,
    ).not.toHaveBeenCalled();
  });
});
