#!/usr/bin/env node

/**
 * Square Configuration Checker
 * Validates Square payment integration setup before build/start
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Square Payment Configuration...\n');

// Load environment variables
require('dotenv').config();

const checkEnvFile = () => {
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.square.example');
  
  if (!fs.existsSync(envPath)) {
    console.log('⚠️  .env file not found');
    if (fs.existsSync(envExamplePath)) {
      console.log('💡 Copy .env.square.example to .env and configure your Square credentials');
    }
    return false;
  }
  
  console.log('✅ .env file found');
  return true;
};

const checkSquareCredentials = () => {
  const appId = process.env.REACT_APP_SQUARE_APPLICATION_ID;
  const locationId = process.env.REACT_APP_SQUARE_LOCATION_ID;
  const environment = process.env.REACT_APP_SQUARE_ENVIRONMENT || 'sandbox';
  
  let isValid = true;
  
  console.log('🔑 Square Credentials Check:');
  
  // Check Application ID
  if (!appId) {
    console.log('❌ REACT_APP_SQUARE_APPLICATION_ID is missing');
    isValid = false;
  } else {
    const isSandbox = appId.startsWith('sandbox-sq0idb-');
    const isProduction = appId.startsWith('sq0idp-');
    
    if (isSandbox) {
      console.log('✅ Sandbox Application ID detected');
      if (environment === 'production') {
        console.log('⚠️  Using sandbox credentials in production environment');
      }
    } else if (isProduction) {
      console.log('✅ Production Application ID detected');
      if (environment === 'sandbox') {
        console.log('⚠️  Using production credentials in sandbox environment');
      }
    } else {
      console.log('❌ Invalid Application ID format');
      console.log('   Expected: sandbox-sq0idb-... or sq0idp-...');
      isValid = false;
    }
  }
  
  // Check Location ID
  if (!locationId) {
    console.log('❌ REACT_APP_SQUARE_LOCATION_ID is missing');
    isValid = false;
  } else if (!locationId.startsWith('L')) {
    console.log('❌ Invalid Location ID format');
    console.log('   Expected: Location ID starting with "L"');
    isValid = false;
  } else {
    console.log('✅ Location ID format is valid');
  }
  
  // Environment check
  console.log(`📍 Environment: ${environment}`);
  
  return isValid;
};

const checkSquareSDKAccess = async () => {
  console.log('\n🌐 Checking Square SDK accessibility...');
  
  const https = require('https');
  const url = process.env.REACT_APP_SQUARE_ENVIRONMENT === 'production' 
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js';
  
  return new Promise((resolve) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 200) {
        console.log('✅ Square SDK is accessible');
        resolve(true);
      } else {
        console.log(`❌ Square SDK returned status: ${response.statusCode}`);
        resolve(false);
      }
    });
    
    request.on('error', (error) => {
      console.log(`❌ Cannot access Square SDK: ${error.message}`);
      console.log('   This might indicate network issues or blocked access');
      resolve(false);
    });
    
    request.setTimeout(5000, () => {
      console.log('❌ Square SDK access timeout (5s)');
      request.destroy();
      resolve(false);
    });
  });
};

const displayConfiguration = () => {
  console.log('\n📋 Current Configuration:');
  console.log(`   Application ID: ${process.env.REACT_APP_SQUARE_APPLICATION_ID ? '***' + process.env.REACT_APP_SQUARE_APPLICATION_ID.slice(-8) : 'Not set'}`);
  console.log(`   Location ID: ${process.env.REACT_APP_SQUARE_LOCATION_ID ? '***' + process.env.REACT_APP_SQUARE_LOCATION_ID.slice(-4) : 'Not set'}`);
  console.log(`   Environment: ${process.env.REACT_APP_SQUARE_ENVIRONMENT || 'sandbox (default)'}`);
  console.log(`   Debug Mode: ${process.env.REACT_APP_DEBUG_SQUARE || 'false (default)'}`);
};

const displayTestCards = () => {
  if (process.env.REACT_APP_SQUARE_ENVIRONMENT !== 'production') {
    console.log('\n🧪 Sandbox Test Cards:');
    console.log('   Visa (Success): 4111 1111 1111 1111');
    console.log('   Mastercard (Success): 5555 5555 5555 4444');
    console.log('   Amex (Success): 3782 8224 6310 005');
    console.log('   Visa (Declined): 4000 0000 0000 0002');
    console.log('   CVV: Any 3-digit number (4 for Amex)');
    console.log('   Expiry: Any future date');
  }
};

const displayNextSteps = (hasIssues) => {
  console.log('\n📝 Next Steps:');
  
  if (hasIssues) {
    console.log('1. Fix the configuration issues above');
    console.log('2. Restart the development server');
    console.log('3. Test payment integration');
  } else {
    console.log('✅ Configuration looks good!');
    console.log('1. Test payment integration in your app');
    console.log('2. Check browser console for any runtime errors');
  }
  
  console.log('\n📚 Resources:');
  console.log('   Setup Guide: Documentation & Tests/Documentation/Square-Payment-Setup.md');
  console.log('   Square Dashboard: https://developer.squareup.com/apps');
  console.log('   Test Cards: https://developer.squareup.com/docs/testing/test-values');
};

// Main execution
async function main() {
  let hasIssues = false;
  
  // Check .env file
  if (!checkEnvFile()) {
    hasIssues = true;
  }
  
  // Check credentials
  if (!checkSquareCredentials()) {
    hasIssues = true;
  }
  
  // Check SDK access (optional, might fail in CI/CD environments)
  try {
    await checkSquareSDKAccess();
  } catch (error) {
    console.log('⚠️  Could not verify Square SDK access (this may be normal in CI/CD)');
  }
  
  // Display current configuration
  displayConfiguration();
  
  // Show test cards for sandbox
  displayTestCards();
  
  // Display next steps
  displayNextSteps(hasIssues);
  
  // Exit with error code if there are issues
  if (hasIssues) {
    console.log('\n❌ Square configuration has issues. Please fix them before proceeding.\n');
    process.exit(1);
  } else {
    console.log('\n✅ Square configuration check passed!\n');
    process.exit(0);
  }
}

// Run the checker
main().catch((error) => {
  console.error('\n❌ Error during configuration check:', error.message);
  process.exit(1);
});