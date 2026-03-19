import { MetricsV2Controller } from './metrics-v2.controller';
import { FeedInteractionService } from './feed-interaction.service';

describe('MetricsV2Controller', () => {
  let controller: MetricsV2Controller;
  let feedInteractionService: { logInteraction: jest.Mock };

  beforeEach(() => {
    feedInteractionService = {
      logInteraction: jest.fn().mockResolvedValue(undefined),
    };

    controller = new MetricsV2Controller(
      feedInteractionService as unknown as FeedInteractionService,
    );
  });

  it('normalizes snake_case request_id from the raw body', async () => {
    const dto = { productId: 101, action: 'impression' } as any;
    const req = {
      user: { id: '42' },
      body: {
        productId: 101,
        action: 'impression',
        request_id: ' feed-req-123 ',
      },
      headers: {},
    };

    await controller.logFeedInteraction(dto, req);

    expect(feedInteractionService.logInteraction).toHaveBeenCalledWith(
      {
        productId: 101,
        action: 'impression',
        requestId: 'feed-req-123',
      },
      '42',
    );
  });

  it('falls back to the home request id header when the body does not include one', async () => {
    const dto = { productId: 202, action: 'impression' } as any;
    const req = {
      user: undefined,
      body: {
        productId: 202,
        action: 'impression',
      },
      headers: {
        'x-home-request-id': ' home-header-789 ',
      },
    };

    await controller.logFeedInteraction(dto, req);

    expect(feedInteractionService.logInteraction).toHaveBeenCalledWith(
      {
        productId: 202,
        action: 'impression',
        requestId: 'home-header-789',
      },
      undefined,
    );
  });

  it('preserves an explicit dto requestId over fallback sources', async () => {
    const dto = {
      productId: 303,
      action: 'click',
      requestId: 'dto-request-id',
    } as any;
    const req = {
      user: { id: 7 },
      body: {
        productId: 303,
        action: 'click',
        request_id: 'ignored-body-id',
      },
      headers: {
        'x-home-request-id': 'ignored-header-id',
      },
    };

    await controller.logFeedInteraction(dto, req);

    expect(feedInteractionService.logInteraction).toHaveBeenCalledWith(
      {
        productId: 303,
        action: 'click',
        requestId: 'dto-request-id',
      },
      7,
    );
  });
});
