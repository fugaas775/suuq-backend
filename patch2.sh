sed -i 's/from "\.\/common\/middleware\/app-version\.middleware";/from ".\/common\/middleware\/app-version.middleware";\nimport { ChatMiddleware } from ".\/chat\/chat.middleware";/g' src/app.module.ts
sed -i 's/consumer.apply(AppVersionMiddleware).forRoutes('\*');/consumer.apply(AppVersionMiddleware).forRoutes('\*');\n    consumer.apply(ChatMiddleware).forRoutes('\*');/g' src/app.module.ts
