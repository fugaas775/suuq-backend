module.exports = {
  apps: [
    {
      name: 'suuq-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',

        // DigitalOcean Spaces configuration - loaded from environment
        DO_SPACES_KEY: process.env.DO_SPACES_KEY,
        DO_SPACES_SECRET: process.env.DO_SPACES_SECRET,
        DO_SPACES_REGION: process.env.DO_SPACES_REGION || 'ams3',
        DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET,
        DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT,

        // Database configuration - loaded from environment
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || '5432',
        DB_USERNAME: process.env.DB_USERNAME,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,

        // JWT configuration - loaded from environment
        JWT_SECRET: process.env.JWT_SECRET,
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '3600s',

        // Application configuration
        PORT: process.env.PORT || '3000',
        HOST: process.env.HOST || '0.0.0.0',
      },
    },
  ],
};
