# ATIVE Casino Bot Website - Railway Deployment Guide

## Quick Deployment Steps

### 1. Prepare Your Repository

Make sure your website files are in the `/website` folder of your repository:

```
ative_casino_bot/
├── website/                 # ← Website files go here
│   ├── server.js
│   ├── package.json
│   ├── railway.json
│   └── ...
└── [other bot files]
```

### 2. Deploy to Railway

#### Option A: Connect GitHub Repository

1. Go to [Railway.app](https://railway.app) and sign up/login
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `ative_casino_bot` repository
5. **Important**: Set the root directory to `/website`
6. Railway will automatically detect the Node.js app

#### Option B: Railway CLI

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login and initialize:
   ```bash
   railway login
   cd website/
   railway init
   ```

3. Deploy:
   ```bash
   railway up
   ```

### 3. Configure Environment Variables

In Railway dashboard, add these environment variables:

```bash
NODE_ENV=production
PORT=3000
```

### 4. Custom Domain (Optional)

1. In Railway project settings, go to **"Domains"**
2. Add your custom domain
3. Update DNS records as shown
4. SSL certificate will be automatically provisioned

### 5. Update Bot Information

Before going live, update these files:

#### `views/index.ejs`
Replace `YOUR_CLIENT_ID` with your actual Discord bot client ID:
```html
<a href="https://discord.com/api/oauth2/authorize?client_id=YOUR_ACTUAL_CLIENT_ID&permissions=412317240384&scope=bot%20applications.commands" class="btn">Add to Discord</a>
```

#### `views/support.ejs`
Add your Discord support server invite link:
```html
<a href="https://discord.gg/ativecasino" class="btn">Join Support Server</a>
```

#### Legal Pages
Update contact information in:
- `views/terms.ejs`
- `views/privacy.ejs`

## Deployment Configuration

### Railway Configuration (`railway.json`)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Package.json Scripts
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

## Post-Deployment Checklist

- [ ] Website loads correctly at Railway URL
- [ ] All navigation links work
- [ ] Terms & Conditions page displays properly
- [ ] Privacy Policy page displays properly
- [ ] Mobile responsiveness works
- [ ] Health check endpoint responds (`/health`)
- [ ] Bot invite link works (after updating CLIENT_ID)
- [ ] Support links are updated
- [ ] Custom domain configured (if applicable)

## Troubleshooting

### Common Issues

**Build Fails:**
- Check that `package.json` is in the `/website` directory
- Verify Node.js version compatibility (18.x recommended)

**App Won't Start:**
- Check Railway logs for errors
- Verify `server.js` is in root of website directory
- Ensure PORT environment variable is set

**404 Errors:**
- Check that all view files are present in `/views` directory
- Verify EJS templates are correctly named

**Styling Issues:**
- Ensure `public/css/style.css` exists
- Check that Express static middleware is configured

### Railway CLI Commands

```bash
# View logs
railway logs

# Check status
railway status

# Open in browser
railway open

# Redeploy
railway up
```

### Monitoring

Railway provides:
- Real-time logs
- Usage metrics  
- Uptime monitoring
- Performance insights

Access these in your Railway project dashboard.

## Security Notes

The website includes:
- Rate limiting (100 req/15min per IP)
- Security headers
- Input sanitization
- No sensitive data exposure

## Performance Optimization

- Static assets cached
- Minimal JavaScript
- Optimized CSS
- Responsive images ready
- CDN compatible

## Support

If you encounter deployment issues:

1. Check Railway logs for errors
2. Verify all files are committed to Git
3. Ensure proper directory structure
4. Review environment variables
5. Contact Railway support if needed

---

🚀 **Your ATIVE Casino Bot website will be live at: `https://your-project-name.railway.app`**