import { Injectable } from '@nestjs/common';

@Injectable()
export class ContentService {
  getHomeBanners() {
    return [
      { id: 1, imageUrl: 'https://example.com/banner1.jpg', title: 'Banner 1' },
      { id: 2, imageUrl: 'https://example.com/banner2.jpg', title: 'Banner 2' },
    ];
  }
}
