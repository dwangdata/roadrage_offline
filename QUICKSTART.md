# FleetSense Cloud Deployment - Quick Reference

## 🚀 One-Click Deployment to Render.com

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dwangdata/roadrage_offline)

### Deployment Steps:
1. **Click the "Deploy to Render" button above**
2. **Connect your GitHub account** to Render.com
3. **Configure the service** (use defaults from `render.yaml`)
4. **Deploy** - Your app will be live in 2-3 minutes!

### After Deployment:
- **App URL**: `https://your-app-name.onrender.com`
- **Status Page**: `https://your-app-name.onrender.com/status`
- **API Health**: `https://your-app-name.onrender.com/api/health`

## 🔗 Alternative Quick Deploy Options

### Railway
```bash
npx @railway/cli deploy
```

### Heroku
```bash
git push heroku main
```

### Docker (any platform)
```bash
docker build -t roadrage-offline .
docker run -p 3000:3000 roadrage-offline
```

## 📱 Features Available After Cloud Deployment

✅ **Real-time GPS tracking** with device motion sensors  
✅ **Interactive route planning** with road roughness optimization  
✅ **Historical trip data** stored in persistent SQLite database  
✅ **Mobile-responsive interface** for smartphones and tablets  
✅ **HTTPS secure connection** for device sensor access  
✅ **Cross-platform compatibility** (iOS, Android, Desktop)  

## 🛠️ Environment Configuration

The app automatically detects cloud hosting and optimizes:
- Database persistence for cloud file systems
- External network binding for web access
- Production error handling and logging
- HTTPS enforcement for sensor permissions

## 📊 Monitoring Your Deployment

Visit `/status` on your deployed app to see:
- Real-time system health
- Database connection status
- Environment and version info
- Quick access to all features

---

**Ready to deploy?** Click the Deploy to Render button above! 🚀