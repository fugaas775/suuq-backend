import { Injectable, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface BusinessLicenseInfo {
  tradeName: string;
  legalCondition: string;
  capital: string;
  registeredDate: string;
  renewalDate: string;
  status: string;
}

@Injectable()
export class ETradeVerificationService {
  private readonly checkerUrl = 'https://etrade.gov.et/business-license-checker';

  async verifyLicense(licenseNumber: string): Promise<BusinessLicenseInfo> {
    try {
      const response = await axios.post(
        this.checkerUrl,
        `licenseNo=${encodeURIComponent(licenseNumber)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const $ = cheerio.load(response.data);
      const infoTable = $('table.bg-white');

      if (!infoTable.length) {
        throw new NotFoundException('License number not found or is invalid.');
      }

      const extractedData: any = {};
      infoTable.find('tr').each((i, el) => {
        const key = $(el).find('th').text().trim();
        const value = $(el).find('td').text().trim();
        if (key && value) {
          switch (key) {
            case 'Trade Name':
              extractedData.tradeName = value;
              break;
            case 'Legal Condition':
              extractedData.legalCondition = value;
              break;
            case 'Capital':
              extractedData.capital = value;
              break;
            case 'Registered Date':
              extractedData.registeredDate = value;
              break;
            case 'Renewal Date':
              extractedData.renewalDate = value;
              break;
            case 'Status':
              extractedData.status = value;
              break;
          }
        }
      });

      if (Object.keys(extractedData).length < 6) {
        throw new NotFoundException('Could not extract all required license details.');
      }
      
      if (extractedData.status !== 'Valid') {
        throw new NotFoundException(`License status is not 'Valid'. Current status: ${extractedData.status}`);
      }

      return extractedData as BusinessLicenseInfo;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error(`Verification failed: ${error.message}`);
    }
  }
}
