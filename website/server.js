/**
 * ATIVE Casino Bot Website
 * Express.js server for hosting information pages on Railway
 */

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);

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