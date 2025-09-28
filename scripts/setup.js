/**
 * ATIVE Casino Bot - Setup Script
 * Initializes the project and checks dependencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🎰 ATIVE Casino Bot Setup');
console.log('=========================\n');

// Check if .env file exists
function checkEnvFile() {
    console.log('📋 Checking environment configuration...');
    
    const envPath = path.join(__dirname, '.env');
    const envExamplePath = path.join(__dirname, '.env.example');
    
    if (!fs.existsSync(envPath)) {
        console.log('⚠️  .env file not found');
        
        // Create .env.example if it doesn't exist
        if (!fs.existsSync(envExamplePath)) {
            const envExample = `# ATIVE Casino Bot Environment Variables
# Copy this file to .env and fill in your values

# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_client_id_here

# MariaDB Configuration
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=casino_bot
MARIADB_PASSWORD=your_database_password
MARIADB_DATABASE=ative_casino

# Environment Configuration
ENVIRONMENT=development

# Optional Configuration
LOG_LEVEL=info
`;
            fs.writeFileSync(envExamplePath, envExample);
            console.log('✅ Created .env.example file');
        }
        
        console.log('📝 Please create a .env file based on .env.example');
        console.log('   1. Copy .env.example to .env');
        console.log('   2. Fill in your Discord bot token and other required values');
        console.log('   3. Run setup again\n');
        return false;
    } else {
        console.log('✅ .env file found\n');
        return true;
    }
}

// Check required directories
function checkDirectories() {
    console.log('📁 Checking directory structure...');
    
    const requiredDirs = [
        'COMMANDS',
        'GAMES', 
        'UTILS',
        'assets',
        'assets/blackjack',
        'assets/slots',
        'logs'
    ];
    
    let allExist = true;
    
    for (const dir of requiredDirs) {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            console.log(`⚠️  Missing directory: ${dir}`);
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`✅ Created directory: ${dir}`);
            allExist = false;
        }
    }
    
    if (allExist) {
        console.log('✅ All required directories exist');
    }
    console.log('');
}

// Check Node.js version
function checkNodeVersion() {
    console.log('🟢 Checking Node.js version...');
    
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    console.log(`   Current version: ${nodeVersion}`);
    
    if (majorVersion < 18) {
        console.log('❌ Node.js version 18.0.0 or higher is required');
        console.log('   Please update Node.js and try again\n');
        return false;
    } else {
        console.log('✅ Node.js version is compatible\n');
        return true;
    }
}

// Install dependencies
function installDependencies() {
    console.log('📦 Installing dependencies...');
    
    try {
        execSync('npm install', { stdio: 'inherit' });
        console.log('✅ Dependencies installed successfully\n');
        return true;
    } catch (error) {
        console.log('❌ Failed to install dependencies');
        console.log('   Please run "npm install" manually\n');
        return false;
    }
}

// Check MariaDB setup
function checkDatabaseSetup() {
    console.log('🗄️ Checking MariaDB configuration...');
    
    try {
        require('dotenv').config();
        
        const requiredVars = [
            'MARIADB_HOST',
            'MARIADB_USER', 
            'MARIADB_PASSWORD',
            'MARIADB_DATABASE'
        ];
        
        const missing = requiredVars.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            console.log('⚠️  Missing MariaDB environment variables:');
            missing.forEach(varName => console.log(`   - ${varName}`));
            console.log('   Please update your .env file\n');
            return false;
        } else {
            console.log('✅ MariaDB configuration found\n');
            return true;
        }
    } catch (error) {
        console.log('⚠️  Could not verify MariaDB configuration');
        console.log('   Make sure .env file exists and contains MariaDB variables\n');
        return false;
    }
}

// Main setup function
async function setup() {
    console.log('Starting setup process...\n');
    
    let setupSuccess = true;
    
    // Check Node.js version
    if (!checkNodeVersion()) {
        setupSuccess = false;
    }
    
    // Check directories
    checkDirectories();
    
    // Install dependencies
    if (!installDependencies()) {
        setupSuccess = false;
    }
    
    // Check .env file
    if (!checkEnvFile()) {
        setupSuccess = false;
    }
    
    // Check database setup
    if (!checkDatabaseSetup()) {
        setupSuccess = false;
    }
    
    console.log('=========================');
    if (setupSuccess) {
        console.log('🎉 Setup completed successfully!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Make sure your .env file is configured correctly');
        console.log('2. Run "npm start" to start the bot');
        console.log('3. Run "node index.js" to test the bot');
        console.log('');
        console.log('For development:');
        console.log('- Use "npm run dev" for auto-restart on changes');
        console.log('- Check logs/ directory for application logs');
    } else {
        console.log('⚠️  Setup completed with warnings');
        console.log('Please resolve the issues above before starting the bot');
    }
    console.log('=========================');
}

// Run setup
setup().catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
});