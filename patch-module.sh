sed -i '/export class AppModule/i import { ChatMiddleware } from "./chat/chat.middleware";\nimport { MiddlewareConsumer, RequestMethod } from "@nestjs/common";\n' src/app.module.ts
sed -i 's/export class AppModule {/export class AppModule {\n  configure(consumer: MiddlewareConsumer) {\n    consumer\n      .apply(ChatMiddleware)\n      .forRoutes("chat\/start");\n  }/g' src/app.module.ts
