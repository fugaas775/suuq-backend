import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { ActionPathNormalizationInterceptor } from './action-path-normalization.interceptor';

describe('ActionPathNormalizationInterceptor', () => {
  it('normalizes nested action payload paths onto the api surface', async () => {
    const interceptor = new ActionPathNormalizationInterceptor();
    const next: CallHandler = {
      handle: jest.fn(() =>
        of({
          actions: [
            {
              method: 'GET',
              path: '/retail/v1/ops/pos-operations?branchId=3',
            },
            {
              method: 'PATCH',
              path: '/admin/orders/77/cancel',
            },
            {
              method: 'POST',
              path: '/hub/v1/branch-transfers/12/dispatch',
            },
            {
              method: 'GET',
              path: '/payments/ebirr/sync-status/77',
            },
          ],
          items: [
            {
              detailAction: {
                path: '/retail/v1/ops/desktop-workbench/transfers/301?branchId=3',
              },
            },
          ],
        }),
      ),
    };

    const result = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, next),
    );

    expect(result).toEqual({
      actions: [
        {
          method: 'GET',
          path: '/api/retail/v1/ops/pos-operations?branchId=3',
        },
        {
          method: 'PATCH',
          path: '/api/admin/orders/77/cancel',
        },
        {
          method: 'POST',
          path: '/api/hub/v1/branch-transfers/12/dispatch',
        },
        {
          method: 'GET',
          path: '/payments/ebirr/sync-status/77',
        },
      ],
      items: [
        {
          detailAction: {
            path: '/api/retail/v1/ops/desktop-workbench/transfers/301?branchId=3',
          },
        },
      ],
    });
  });
});
