# Cloud Deployment Guide

## Deploying to Render.com

This app is configured to deploy automatically to Render.com, a cloud platform that supports Node.js applications.

### Automatic Deployment

1. **Fork or Clone** this repository to your GitHub account
2. **Connect to Render.com**:
   - Go to [Render.com](https://render.com) and sign up/login
   - Connect your GitHub account
   - Click "New" → "Web Service"
   - Select this repository
3. **Configure the service**:
   - Name: `roadrage-offline` (or your preferred name)
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: `Free` (or upgrade as needed)
4. **Deploy**: Click "Create Web Service"

The app will be available at: `https://your-app-name.onrender.com`

### Configuration

The `render.yaml` file in the root directory contains all deployment configuration:

```yaml
services:
  - type: web
    name: roadrage-offline
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

### Environment Variables

The app automatically detects production environment and adjusts:
- Database path optimized for Render.com file system
- Server binds to `0.0.0.0` for external access
- Production-ready CORS and security settings

### Database Persistence

The SQLite database will persist between deployments on Render.com's free tier. Data is stored in the container file system.

## Alternative Hosting Options

### Railway
1. Connect GitHub repository to Railway
2. Deploy with zero configuration
3. App will be available at Railway-provided URL

### Heroku
1. Create new Heroku app
2. Connect GitHub repository
3. Enable automatic deployments
4. App will be available at `https://your-app.herokuapp.com`

### Self-Hosted (VPS)
```bash
# Clone repository
git clone https://github.com/your-username/roadrage_offline.git
cd roadrage_offline

# Install dependencies
npm install

# Start with PM2 for production
npm install -g pm2
pm2 start server.js --name roadrage-offline

# Setup reverse proxy with nginx
# Configure SSL with Let's Encrypt
```

## Production Considerations

### Performance
- SQLite is suitable for small to medium workloads
- For heavy usage, consider PostgreSQL or MongoDB
- Add Redis for session storage if needed

### Security
- HTTPS is enforced in production
- Add rate limiting for API endpoints
- Implement authentication if storing sensitive data

### Monitoring
- Check Render.com dashboard for metrics
- Add logging service for production debugging
- Monitor database size and performance

## Support

For deployment issues:
1. Check Render.com build logs
2. Verify environment variables
3. Test locally with `NODE_ENV=production npm start`
4. Open issue in GitHub repository