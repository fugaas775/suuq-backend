module.exports = {
  apps: [{
    name: 'suuq-api',
    script: './dist/main.js',
    cwd: '/root/suuq-backend',
    instances: 2, // Use 2 instances for 4 CPU cores
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
    listen_timeout: 3000
  }]
}
