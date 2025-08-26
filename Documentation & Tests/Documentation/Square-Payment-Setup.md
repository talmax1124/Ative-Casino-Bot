# 🔔 Square Payment Integration Setup & Troubleshooting Guide

This guide provides comprehensive instructions for setting up and troubleshooting Square payment integration in the ATIVE Casino web portal.

## 📋 Table of Contents

1. [Quick Setup](#quick-setup)
2. [Environment Variables](#environment-variables)
3. [Square Developer Account Setup](#square-developer-account-setup)
4. [Common Issues & Solutions](#common-issues--solutions)
5. [Testing Guide](#testing-guide)
6. [Debugging Tools](#debugging-tools)

## ⚡ Quick Setup

### 1. Create Square Developer Account
1. Go to [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Sign up or log in with your Square account
3. Create a new application or select existing one

### 2. Get Credentials
1. Navigate to **"Credentials"** tab in your Square app
2. Copy the **Application ID**
3. Go to **"Locations"** tab
4. Copy your **Location ID**

### 3. Configure Environment Variables
Create a `.env` file in the `web-portal` directory:

```bash
# Required Square Configuration
REACT_APP_SQUARE_APPLICATION_ID=sandbox-sq0idb-YOUR_APPLICATION_ID
REACT_APP_SQUARE_LOCATION_ID=YOUR_LOCATION_ID

# Optional: Environment (defaults to sandbox)
REACT_APP_SQUARE_ENVIRONMENT=sandbox

# Optional: Enable debug logging
REACT_APP_DEBUG_SQUARE=true
```

## 🔧 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `REACT_APP_SQUARE_APPLICATION_ID` | Your Square Application ID | `sandbox-sq0idb-XXXXXXXXX` |
| `REACT_APP_SQUARE_LOCATION_ID` | Your Square Location ID | `LXXXXXXXXXXXXX` |

### Optional Variables

| Variable | Description | Default | Options |
|----------|-------------|---------|---------|
| `REACT_APP_SQUARE_ENVIRONMENT` | Square environment | `sandbox` | `sandbox`, `production` |
| `REACT_APP_DEBUG_SQUARE` | Enable debug logging | `false` | `true`, `false` |

## 🏗️ Square Developer Account Setup

### Creating a New Application

1. **Sign up for Square Developer Account**
   - Go to https://developer.squareup.com/
   - Click "Get Started" 
   - Sign up with email or use existing Square account

2. **Create New Application**
   - Click "Create your first application"
   - Enter application name: "ATIVE Casino Web Portal"
   - Choose application type: "Custom Application"

3. **Configure Application Settings**
   - **Application Name**: ATIVE Casino Web Portal
   - **Application URL**: Your web portal URL
   - **Redirect URL**: `https://your-domain.com/auth/callback`

### Getting Sandbox Credentials

1. **Navigate to Credentials Tab**
   - Select your application
   - Click "Credentials" in the left menu
   - Switch to "Sandbox" at the top

2. **Copy Sandbox Application ID**
   - Look for "Application ID" 
   - Format: `sandbox-sq0idb-XXXXXXXXXXXXXXXXXXXXXXXXXX`
   - Copy this value

3. **Get Location ID**
   - Click "Locations" tab
   - Copy the Location ID (starts with 'L')
   - Format: `LXXXXXXXXXXXXX`

### Setting up Production (When Ready)

1. **Complete Square Account Verification**
   - Verify business information
   - Complete tax information
   - Set up bank account for deposits

2. **Switch to Production**
   - Go to Credentials tab
   - Switch from "Sandbox" to "Production"
   - Copy production Application ID (starts with `sq0idp-`)

3. **Update Environment Variables**
   ```bash
   REACT_APP_SQUARE_APPLICATION_ID=sq0idp-YOUR_PRODUCTION_ID
   REACT_APP_SQUARE_ENVIRONMENT=production
   ```

## 🔍 Common Issues & Solutions

### Issue 1: "Square SDK not loaded"

**Symptoms:**
```
❌ Square SDK not loaded
Failed to initialize payment form
```

**Causes & Solutions:**

1. **Network/Connectivity Issues**
   - Check internet connection
   - Verify firewall isn't blocking squarecdn.com
   - Try different network/browser

2. **Content Security Policy (CSP) Restrictions**
   - Add Square domains to CSP if using strict CSP
   - Allow `https://sandbox.web.squarecdn.com` and `https://web.squarecdn.com`

3. **Browser Extensions**
   - Disable ad blockers temporarily
   - Try incognito/private browsing mode

4. **Solution Steps:**
   ```javascript
   // Check browser console for:
   console.log('Square available:', !!window.Square);
   
   // If false, check network tab for failed requests to:
   // https://sandbox.web.squarecdn.com/v1/square.js
   ```

### Issue 2: "Application ID not found" or "Invalid credentials"

**Symptoms:**
```
❌ Square credentials missing
Payment configuration error
```

**Causes & Solutions:**

1. **Missing Environment Variables**
   - Verify `.env` file exists in `web-portal` directory
   - Check variable names match exactly (case-sensitive)
   - Restart development server after adding variables

2. **Wrong Application ID**
   - Ensure you're using the correct environment (sandbox vs production)
   - Sandbox IDs start with `sandbox-sq0idb-`
   - Production IDs start with `sq0idp-`

3. **Copy/Paste Errors**
   - Re-copy credentials from Square Dashboard
   - Check for extra spaces or line breaks
   - Verify the full ID was copied

### Issue 3: "Location not found"

**Symptoms:**
```
Location not found
Failed to initialize Square payments
```

**Solutions:**
1. **Verify Location ID**
   - Go to Square Dashboard > Locations
   - Copy the exact Location ID (starts with 'L')
   - Each Square account has at least one location

2. **Multiple Locations**
   - If you have multiple locations, choose the primary one
   - Use the Location ID where you want payments processed

### Issue 4: Payment Processing Fails

**Symptoms:**
```
Payment failed
Card processing error
```

**Solutions:**

1. **Test with Valid Test Cards (Sandbox)**
   ```
   Visa: 4111 1111 1111 1111
   Mastercard: 5555 5555 5555 4444
   CVV: Any 3-digit number
   Expiry: Any future date
   ```

2. **Check Square Status**
   - Visit https://status.squareup.com/
   - Check for service outages

3. **Verify Card Details**
   - Ensure all required fields are filled
   - Check card number format
   - Verify expiry date is in future

### Issue 5: Slow Loading or Timeouts

**Symptoms:**
```
Square SDK loading timeout
Payment form takes too long to load
```

**Solutions:**

1. **Increase Timeout Values**
   - Component timeout is set to 15 seconds
   - For slower connections, this might need adjustment

2. **Preload Square SDK**
   - Add Square script to `public/index.html`:
   ```html
   <script src="https://sandbox.web.squarecdn.com/v1/square.js" async></script>
   ```

3. **Check Network Performance**
   - Test on different networks
   - Use browser dev tools Network tab to check load times

## 🧪 Testing Guide

### Sandbox Testing

1. **Test Card Numbers**
   ```
   Successful Transactions:
   - Visa: 4111 1111 1111 1111
   - Mastercard: 5555 5555 5555 4444
   - American Express: 3782 8224 6310 005
   - Discover: 6011 1111 1111 1117
   
   Failed Transactions (for error testing):
   - 4000 0000 0000 0002 (Card declined)
   - 4000 0000 0000 0119 (Processing error)
   ```

2. **Test CVV and Expiry**
   - CVV: Any 3-digit number (4 digits for Amex)
   - Expiry: Any future date

3. **Test Amounts**
   - Any amount works in sandbox
   - Test small amounts ($1) and larger amounts ($100+)

### Manual Testing Checklist

- [ ] Payment form loads without errors
- [ ] Card input fields are styled correctly
- [ ] Test successful payment with valid test card
- [ ] Test declined payment with declined test card
- [ ] Test form validation with invalid card numbers
- [ ] Test form behavior on page refresh
- [ ] Test payment flow end-to-end

## 🛠️ Debugging Tools

### Enable Debug Logging

Add to your `.env` file:
```bash
REACT_APP_DEBUG_SQUARE=true
```

### Console Debug Commands

Open browser console and run:

```javascript
// Check if Square SDK is loaded
console.log('Square SDK:', window.Square ? 'Loaded' : 'Not loaded');

// Check environment variables (client-side only shows REACT_APP_*)
console.log('Square App ID:', process.env.REACT_APP_SQUARE_APPLICATION_ID);
console.log('Square Location ID:', process.env.REACT_APP_SQUARE_LOCATION_ID);

// Test Square initialization
if (window.Square) {
  try {
    const payments = window.Square.payments('sandbox-sq0idb-test', 'LTEST');
    console.log('Square payments instance:', payments);
  } catch (error) {
    console.error('Square init error:', error);
  }
}
```

### Network Debugging

1. **Check Square SDK Loading**
   - Open DevTools > Network tab
   - Look for request to `square.js`
   - Status should be 200 OK

2. **Common Network Issues**
   ```
   Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
   → Ad blocker is blocking Square SDK
   
   Failed to load resource: net::ERR_NETWORK_CHANGED  
   → Network connectivity issue
   
   Access to fetch at 'squarecdn.com' blocked by CORS
   → CSP or CORS configuration issue
   ```

### Error Handling Debug

The enhanced Square component now provides detailed logging:

```javascript
// Look for these console messages:
🔄 Attempting to load Square SDK...
✅ Square SDK already loaded
📜 Square script already in DOM
📥 Creating Square SDK script element...
📍 Loading Square SDK from: [URL]
✅ Square SDK script loaded successfully
🎯 Starting Square initialization...
🔍 Checking Square credentials...
🎮 Initializing Square payments instance...
💳 Creating Square card element...
🔗 Attaching Square card to DOM...
✅ Square card initialization complete
❌ [Error messages for failures]
```

## 🚀 Production Checklist

Before going live with Square payments:

### Square Account Setup
- [ ] Business verification completed
- [ ] Bank account connected
- [ ] Tax information submitted  
- [ ] Payment processing enabled

### Application Configuration
- [ ] Production Application ID obtained
- [ ] Production credentials tested
- [ ] Environment variable updated to production
- [ ] SSL certificate installed on domain
- [ ] HTTPS enforced for payment pages

### Security Checklist
- [ ] Environment variables secured
- [ ] No credentials in client-side code
- [ ] CSP headers configured properly
- [ ] Payment data handling complies with PCI requirements

### Testing in Production
- [ ] Test with real card (small amount)
- [ ] Verify webhooks work (if implemented)
- [ ] Test payment failure scenarios
- [ ] Verify transaction appears in Square Dashboard

## 📞 Support Resources

### Square Resources
- [Square Developer Documentation](https://developer.squareup.com/docs)
- [Square API Reference](https://developer.squareup.com/reference/square)
- [Square Status Page](https://status.squareup.com/)
- [Square Developer Community](https://developer.squareup.com/community)

### Emergency Contacts
- Square Developer Support: [developer@squareup.com](mailto:developer@squareup.com)
- Square Merchant Support: 1-855-700-6000

### Useful Links
- [Test Card Numbers](https://developer.squareup.com/docs/testing/test-values)
- [Webhooks Documentation](https://developer.squareup.com/docs/webhooks)
- [Error Codes Reference](https://developer.squareup.com/docs/api/errors)

---

## 🎯 Quick Troubleshooting Commands

If Square payment is not working, run through this checklist:

1. **Check Environment Variables**
   ```bash
   # In web-portal directory
   cat .env | grep SQUARE
   ```

2. **Verify Square SDK Loading**
   ```javascript
   // In browser console
   console.log('Square:', window.Square);
   ```

3. **Test Credentials**
   ```javascript
   // In browser console (after SDK loads)
   const payments = window.Square.payments(
     process.env.REACT_APP_SQUARE_APPLICATION_ID,
     process.env.REACT_APP_SQUARE_LOCATION_ID
   );
   ```

4. **Check Network Issues**
   - Open DevTools > Network
   - Look for failed requests to squarecdn.com
   - Check for CORS or CSP errors

5. **Clear Cache and Retry**
   ```bash
   # Clear browser cache
   # Or hard refresh: Ctrl+F5 / Cmd+Shift+R
   ```

If issues persist after following this guide, check the browser console for detailed error messages and refer to the specific error solutions above.

---

**✅ Successful Setup Indicators:**
- Payment form loads within 5 seconds
- Card input fields are visible and styled
- Test payments process successfully
- No console errors related to Square
- "Secure payment powered by Square" message appears