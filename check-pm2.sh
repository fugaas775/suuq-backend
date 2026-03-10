const { exec } = require('child_process');
exec('pm2 logs suuq-api --nostream --lines 50', (err, stdout) => {
  console.log(stdout);
});
