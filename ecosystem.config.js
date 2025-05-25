module.exports = {
  apps: [
    {
      name: 'suuq-api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',

        // 🧪 Add your DO Spaces env variables
        DO_SPACES_KEY: 'DO801GGW792RM67CLUAY',
        DO_SPACES_SECRET: 'meHAE57djKanTGkYMGBG3+bfKGypAwTRRWuHl4vKEjE',
        DO_SPACES_REGION: 'ams3',
        DO_SPACES_BUCKET: 'suuq-media',
        DO_SPACES_ENDPOINT: 'https://ams3.digitaloceanspaces.com',

        // ✅ Add your DB config too
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USERNAME: 'postgres',
        DB_PASSWORD: 'password',
        DB_NAME: 'suuq_db',
      },
    },
  ],
};
