// PM2 (without Docker):  cd server && pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
  apps: [{ name: 'nivaas', cwd: __dirname + '/../server', script: 'src/index.js', env: { NODE_ENV: 'production' }, max_memory_restart: '400M' }],
};
