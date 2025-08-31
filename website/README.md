# ATIVE Casino Bot Website

Professional website for ATIVE Casino Bot with Terms & Conditions, Privacy Policy, and comprehensive information pages.

## Features

- 📱 **Responsive Design** - Mobile-first design that works on all devices
- 🎨 **Discord Theme** - Beautiful Discord-inspired color scheme
- 📄 **Legal Pages** - Complete Terms & Conditions and Privacy Policy
- ⚡ **Fast Loading** - Optimized CSS and minimal JavaScript
- 🔒 **Security** - Rate limiting and security headers
- 🚀 **Railway Ready** - Configured for easy deployment

## Pages

- **Home** - Main landing page with bot overview
- **Features** - Detailed feature showcase
- **Commands** - Complete command reference
- **Support** - Help and FAQ section
- **Terms & Conditions** - Comprehensive legal terms
- **Privacy Policy** - GDPR-compliant privacy policy
- **404 & Error** - Custom error pages

## Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Run Development Server**
   ```bash
   npm run dev
   ```

3. **Visit Website**
   ```
   http://localhost:3000
   ```

## Production Deployment

### Railway Deployment

1. **Connect Repository**
   - Login to [Railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository and the `/website` folder

2. **Configure Environment**
   ```bash
   NODE_ENV=production
   PORT=3000
   ```

3. **Deploy**
   - Railway will automatically detect the configuration
   - The app will be available at your Railway subdomain

### Manual Deployment

1. **Install Dependencies**
   ```bash
   npm install --production
   ```

2. **Start Server**
   ```bash
   npm start
   ```

## Project Structure

```
website/
├── server.js              # Express.js server
├── package.json           # Dependencies and scripts
├── railway.json           # Railway configuration
├── Procfile              # Process file for deployment
├── public/               # Static assets
│   └── css/
│       └── style.css     # Main stylesheet
├── views/                # EJS templates
│   ├── layout.ejs        # Base layout template
│   ├── index.ejs         # Home page
│   ├── features.ejs      # Features page
│   ├── commands.ejs      # Commands page
│   ├── support.ejs       # Support page
│   ├── privacy.ejs       # Privacy Policy
│   ├── terms.ejs         # Terms & Conditions
│   ├── 404.ejs          # 404 error page
│   ├── error.ejs        # Error page
│   └── partials/        # Reusable components
│       ├── header.ejs
│       └── footer.ejs
└── README.md            # This file
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

### Security Features

- Rate limiting (100 requests per 15 minutes)
- Security headers (XSS protection, content type options)
- CSRF protection ready
- No sensitive data exposure

## Customization

### Update Bot Information

1. **Bot Invite Link**
   - Edit the Discord OAuth2 URL in `views/index.ejs`
   - Replace `YOUR_CLIENT_ID` with your actual bot client ID

2. **Support Server**
   - Update support server links in `views/support.ejs`
   - Add your Discord server invite link

3. **Contact Information**
   - Modify contact details in Terms & Privacy Policy
   - Update support channels and response times

### Styling Changes

- Main styles: `public/css/style.css`
- CSS variables for easy theme customization
- Responsive breakpoints: 768px, 480px

### Content Updates

- Legal pages: `views/terms.ejs` and `views/privacy.ejs`
- Features: `views/features.ejs`
- Commands: `views/commands.ejs`

## Legal Compliance

### Terms & Conditions Include:
- Service description and virtual currency policies
- User conduct and prohibited activities
- Intellectual property rights
- Data protection and privacy
- Disclaimer and limitation of liability
- Server Products monetization terms

### Privacy Policy Includes:
- Data collection and usage
- Security measures and data retention
- User rights and choices
- Children's privacy protection
- International compliance (GDPR, CCPA)
- Contact information

## Health Check

The server includes a health check endpoint at `/health` for monitoring:

```
GET /health
Response: {"status": "OK", "timestamp": "2024-01-01T12:00:00.000Z"}
```

## Performance

- **Fast loading times** with optimized CSS
- **Minimal JavaScript** for better performance
- **CDN ready** static assets
- **Caching headers** for production

## Browser Support

- Chrome/Chromium 60+
- Firefox 60+
- Safari 12+
- Edge 79+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Support

For issues with the website:

1. Check the console for errors
2. Verify all environment variables are set
3. Ensure dependencies are installed
4. Check Railway logs for deployment issues

## License

This website template is part of the ATIVE Casino Bot project. All rights reserved.

---

**Ready to deploy?** Just push to Railway and your professional bot website will be live! 🚀