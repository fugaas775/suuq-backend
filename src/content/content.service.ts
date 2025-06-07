import { Injectable } from '@nestjs/common';

interface Banner {
  id: number;
  imageUrl: string;
  title: string;
}

@Injectable()
export class ContentService {
  getHomeBanners(): Banner[] {
    return [
      { id: 1, imageUrl: 'https://example.com/banner1.jpg', title: 'Banner 1' },
      { id: 2, imageUrl: 'https://example.com/banner2.jpg', title: 'Banner 2' },
    ];
  }
}