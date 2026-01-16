
import { Test, TestingModule } from '@nestjs/testing';
import { AdminProductRequestsController } from './product-requests.admin.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductRequest } from '../product-requests/entities/product-request.entity';
import { ProductRequestForward } from '../product-requests/entities/product-request-forward.entity';
import { User, SubscriptionTier } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException } from '@nestjs/common';

describe('AdminProductRequestsController - Forward Validation', () => {
    let controller: AdminProductRequestsController;
    let mockUserRepo: any;
    let mockForwardRepo: any;
    let mockRequestRepo: any;

    beforeEach(async () => {
        mockUserRepo = {
            find: jest.fn(),
        };
        mockForwardRepo = {
            find: jest.fn().mockResolvedValue([]),
            create: jest.fn(),
            save: jest.fn(),
        };
        mockRequestRepo = {
            findOne: jest.fn().mockResolvedValue({ id: 1, title: 'Test Request' }),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AdminProductRequestsController],
            providers: [
                { provide: getRepositoryToken(ProductRequest), useValue: mockRequestRepo },
                { provide: getRepositoryToken(ProductRequestForward), useValue: mockForwardRepo },
                { provide: getRepositoryToken(User), useValue: mockUserRepo }, // Mock User Repo
                { provide: NotificationsService, useValue: { sendToUser: jest.fn() } },
            ],
        }).compile();

        controller = module.get<AdminProductRequestsController>(AdminProductRequestsController);
    });

    it('should throw BadRequestException if forwarding to non-PRO vendor', async () => {
        const vendorId = 123;
        const dto = { vendorIds: [vendorId] };
        const req: any = { user: { id: 999 } }; // Admin

        // Mock User Repo to return a FREE tier vendor
        mockUserRepo.find.mockResolvedValue([
            { id: vendorId, subscriptionTier: SubscriptionTier.FREE }
        ]);

        await expect(controller.forward(1, dto, req)).rejects.toThrow(BadRequestException);
    });

    it('should succeed if forwarding to PRO vendor', async () => {
        const vendorId = 456;
        const dto = { vendorIds: [vendorId] };
        const req: any = { user: { id: 999 } };

         // Mock User Repo to return a PRO tier vendor
        mockUserRepo.find.mockResolvedValue([
            { id: vendorId, subscriptionTier: SubscriptionTier.PRO }
        ]);

        await controller.forward(1, dto, req);

        expect(mockForwardRepo.save).toHaveBeenCalled();
    });
});
