module.exports = {
  apps: [{
    name: 'suuq-api',
    script: './dist/main.js',
    cwd: '/root/suuq-backend',
    instances: 2, // Use 2 instances for 4 CPU cores
    exec_mode: 'cluster',
    
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
  // Temporarily disable Firebase until credentials are configured
  FIREBASE_DISABLED: 'true',
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
