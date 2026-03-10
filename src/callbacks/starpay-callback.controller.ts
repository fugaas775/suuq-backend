import { Body, Controller, Headers, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StarpayWebhookDto } from '../starpay/starpay.dto';
import { StarpayService } from '../starpay/starpay.service';

@ApiTags('Callbacks')
@Controller('callbacks/starpay')
export class StarpayCallbackController {
  private readonly logger = new Logger(StarpayCallbackController.name);

  constructor(private readonly starpayService: StarpayService) {}

  @Post('webhook')
  @ApiOperation({ summary: 'StarPay payment webhook' })
  async handleWebhook(
    @Body() body: StarpayWebhookDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    this.logger.log('Received StarPay webhook callback');
    return this.starpayService.handleWebhook(headers, body);
  }
}
