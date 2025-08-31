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
    name: '💎 200K Coins Pack',
    price: '9.99',
    coins: 200000,
    description: '200,000 casino coins for gaming'
  },
  coins_500k: {
    name: '👑 500K Coins Pack',
    price: '19.99',
    coins: 500000,
    description: '500,000 casino coins for gaming'
  },
  coins_1m: {
    name: '🚀 1M Coins Pack',
    price: '39.99',
    coins: 1000000,
    description: '1,000,000 casino coins for gaming'
  },
  diamond_subscription: {
    name: '💎 Diamond Subscription',
    price: '4.99',
    coins: 50000,
    description: 'Monthly Diamond VIP subscription',
    roleId: '1411582691073196155',
    type: 'subscription'
  },
  ruby_subscription: {
    name: '🔴 Ruby Subscription',
    price: '9.99',
    coins: 100000,
    description: 'Monthly Ruby VIP subscription',
    roleId: '1411582733813158001',
    type: 'subscription'
  }
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Discord OAuth2 Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_OAUTH_CLIENT_ID || process.env.CLIENT_ID,
  clientSecret: process.env.DISCORD_OAUTH_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_OAUTH_REDIRECT_URI || '/auth/discord/callback',
  scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Store user info in database
    await dbPool.execute(
      'INSERT INTO users (user_id, username, discriminator, avatar, email) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, discriminator = ?, avatar = ?, email = ?',
      [
        profile.id,
        profile.username,
        profile.discriminator,
        profile.avatar,
        profile.email,
        profile.username,
        profile.discriminator,
        profile.avatar,
        profile.email
      ]
    );
    
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
    const [rows] = await dbPool.execute('SELECT * FROM users WHERE user_id = ?', [id]);
    if (rows.length > 0) {
      const user = rows[0];
      // Format the user object to match Discord profile structure
      done(null, {
        id: user.user_id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email
      });
    } else {
      done(null, null);
    }
  } catch (error) {
    done(error, null);
  }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  if (req.isAuthenticated()) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/discord');
}

// Discord OAuth2 Routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication
    const returnTo = req.session.returnTo || '/shop';
    delete req.session.returnTo;
    res.redirect(returnTo);
  }
);

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

// Create PayPal order endpoint
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

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
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