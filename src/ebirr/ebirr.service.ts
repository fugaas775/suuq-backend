import { Injectable, Logger } from '@nestjs/common';
import { ebirrConfig } from './ebirr.config';
import axios from 'axios';

@Injectable()
export class EbirrService {
  private readonly logger = new Logger(EbirrService.name);

  /**
   * Simple connectivity check to the configured base URL.
   * Useful for verifying whitelisting and network reachability.
   */
  async checkConnectivity(): Promise<{ success: boolean; status?: number; data?: any }> {
    try {
      this.logger.log(`Checking connectivity to Ebirr at ${ebirrConfig.baseUrl}`);
      
      // We expect a 405 or 404 on the root, but not a timeout or connection refused
      const response = await axios.get(ebirrConfig.baseUrl, {
        validateStatus: (status) => true, // We just want to know if we reached the server
        timeout: 5000, // 5s timeout
      });

      this.logger.log(`Ebirr connectivity check response: ${response.status}`);
      
      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      this.logger.error('Ebirr connectivity failed', error);
      return {
        success: false,
      };
    }
  }

  // Placeholder for future implementation once docs are received
  async initiatePayment() {
    throw new Error('Not implemented');
  }
}
