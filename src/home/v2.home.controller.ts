import { Controller, Get, Header, Query } from '@nestjs/common';
import { HomeService } from './home.service';

// Routes here are mounted under global prefix '/api'
@Controller('v2/home')
export class HomeV2Controller {
  constructor(private readonly home: HomeService) {}

  // New unified home feed endpoint
  @Get('feed')
  @Header('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120')
  async v2Feed(@Query() q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const perPage = Math.min(Math.max(Number(q.limit || q.per_page) || 20, 1), 50);
    const city = q.userCity || q.city || undefined;
    const region = q.userRegion || q.region || undefined;
    const country = q.userCountry || q.country || undefined;

    const data = await this.home.getV2HomeFeed({
      page,
      perPage,
      userCity: city,
      userRegion: region,
      userCountry: country,
    });
    return data;
  }
}
