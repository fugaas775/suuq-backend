import { Controller, Get, Header } from '@nestjs/common';
import { SERVICE_FORMATS } from '../common/service-formats';

/**
 * Publishes the shared service-format vocabulary to consumer clients.
 *
 * Both the Suuq S app and POS-S used to hardcode their own copy, which is how
 * `PROPERTY_RENTAL` and `PRINTING_PRESS` ended up creatable in POS-S but
 * unrenderable in the app. Clients keep a bundled fallback for cold start; this
 * is the authority.
 *
 * Public and heavily cacheable — the vocabulary changes on deploy, not per user.
 */
@Controller('consumer/v1/service-formats')
export class ConsumerServiceFormatController {
  @Get()
  @Header(
    'Cache-Control',
    'public, s-maxage=3600, stale-while-revalidate=86400',
  )
  listServiceFormats() {
    return { items: SERVICE_FORMATS };
  }
}
