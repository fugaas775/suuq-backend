import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ChatMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ChatMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    if (req.originalUrl.includes('/api/chat/start')) {
      this.logger.log(
        `Incoming chat request body: ${JSON.stringify(req.body)}`,
      );
    }
    next();
  }
}
