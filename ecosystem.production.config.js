module.exports = {
  apps: [
    {
      name: 'suuq-api',
      script: './dist/main.js',
      cwd: '/root/suuq-backend',
      instances: 'max', // Utilize all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
        // Enable Firebase emulators for development
        FIREBASE_EMULATOR: 'true',
        FIREBASE_DATABASE_EMULATOR_HOST: 'localhost:9000',
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
        FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199',
      },

      // Memory optimizations for 8GB droplet
      max_memory_restart: '400M',
      node_args: '--max-old-space-size=512',

      // Performance optimizations
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Force no-store caching headers across the entire API (handled in src/main.ts)
        NO_STORE_ALL_API: 'true',
        // Supply outreach tasks rollout (feature-flag driven)
        FEATURE_SUPPLY_OUTREACH_TASKS_ENABLED: 'true',
        FEATURE_SUPPLY_OUTREACH_TASKS_MIN_VERSION:
          process.env.FEATURE_SUPPLY_OUTREACH_TASKS_MIN_VERSION || '1.45.0',
        FEATURE_SUPPLY_OUTREACH_TASKS_PCT:
          process.env.FEATURE_SUPPLY_OUTREACH_TASKS_PCT || '100',
        FEATURE_SUPPLY_OUTREACH_TASKS_BUCKET:
          process.env.FEATURE_SUPPLY_OUTREACH_TASKS_BUCKET || 'admin',
        // Increase libuv threadpool for image processing, hashing, etc. (default is 4)
        UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || 8,
        // Apple Sign-In audiences (bundle IDs / service IDs), comma-separated
        APPLE_AUDIENCES: process.env.APPLE_AUDIENCES,
        // Enable selective raw attributes logging in responses (comma-separated IDs or 'all')
        // Optional deep raw-attributes logging for troubleshooting. Disable by default.
        // To enable for specific IDs: set env DEBUG_ATTRS_PRODUCT_IDS="82,83" at deploy time.
        DEBUG_ATTRS_PRODUCT_IDS: process.env.DEBUG_ATTRS_PRODUCT_IDS || '',
        // Temporarily disable Firebase until credentials are configured
        FIREBASE_DISABLED: 'true',
        // Twilio Verify credentials (read from system env/PM2) – do not commit secrets
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
        TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
      },

      // Logging
      log_file: '/var/log/pm2/suuq-api.log',
      error_file: '/var/log/pm2/suuq-api-error.log',
      out_file: '/var/log/pm2/suuq-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Auto-restart optimizations
      min_uptime: '10s',
      max_restarts: 10,

      // Load balancing for marketplace traffic
      instance_var: 'INSTANCE_ID',

      // Process management
      kill_timeout: 5000,
      listen_timeout: 5000,
    },
  ],
};
