// PM2 Ecosystem Configuration for Gaurav Softwares Jewelry Estimation
// Production deployment on DigitalOcean VPS

module.exports = {
    apps: [{
        // Application name (used for pm2 commands)
        name: 'gaurav-app',
        
        // Entry point
        script: 'server.js',
        
        // Working directory
        cwd: '/var/www/jewelry-app',
        
        // Node.js arguments
        node_args: '--max-old-space-size=512',
        
        // Environment variables for production
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        
        // Default environment
        env: {
            NODE_ENV: 'development',
            PORT: 3000
        },
        
        // Cluster mode settings
        instances: 1,           // Single instance for single-tenant
        exec_mode: 'fork',      // Fork mode (not cluster)
        
        // Auto-restart settings
        autorestart: true,
        watch: false,           // Don't watch in production
        max_memory_restart: '500M',
        
        // Logging
        log_file: '/var/log/pm2/gaurav-app.log',
        out_file: '/var/log/pm2/gaurav-app-out.log',
        error_file: '/var/log/pm2/gaurav-app-error.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        
        // Restart delay and limits
        restart_delay: 4000,
        max_restarts: 10,
        min_uptime: '10s',
        
        // Graceful shutdown
        kill_timeout: 5000,
        listen_timeout: 3000,
        
        // Health check (optional)
        // exp_backoff_restart_delay: 100,
    }],

    // Deployment configuration (optional - for pm2 deploy)
    deploy: {
        production: {
            // SSH user
            user: 'root',
            
            // Remote host(s)
            host: ['your-server-ip'],
            
            // SSH port
            port: '22',
            
            // Git branch to deploy
            ref: 'origin/master',
            
            // Git repository
            repo: 'git@github.com:your-username/jewelry-app.git',
            
            // Remote directory
            path: '/var/www/jewelry-app',
            
            // Pre-setup (runs before first deploy)
            'pre-setup': 'apt-get update && apt-get install -y git',
            
            // Post-setup (runs after first deploy)
            'post-setup': 'npm install --production',
            
            // Pre-deploy (local machine)
            'pre-deploy-local': 'echo "Deploying to production..."',
            
            // Post-deploy (remote machine)
            'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
            
            // Environment variables
            env: {
                NODE_ENV: 'production'
            }
        }
    }
};
