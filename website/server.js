/**
 * ATIVE Casino Bot Website
 * Express.js server for hosting information pages on Railway
 */

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise');
const paypal = require('@paypal/checkout-server-sdk');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Database configuration
const dbConfig = {
  host: process.env.MARIADB_HOST,
  port: process.env.MARIADB_PORT || 3306,
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const dbPool = mysql.createPool(dbConfig);

// Initialize database tables
async function initializeDatabase() {
  try {
    // Create users table for website OAuth (separate from bot's user_balances)
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL UNIQUE,
        username VARCHAR(255) NOT NULL,
        discriminator VARCHAR(10),
        avatar VARCHAR(255),
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id)
      )
    `).catch(() => {
      // Table might already exist, that's okay
    });

    // Create web purchases table
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS web_purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        product_type VARCHAR(255) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        coins_amount BIGINT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        paypal_order_id VARCHAR(255),
        payment_status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_paypal_order (paypal_order_id),
        INDEX idx_created_at (created_at)
      )
    `);

    // Create user subscriptions table  
    await dbPool.execute(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        subscription_type VARCHAR(255) NOT NULL,
        role_id VARCHAR(255) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        paypal_order_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_subscription (user_id, subscription_type),
        INDEX idx_user_id (user_id),
        INDEX idx_active (active),
        INDEX idx_paypal_order (paypal_order_id)
      )
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}

// Initialize database on startup
initializeDatabase();

// Validate OAuth configuration
function validateOAuthConfig() {
  console.log('Validating OAuth configuration...');
  
  const requiredVars = {
    'DISCORD_OAUTH_CLIENT_ID': process.env.DISCORD_OAUTH_CLIENT_ID || process.env.CLIENT_ID,
    'DISCORD_OAUTH_CLIENT_SECRET': process.env.DISCORD_OAUTH_CLIENT_SECRET,
    'SESSION_SECRET': process.env.SESSION_SECRET
  };
  
  const missing = [];
  for (const [name, value] of Object.entries(requiredVars)) {
    if (!value) {
      missing.push(name);
    } else {
      console.log(`✓ ${name}: ${value.substring(0, 10)}...`);
    }
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('OAuth login will not work without these variables.');
  } else {
    console.log('✅ All OAuth environment variables are configured');
  }
  
  // Log current callback URL
  const callbackURL = process.env.DISCORD_OAUTH_REDIRECT_URI || (process.env.NODE_ENV === 'production' 
    ? 'https://ative-casino-bot-production.up.railway.app/auth/discord/callback'
    : 'http://localhost:3000/auth/discord/callback');
  console.log('📞 OAuth Callback URL:', callbackURL);
}

validateOAuthConfig();

// PayPal Configuration
function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials missing! Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to your .env file');
  }

  // Use sandbox for development, live for production
  if (process.env.NODE_ENV === 'production') {
    return new paypal.core.LiveEnvironment(clientId, clientSecret);
  } else {
    return new paypal.core.SandboxEnvironment(clientId, clientSecret);
  }
}

const client = new paypal.core.PayPalHttpClient(environment());

// Product configuration
const PRODUCTS = {
  coins_200k: {
    name: '💎 5M Coins Pack',
    price: '3.99',
    coins: 5000000,
    description: '5,000,000 casino coins for gaming',
    type: 'one_time'
  },
  coins_500k: {
    name: '👑 25M Coins Pack',
    price: '24.99',
    coins: 25000000,
    description: '25,000,000 casino coins for gaming',
    type: 'one_time'
  },
  coins_1m: {
    name: '🚀 100M Coins Pack',
    price: '39.99',
    coins: 100000000,
    description: '100,000,000 casino coins for gaming',
    type: 'one_time'
  },
  diamond_subscription: {
    name: '💎 Diamond Subscription',
    price: '4.99',
    coins: 1000000,
    description: 'Monthly Diamond VIP subscription with 5% purchase bonus',
    roleId: '1411582691073196155',
    type: 'subscription',
    planId: process.env.PAYPAL_DIAMOND_PLAN_ID || 'P-3RX065706M3469222L5IFM4I' // PayPal subscription plan ID
  },
  ruby_subscription: {
    name: '🔴 Ruby Subscription',
    price: '9.99',
    coins: 5000000,
    description: 'Monthly Ruby VIP subscription with 10% purchase bonus',
    roleId: '1411582733813158001',
    type: 'subscription',
    planId: process.env.PAYPAL_RUBY_PLAN_ID || 'P-5ML4271244454362WXNWU5NQ' // PayPal subscription plan ID
  }
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

// Enhanced Session configuration for persistent login
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false, // Don't save session if unmodified
  saveUninitialized: false, // Don't create session until something is stored
  rolling: true, // Reset expiration on activity - keeps users logged in
  name: 'ative.sid', // Custom session name
  proxy: process.env.NODE_ENV === 'production', // Trust Railway's proxy
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days persistent login
    sameSite: 'lax' // Helps with OAuth redirects
  },
  // Enhanced session ID generation with better entropy
  genid: function(req) {
    const crypto = require('crypto');
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    const id = `${timestamp}-${random}`;
    console.log(`[SESSION] Generated persistent session ID: ${id.substring(0, 20)}...`);
    return id;
  }
}));

// Debug middleware to track session changes
app.use((req, res, next) => {
  const originalSave = req.session.save;
  req.session.save = function(callback) {
    console.log(`[SESSION] Manually saving session: ${req.sessionID}`);
    return originalSave.call(this, callback);
  };
  next();
});

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Discord OAuth2 Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_OAUTH_CLIENT_ID || process.env.CLIENT_ID,
  clientSecret: process.env.DISCORD_OAUTH_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_OAUTH_REDIRECT_URI || (process.env.NODE_ENV === 'production' 
    ? 'https://ative-casino-bot-production.up.railway.app/auth/discord/callback'
    : 'http://localhost:3000/auth/discord/callback'),
  scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    console.log('Discord OAuth callback received for user:', profile.id);
    console.log('Profile data:', {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      email: profile.email
    });
    
    // Store user info in database
    await dbPool.execute(
      'INSERT INTO users (user_id, username, discriminator, avatar, email) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, discriminator = ?, avatar = ?, email = ?',
      [
        profile.id,
        profile.username,
        profile.discriminator || '0000',
        profile.avatar,
        profile.email,
        profile.username,
        profile.discriminator || '0000',
        profile.avatar,
        profile.email
      ]
    );
    
    console.log('User stored in database successfully');
    return done(null, profile);
  } catch (error) {
    console.error('Discord auth error:', error);
    return done(error, null);
  }
}));

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log('Deserializing user with ID:', id);
    const [rows] = await dbPool.execute('SELECT * FROM users WHERE user_id = ?', [id]);
    if (rows.length > 0) {
      const user = rows[0];
      console.log('User found in database:', user.username);
      // Format the user object to match Discord profile structure
      done(null, {
        id: user.user_id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email
      });
    } else {
      console.log('User not found in database for ID:', id);
      done(null, null);
    }
  } catch (error) {
    console.error('Error deserializing user:', error);
    done(error, null);
  }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Economy Dashboard API Routes
const economyAPI = require('./economy-api-simple');
const enhancedEconomyAPI = require('./economy-api-enhanced');
app.use('/api/economy', economyAPI);
app.use('/api/v2/economy', enhancedEconomyAPI);

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Authentication middleware
function ensureAuthenticated(req, res, next) {
  console.log(`[AUTH] Checking authentication for ${req.originalUrl}`);
  console.log(`[AUTH] Session ID: ${req.sessionID}`);
  console.log(`[AUTH] Is Authenticated: ${req.isAuthenticated()}`);
  console.log(`[AUTH] User: ${req.user ? req.user.id : 'null'}`);
  
  if (req.isAuthenticated()) {
    console.log(`[AUTH] ✅ User authenticated, proceeding to ${req.originalUrl}`);
    return next();
  }
  
  console.log(`[AUTH] ❌ User not authenticated, redirecting to Discord OAuth`);
  req.session.returnTo = req.originalUrl;
  
  // Force session save before redirect
  req.session.save((err) => {
    if (err) {
      console.error('[AUTH] Session save error:', err);
    } else {
      console.log('[AUTH] Session saved before redirect');
    }
    res.redirect('/auth/discord');
  });
}

// Discord OAuth2 Routes
app.get('/auth/discord', (req, res, next) => {
  console.log('Discord OAuth initiation requested');
  passport.authenticate('discord')(req, res, next);
});

app.get('/auth/discord/callback', (req, res, next) => {
  console.log('Discord OAuth callback received');
  console.log('Query params:', req.query);
  console.log('Session data:', req.session);
  
  // Handle OAuth errors (like access_denied)
  if (req.query.error) {
    console.log(`OAuth error: ${req.query.error} - ${req.query.error_description}`);
    return res.redirect('/?error=' + encodeURIComponent(req.query.error));
  }
  
  passport.authenticate('discord', { 
    failureRedirect: '/',
    failureFlash: false
  })(req, res, (err) => {
    if (err) {
      console.error('OAuth authentication error:', err);
      return res.redirect('/?error=auth_failed');
    }
    
    console.log('OAuth authentication successful for user:', req.user?.id);
    console.log('Session after auth:', {
      id: req.sessionID,
      authenticated: req.isAuthenticated(),
      user: req.user ? req.user.id : null
    });
    
    // Successful authentication
    const returnTo = req.session.returnTo || '/shop';
    delete req.session.returnTo;
    console.log('Redirecting to:', returnTo);
    
    // Force session save before redirect
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error after auth:', saveErr);
      } else {
        console.log('✅ Session saved after authentication');
      }
      res.redirect(returnTo);
    });
  });
});

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// API endpoint to get current user
app.get('/api/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        email: req.user.email
      }
    });
  } else {
    res.json({ success: false, user: null });
  }
});

// Routes
app.get('/', (req, res) => {
  res.render('index', {
    title: 'ATIVE Casino Bot - Discord\'s Premier Casino Experience',
    currentPage: 'home'
  });
});

// Economy Dashboard Route (Admin only)
app.get('/economy-dashboard', ensureAuthenticated, async (req, res) => {
  try {
    // Check if user is admin (you may want to add a proper admin check here)
    // For now, we'll serve the dashboard to authenticated users
    res.sendFile(path.join(__dirname, 'economy-dashboard.html'));
  } catch (error) {
    console.error('Economy dashboard error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// V2 Economy Dashboard Route (Modern UI)
app.get('/economy-dashboard-v2', ensureAuthenticated, async (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'economy-dashboard-v2.html'));
  } catch (error) {
    console.error('V2 Economy dashboard error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Test Dashboard Route (No authentication for debugging)
app.get('/test-dashboard', async (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'test-dashboard.html'));
  } catch (error) {
    console.error('Test dashboard error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// User info API for persistent session management
app.get('/api/auth/user', ensureAuthenticated, async (req, res) => {
  try {
    if (req.user) {
      res.json({
        success: true,
        id: req.user.id,
        username: req.user.username,
        avatar: req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png?size=256` : null,
        discriminator: req.user.discriminator,
        email: req.user.email,
        sessionExpiry: req.session.cookie.expires
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }
  } catch (error) {
    console.error('User info API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/features', (req, res) => {
  res.render('features', {
    title: 'Features - ATIVE Casino Bot',
    currentPage: 'features'
  });
});

app.get('/commands', (req, res) => {
  res.render('commands', {
    title: 'Commands - ATIVE Casino Bot',
    currentPage: 'commands'
  });
});

app.get('/privacy', (req, res) => {
  res.render('privacy', {
    title: 'Privacy Policy - ATIVE Casino Bot',
    currentPage: 'privacy'
  });
});

app.get('/terms', (req, res) => {
  res.render('terms', {
    title: 'Terms & Conditions - ATIVE Casino Bot',
    currentPage: 'terms'
  });
});

app.get('/support', (req, res) => {
  res.render('support', {
    title: 'Support - ATIVE Casino Bot',
    currentPage: 'support'
  });
});

app.get('/shop', ensureAuthenticated, (req, res) => {
  res.render('shop', {
    title: 'Shop - ATIVE Casino Bot',
    currentPage: 'shop',
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
    user: req.user
  });
});

// Create PayPal subscription for VIP plans
app.post('/create-paypal-subscription', async (req, res) => {
  try {
    const { productType, userId, discordUsername } = req.body;

    if (!productType || !userId || !discordUsername) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    const product = PRODUCTS[productType];
    if (!product || product.type !== 'subscription') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid subscription product' 
      });
    }

    // Create subscription using PayPal REST API
    const subscriptionData = {
      plan_id: product.planId,
      start_time: new Date(Date.now() + 60000).toISOString(), // Start in 1 minute
      quantity: "1",
      shipping_amount: {
        currency_code: "USD",
        value: "0.00"
      },
      subscriber: {
        name: {
          given_name: discordUsername.split('#')[0],
          surname: "User"
        }
      },
      application_context: {
        brand_name: "ATIVE Casino Bot",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
        },
        return_url: `${req.protocol}://${req.get('host')}/subscription-success`,
        cancel_url: `${req.protocol}://${req.get('host')}/subscription-cancel`
      },
      custom_id: JSON.stringify({
        userId: userId,
        discordUsername: discordUsername,
        productType: productType
      })
    };

    const response = await fetch(`${process.env.NODE_ENV === 'production' ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com'}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getPayPalAccessToken()}`,
        'Accept': 'application/json',
        'PayPal-Request-Id': `${userId}-${productType}-${Date.now()}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(subscriptionData)
    });

    const subscription = await response.json();

    if (!response.ok) {
      console.error('PayPal subscription creation error:', subscription);
      return res.status(500).json({
        success: false,
        message: 'Failed to create subscription'
      });
    }

    // Get approval URL
    const approvalUrl = subscription.links.find(link => link.rel === 'approve')?.href;

    res.json({
      success: true,
      subscriptionId: subscription.id,
      approvalUrl: approvalUrl
    });

  } catch (error) {
    console.error('PayPal subscription creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create PayPal subscription' 
    });
  }
});

// Get PayPal access token
async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const baseURL = process.env.NODE_ENV === 'production' ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com';

  const response = await fetch(`${baseURL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en_US',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;
}

// Create PayPal order endpoint (for one-time purchases)
app.post('/create-paypal-order', async (req, res) => {
  try {
    const { productType, userId, discordUsername } = req.body;

    if (!productType || !userId || !discordUsername) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Validate Discord user ID format
    if (!/^\d{17,19}$/.test(userId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid Discord user ID format' 
      });
    }

    const product = PRODUCTS[productType];
    if (!product) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid product type' 
      });
    }

    const customIdData = {
      userId: userId,
      discordUsername: discordUsername,
      productType: productType
    };
    
    console.log('Creating PayPal order with custom_id:', JSON.stringify(customIdData));

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      application_context: {
        return_url: `${req.protocol}://${req.get('host')}/payment-success`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment-cancel`,
        brand_name: 'ATIVE Casino Bot',
        landing_page: 'BILLING',
        user_action: 'PAY_NOW'
      },
      purchase_units: [{
        reference_id: `${userId}-${productType}-${Date.now()}`,
        description: product.description,
        amount: {
          currency_code: 'USD',
          value: product.price,
          breakdown: {
            item_total: {
              currency_code: 'USD',
              value: product.price
            }
          }
        },
        items: [{
          name: product.name,
          description: product.description,
          unit_amount: {
            currency_code: 'USD',
            value: product.price
          },
          quantity: '1',
          category: 'DIGITAL_GOODS'
        }],
        custom_id: JSON.stringify(customIdData)
      }]
    });

    const order = await client.execute(request);
    res.json({
      success: true,
      orderId: order.result.id
    });

  } catch (error) {
    console.error('PayPal order creation error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create PayPal order' 
    });
  }
});

// Capture PayPal payment endpoint
app.post('/capture-paypal-order', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID is required' 
      });
    }

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await client.execute(request);
    const order = capture.result;

    // Debug logging to understand PayPal response structure
    console.log('PayPal capture result:', JSON.stringify(order, null, 2));

    if (order.status === 'COMPLETED') {
      // Extract custom data with error handling
      const purchaseUnit = order.purchase_units[0];
      
      console.log('Purchase unit:', JSON.stringify(purchaseUnit, null, 2));
      
      if (!purchaseUnit) {
        console.error('No purchase unit found in order');
        return res.status(400).json({
          success: false,
          message: 'Invalid PayPal order - no purchase unit'
        });
      }
      
      // The custom_id is in the capture object, not the purchase unit directly
      const capture = purchaseUnit.payments?.captures?.[0];
      
      if (!capture || !capture.custom_id) {
        console.error('No capture or custom_id found');
        console.log('Available purchase unit keys:', Object.keys(purchaseUnit));
        if (capture) {
          console.log('Available capture keys:', Object.keys(capture));
        }
        return res.status(400).json({
          success: false,
          message: 'Invalid PayPal order - missing capture data'
        });
      }

      let customData;
      try {
        customData = JSON.parse(capture.custom_id);
      } catch (parseError) {
        console.error('Failed to parse custom_id:', capture.custom_id, parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid PayPal order data'
        });
      }
      
      const { userId, discordUsername, productType } = customData;
      
      if (!userId || !discordUsername || !productType) {
        return res.status(400).json({
          success: false,
          message: 'Missing required purchase information'
        });
      }
      
      const product = PRODUCTS[productType];
      
      // Ensure user exists in bot's user_balances table
      await dbPool.execute(
        'INSERT IGNORE INTO user_balances (user_id, username, wallet, bank) VALUES (?, ?, 1000.00, 0.00)',
        [userId, discordUsername]
      );

      // Add coins to user's wallet balance
      await dbPool.execute(
        'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
        [product.coins, userId]
      );

      // Record purchase
      await dbPool.execute(`
        INSERT INTO web_purchases (
          user_id, 
          username,
          product_type,
          product_name, 
          coins_amount, 
          price,
          paypal_order_id,
          payment_status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', NOW())
      `, [userId, discordUsername, productType, product.name, product.coins, product.price, orderId]);

      // Handle subscriptions
      if (product.type === 'subscription') {
        await dbPool.execute(`
          INSERT INTO user_subscriptions (
            user_id,
            subscription_type,
            role_id,
            active,
            paypal_order_id,
            created_at
          ) VALUES (?, ?, ?, 1, ?, NOW())
          ON DUPLICATE KEY UPDATE active = 1, paypal_order_id = ?, created_at = NOW()
        `, [userId, productType, product.roleId, orderId, orderId]);

        // Assign Discord role via webhook to bot
        try {
          await assignDiscordRole(userId, product.roleId, product.name);
        } catch (roleError) {
          console.error('Failed to assign Discord role:', roleError);
        }
      }

      // Send notification to Discord channel
      try {
        await sendPurchaseNotification(userId, discordUsername, product);
      } catch (notifyError) {
        console.error('Failed to send Discord notification:', notifyError);
      }

      res.json({
        success: true,
        message: `Successfully purchased ${product.name}! ${product.coins.toLocaleString()} coins added to your account.`,
        coins: product.coins,
        orderId: orderId
      });

    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Payment was not completed' 
      });
    }

  } catch (error) {
    console.error('PayPal capture error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process payment' 
    });
  }
});

// Assign Discord role via bot API or webhook
async function assignDiscordRole(userId, roleId, productName) {
  try {
    const botWebhookUrl = process.env.DISCORD_BOT_ROLE_WEBHOOK_URL;
    
    if (!botWebhookUrl) {
      console.log('No bot role webhook URL configured, skipping role assignment');
      return;
    }

    const roleData = {
      userId: userId,
      roleId: roleId,
      productName: productName,
      action: 'assign_role'
    };

    const response = await fetch(botWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOT_WEBHOOK_SECRET || 'default-secret'}`
      },
      body: JSON.stringify(roleData)
    });

    if (!response.ok) {
      throw new Error(`Role assignment webhook failed: ${response.status}`);
    }

    console.log(`✅ Role assigned to ${userId}: ${productName} (${roleId})`);
  } catch (error) {
    console.error('Failed to assign Discord role:', error.message);
    throw error;
  }
}

// Remove Discord role via bot API or webhook
async function removeDiscordRole(userId, roleId, productName) {
  try {
    const botWebhookUrl = process.env.DISCORD_BOT_ROLE_WEBHOOK_URL;
    
    if (!botWebhookUrl) {
      console.log('No bot role webhook URL configured, skipping role removal');
      return;
    }

    const roleData = {
      userId: userId,
      roleId: roleId,
      productName: productName,
      action: 'remove_role'
    };

    const response = await fetch(botWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.BOT_WEBHOOK_SECRET || 'default-secret'}`
      },
      body: JSON.stringify(roleData)
    });

    if (!response.ok) {
      throw new Error(`Role removal webhook failed: ${response.status}`);
    }

    console.log(`✅ Role removed from ${userId}: ${productName} (${roleId})`);
  } catch (error) {
    console.error('Failed to remove Discord role:', error.message);
    throw error;
  }
}

// Send purchase notification to Discord via webhook
async function sendPurchaseNotification(userId, discordUsername, product) {
  try {
    const webhookUrl = process.env.DISCORD_PURCHASE_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.log('No Discord webhook URL configured, skipping notification');
      return;
    }

    const isSubscription = product.type === 'subscription';
    const userAvatar = await getUserAvatar(userId);
    
    // Create stunning visual embed
    const embed = {
      author: {
        name: "🎰 ATIVE Casino - New Purchase!",
        icon_url: "https://cdn.discordapp.com/emojis/1234567890.png?size=64" // Casino chip emoji
      },
      title: isSubscription ? 
        `${product.name.includes('Diamond') ? '💎✨' : '🔴💫'} VIP SUBSCRIPTION ACTIVATED!` : 
        `💰🎉 COIN PURCHASE COMPLETE!`,
      description: `**🎯 ${discordUsername}** has joined the high rollers with **${product.name}**!\n\n` +
        (isSubscription ? 
          `${product.name.includes('Diamond') ? '💎' : '🔴'} Welcome to the VIP lounge! Enjoy exclusive perks and bonuses!` :
          `💸 Fresh coins added to the vault! Ready to hit the casino floor!`),
      color: isSubscription ? 
        (product.name.includes('Diamond') ? 0x00D4FF : 0xFF6B6B) : // Bright blue for Diamond, Red for Ruby
        0x00E676, // Bright green for coins
      fields: [
        {
          name: "🛍️ **Purchase Details**",
          value: `\`\`\`yaml\nProduct: ${product.name}\nPrice: $${product.price}${isSubscription ? '/month' : ''}\n${isSubscription ? 'Monthly Coins' : 'Coins Added'}: ${product.coins.toLocaleString()}\`\`\``,
          inline: false
        },
        {
          name: "👑 **Customer**",
          value: `<@${userId}>\n\`${discordUsername}\`\n\`ID: ${userId}\``,
          inline: true
        },
        {
          name: "💎 **Transaction**",
          value: `**Status:** ✅ COMPLETED\n**Time:** <t:${Math.floor(Date.now() / 1000)}:R>\n**Method:** PayPal`,
          inline: true
        }
      ],
      image: {
        url: isSubscription ? 
          "https://media.discordapp.net/attachments/123456789/vip-banner.gif" : // VIP celebration gif
          "https://media.discordapp.net/attachments/123456789/coins-rain.gif" // Coins falling gif
      },
      thumbnail: {
        url: `https://cdn.discordapp.com/avatars/${userId}/${userAvatar}.png?size=256`
      },
      footer: {
        text: `🎰 ATIVE Casino • Web Store • Purchase #${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        icon_url: "https://cdn.discordapp.com/emojis/1234567890.png?size=32"
      },
      timestamp: new Date().toISOString()
    };

    // Add VIP benefits section for subscriptions
    if (isSubscription) {
      const benefits = product.name.includes('Diamond') ? 
        `💎 **Diamond VIP Perks:**\n\`\`\`diff\n+ 5% bonus on all purchases\n+ Exclusive Diamond channels\n+ Priority customer support\n+ Monthly coin allowance\n+ Special Diamond role\n+ Early access to new games\`\`\`` :
        `🔴 **Ruby VIP Perks:**\n\`\`\`diff\n+ 10% bonus on all purchases\n+ All VIP channel access\n+ Premium customer support\n+ Double monthly coins\n+ Exclusive Ruby role\n+ Beta feature access\n+ Priority in tournaments\`\`\``;
      
      embed.fields.push({
        name: "🌟 **VIP Benefits Unlocked**",
        value: benefits,
        inline: false
      });
    }

    // Add celebration message
    const celebrationMessage = isSubscription ?
      `🎊 **CONGRATULATIONS!** 🎊\n${discordUsername} is now a VIP member! Welcome to the exclusive club! 🥂` :
      `💸 **FRESH COINS INCOMING!** 💸\n${discordUsername} just loaded up with ${product.coins.toLocaleString()} coins! Time to hit the tables! 🎲`;

    const webhookPayload = {
      content: celebrationMessage,
      embeds: [embed]
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    console.log(`✅ Enhanced purchase notification sent for ${discordUsername} - ${product.name}`);
  } catch (error) {
    console.error('Failed to send Discord notification:', error.message);
  }
}

// Helper function to get user avatar (fallback if not available)
async function getUserAvatar(userId) {
  try {
    // Try to get avatar from users table
    const [rows] = await dbPool.execute('SELECT avatar FROM users WHERE user_id = ?', [userId]);
    if (rows.length > 0 && rows[0].avatar) {
      return rows[0].avatar;
    }
  } catch (error) {
    console.error('Failed to get user avatar:', error);
  }
  // Return default avatar if not found
  return '0'; // Default Discord avatar
}

// PayPal subscription webhook endpoint
app.post('/paypal/webhook', async (req, res) => {
  try {
    const webhookEvent = req.body;
    const eventType = webhookEvent.event_type;
    
    console.log(`PayPal webhook received: ${eventType}`);

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(webhookEvent);
        break;
      case 'PAYMENT.SALE.COMPLETED':
        await handleSubscriptionPayment(webhookEvent);
        break;
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(webhookEvent);
        break;
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionSuspended(webhookEvent);
        break;
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('PayPal webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Handle subscription activated
async function handleSubscriptionActivated(webhookEvent) {
  try {
    const subscription = webhookEvent.resource;
    const customId = subscription.custom_id;
    
    if (!customId) {
      console.error('No custom_id in subscription activation');
      return;
    }

    const customData = JSON.parse(customId);
    const { userId, discordUsername, productType } = customData;
    const product = PRODUCTS[productType];

    if (!product) {
      console.error(`Unknown product type: ${productType}`);
      return;
    }

    // Add initial coins and activate subscription
    await dbPool.execute(
      'INSERT IGNORE INTO user_balances (user_id, username, wallet, bank) VALUES (?, ?, 1000.00, 0.00)',
      [userId, discordUsername]
    );

    await dbPool.execute(
      'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
      [product.coins, userId]
    );

    // Record subscription in database
    await dbPool.execute(`
      INSERT INTO user_subscriptions (
        user_id, subscription_type, role_id, active, 
        paypal_subscription_id, created_at
      ) VALUES (?, ?, ?, 1, ?, NOW())
      ON DUPLICATE KEY UPDATE 
        active = 1, 
        paypal_subscription_id = ?, 
        created_at = NOW()
    `, [userId, productType, product.roleId, subscription.id, subscription.id]);

    // Assign Discord role
    try {
      await assignDiscordRole(userId, product.roleId, product.name);
    } catch (roleError) {
      console.error('Failed to assign Discord role:', roleError);
    }

    // Send notification
    await sendSubscriptionNotification(userId, discordUsername, product, 'activated');

    console.log(`✅ Subscription activated: ${discordUsername} - ${product.name}`);
  } catch (error) {
    console.error('Error handling subscription activation:', error);
  }
}

// Handle subscription payment
async function handleSubscriptionPayment(webhookEvent) {
  try {
    const payment = webhookEvent.resource;
    const subscriptionId = payment.billing_agreement_id;

    // Get subscription details from database
    const [subscriptions] = await dbPool.execute(
      'SELECT * FROM user_subscriptions WHERE paypal_subscription_id = ?',
      [subscriptionId]
    );

    if (subscriptions.length === 0) {
      console.error(`No subscription found for ID: ${subscriptionId}`);
      return;
    }

    const subscription = subscriptions[0];
    const product = PRODUCTS[subscription.subscription_type];

    // Add monthly coins
    await dbPool.execute(
      'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
      [product.coins, subscription.user_id]
    );

    // Record payment
    await dbPool.execute(`
      INSERT INTO web_purchases (
        user_id, username, product_type, product_name, 
        coins_amount, price, paypal_order_id, 
        payment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', NOW())
    `, [
      subscription.user_id, 
      'Subscriber', 
      subscription.subscription_type, 
      product.name, 
      product.coins, 
      product.price, 
      payment.id
    ]);

    console.log(`✅ Subscription payment processed: ${subscription.subscription_type} - ${product.coins} coins`);
  } catch (error) {
    console.error('Error handling subscription payment:', error);
  }
}

// Handle subscription cancelled/suspended
async function handleSubscriptionCancelled(webhookEvent) {
  await handleSubscriptionStatusChange(webhookEvent, false, 'cancelled');
}

async function handleSubscriptionSuspended(webhookEvent) {
  await handleSubscriptionStatusChange(webhookEvent, false, 'suspended');
}

async function handleSubscriptionStatusChange(webhookEvent, active, status) {
  try {
    const subscription = webhookEvent.resource;
    const subscriptionId = subscription.id;

    // Update subscription status in database
    const [result] = await dbPool.execute(
      'UPDATE user_subscriptions SET active = ? WHERE paypal_subscription_id = ?',
      [active, subscriptionId]
    );

    if (result.affectedRows > 0) {
      // Get subscription details for role removal
      const [subscriptions] = await dbPool.execute(
        'SELECT * FROM user_subscriptions WHERE paypal_subscription_id = ?',
        [subscriptionId]
      );

      if (subscriptions.length > 0) {
        const sub = subscriptions[0];
        const product = PRODUCTS[sub.subscription_type];

        // Remove Discord role if subscription is inactive
        if (!active) {
          try {
            await removeDiscordRole(sub.user_id, product.roleId, product.name);
          } catch (roleError) {
            console.error('Failed to remove Discord role:', roleError);
          }
        }

        console.log(`✅ Subscription ${status}: ${sub.subscription_type} for user ${sub.user_id}`);
      }
    }
  } catch (error) {
    console.error(`Error handling subscription ${status}:`, error);
  }
}

// Send subscription notification
async function sendSubscriptionNotification(userId, discordUsername, product, action) {
  try {
    const webhookUrl = process.env.DISCORD_PURCHASE_WEBHOOK_URL;
    if (!webhookUrl) return;

    const embed = {
      title: action === 'activated' ? "🎭 VIP Subscription Activated!" : "❌ VIP Subscription Cancelled",
      description: `<@${userId}> ${action === 'activated' ? 'is now a VIP member' : 'cancelled their VIP subscription'}!`,
      color: action === 'activated' ? 0x00D4FF : 0xFF6B35,
      fields: [
        {
          name: "💎 Subscription",
          value: product.name,
          inline: true
        },
        {
          name: action === 'activated' ? "🎁 Monthly Coins" : "💔 Status",
          value: action === 'activated' ? `${product.coins.toLocaleString()} coins` : "Cancelled",
          inline: true
        }
      ],
      footer: {
        text: "🎰 ATIVE Casino • VIP Subscriptions",
      },
      timestamp: new Date().toISOString()
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (error) {
    console.error('Failed to send subscription notification:', error);
  }
}

// Import TopGG Manager for vote processing
let topggManager;
try {
  const TopGGManager = require('../UTILS/topgg');
  // We'll need to get the client instance somehow, for now use null
  topggManager = new TopGGManager(null);
} catch (error) {
  console.error('Failed to initialize TopGG Manager:', error);
}

// Top.GG webhook endpoint for bot vote rewards
app.post('/topgg/webhook', async (req, res) => {
  try {
    if (!topggManager) {
      return res.status(500).send('TopGG Manager not initialized');
    }
    
    // Use the TopGG Manager to handle the webhook
    return await topggManager.handleVoteWebhook(req, res);
  } catch (error) {
    console.error('Top.GG webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Top.GG webhook endpoint for server vote rewards
app.post('/topgg/server/webhook', async (req, res) => {
  try {
    if (!topggManager) {
      return res.status(500).send('TopGG Manager not initialized');
    }
    
    // Use the TopGG Manager to handle server votes
    return await topggManager.handleServerVoteWebhook(req, res);
  } catch (error) {
    console.error('Server vote webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Rank.top webhook endpoint for rank.top votes with lottery tickets
app.post('/ranktop/webhook', async (req, res) => {
  try {
    if (!topggManager) {
      return res.status(500).send('TopGG Manager not initialized');
    }
    
    // Use the TopGG Manager to handle rank.top votes
    return await topggManager.handleRanktopVoteWebhook(req, res);
  } catch (error) {
    console.error('Rank.top webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Legacy webhook endpoint (keeping for backward compatibility)
app.post('/topgg/webhook/legacy', async (req, res) => {
  try {
    const webhookSecret = process.env.TOPGG_WEBHOOK_SECRET || 'topgg-webhook-secret';
    const signature = req.headers['x-topgg-signature'];
    
    // Basic signature verification
    if (!signature) {
      return res.status(401).send('Unauthorized - No signature');
    }

    const voteData = req.body;
    const userId = voteData.user;
    
    console.log(`Top.GG vote received from user: ${userId}`);

    // Process vote reward (add coins to user)
    const rewardAmount = 25000; // 25K coins per vote
    
    try {
      // Ensure user exists and add coins
      await dbPool.execute(
        'INSERT IGNORE INTO user_balances (user_id, wallet, bank) VALUES (?, 1000.00, 0.00)',
        [userId]
      );
      
      await dbPool.execute(
        'UPDATE user_balances SET wallet = wallet + ? WHERE user_id = ?',
        [rewardAmount, userId]
      );

      // Update vote tracking
      await dbPool.execute(`
        INSERT INTO user_votes (user_id, total_votes, last_vote_ts, total_earned, can_use_earnmoney) 
        VALUES (?, 1, ?, ?, TRUE)
        ON DUPLICATE KEY UPDATE 
          total_votes = total_votes + 1,
          last_vote_ts = ?,
          total_earned = total_earned + ?,
          can_use_earnmoney = TRUE
      `, [userId, Date.now(), rewardAmount, Date.now(), rewardAmount]);

      console.log(`✅ Vote reward processed: User ${userId} received ${rewardAmount} coins`);
      
      // Send notification to Discord (optional)
      try {
        await sendVoteNotification(userId, rewardAmount);
      } catch (notifyError) {
        console.error('Failed to send vote notification:', notifyError);
      }

    } catch (dbError) {
      console.error('Database error processing vote:', dbError);
      return res.status(500).send('Database error');
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Top.GG webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Send vote notification to Discord
async function sendVoteNotification(userId, rewardAmount) {
  try {
    const webhookUrl = process.env.DISCORD_PURCHASE_WEBHOOK_URL;
    if (!webhookUrl) return;

    const embed = {
      title: "🗳️ New Vote Received!",
      description: `<@${userId}> just voted on Top.GG!`,
      color: 0x00D4FF,
      fields: [
        {
          name: "💰 Reward",
          value: `${rewardAmount.toLocaleString()} coins`,
          inline: true
        },
        {
          name: "🔗 Vote Link",
          value: "[Vote on Top.GG](https://top.gg/bot/1403236218900185088/vote)",
          inline: true
        }
      ],
      footer: {
        text: "🎰 ATIVE Casino • Vote every 12 hours!",
      },
      timestamp: new Date().toISOString()
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
  } catch (error) {
    console.error('Failed to send vote notification:', error);
  }
}

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Debug endpoint for OAuth configuration
app.get('/debug/oauth', (req, res) => {
  const config = {
    hasClientId: !!process.env.DISCORD_OAUTH_CLIENT_ID,
    hasClientSecret: !!process.env.DISCORD_OAUTH_CLIENT_SECRET,
    hasSessionSecret: !!process.env.SESSION_SECRET,
    nodeEnv: process.env.NODE_ENV,
    callbackURL: process.env.DISCORD_OAUTH_REDIRECT_URI || (process.env.NODE_ENV === 'production' 
      ? 'https://ative-casino-bot-production.up.railway.app/auth/discord/callback'
      : 'http://localhost:3000/auth/discord/callback'),
    isAuthenticated: req.isAuthenticated(),
    user: req.user ? { id: req.user.id, username: req.user.username } : null,
    session: {
      id: req.sessionID,
      cookie: req.session.cookie
    }
  };
  
  res.json(config);
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Page Not Found',
    currentPage: '404'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).render('error', {
    title: 'Error - ATIVE Casino Bot',
    currentPage: 'error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

app.listen(PORT, () => {
  console.log(`ATIVE Casino Bot website is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});