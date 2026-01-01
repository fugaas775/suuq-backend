import { Injectable, NotImplementedException, Logger } from '@nestjs/common';
import { ShippingCarrier } from '../common/enums/shipping-carrier.enum';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  /**
   * Future integration point for real shipping label generation.
   * This will interface with DHL, FedEx, UPS, etc. APIs.
   */
  async generateLabel(
    carrier: ShippingCarrier | string,
    senderAddress: any,
    recipientAddress: any,
    parcelDetails: any,
  ): Promise<{
    trackingNumber: string;
    trackingUrl: string;
    labelUrl: string;
  }> {
    // Log the inputs to avoid unused var errors and for debugging
    this.logger.log(
      `Generating label for ${carrier} from ${JSON.stringify(senderAddress)} to ${JSON.stringify(recipientAddress)} with details ${JSON.stringify(parcelDetails)}`,
    );

    // TODO: Implement real API calls here based on 'carrier'
    // Example:
    // if (carrier === ShippingCarrier.DHL) { return this.dhlService.createShipment(...); }

    // SIMULATION MODE (Until API keys are provided)
    // This allows the frontend to switch to the API call immediately.
    const isSimulation = true;
    if (isSimulation) {
      // Simulate async delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      const mockTrackingNumber = `MOCK-${carrier}-${Date.now()}`;
      const mockUrl = this.formatTrackingUrl(carrier, mockTrackingNumber);
      return {
        trackingNumber: mockTrackingNumber,
        trackingUrl:
          mockUrl || `https://mock-tracking.com/${mockTrackingNumber}`,
        labelUrl: `https://mock-label-generator.com/${mockTrackingNumber}.pdf`,
      };
    }

    throw new NotImplementedException(
      `Real label generation for ${carrier} is not yet implemented on the backend.`,
    );
  }

  /**
   * Helper to format tracking URLs if the frontend doesn't provide them.
   * (Currently the Flutter frontend handles this, but good to have as backup)
   */
  formatTrackingUrl(
    carrier: string | ShippingCarrier,
    trackingNumber: string,
  ): string | null {
    switch (carrier as any) {
      case ShippingCarrier.S_CARRIER:
      case 'S Carrier':
        return `${process.env.SITE_URL}/tracking?id=${trackingNumber}`;
      case ShippingCarrier.DELIVERER:
      case 'Deliverer':
        return `${process.env.SITE_URL}/delivery?id=${trackingNumber}`;
      default:
        return null;
    }
  }
}
