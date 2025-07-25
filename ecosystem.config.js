module.exports = {
  apps: [
    {
      name: 'suuq-api',
      script: 'dist/main.js',
      exec_mode: 'cluster',
      instances: 'max', 
    },
  ],
};