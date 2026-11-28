import { Module } from '@nestjs/common';
import { ClientTelemetryController } from './client-telemetry.controller';

@Module({
  controllers: [ClientTelemetryController],
})
export class ClientTelemetryModule {}
