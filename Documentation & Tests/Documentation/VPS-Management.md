# VPS Management via Discord Bot

## Overview
The ATIVE Casino Bot includes integrated VPS management capabilities, allowing the developer to remotely control the production deployment directly from Discord without needing SSH access.

## Command: `/dev vps`

### Prerequisites
- **SSH Key Authentication**: The local development machine must have SSH key access to the VPS
- **PM2**: The VPS must have PM2 installed and the bot running as `ative-casino-bot` process
- **Git Repository**: The VPS must have the git repository cloned at `~/AtiveCasino`

### Available Actions

#### 1. Pull & Restart (`pull_restart`)
**Usage**: `/dev vps action:Pull & Restart`

**What it does**:
1. SSH into the VPS
2. Navigate to `~/AtiveCasino` directory  
3. Pull latest code from `main` branch
4. Run `npm install` to update dependencies
5. Restart the PM2 process or start it if not running

**Use case**: Complete deployment of new code changes

#### 2. Restart Only (`restart`)
**Usage**: `/dev vps action:Restart Only`

**What it does**:
1. SSH into the VPS
2. Restart the `ative-casino-bot` PM2 process

**Use case**: Restart bot without pulling new code (e.g., after config changes)

#### 3. Pull Only (`pull`)
**Usage**: `/dev vps action:Pull Only`

**What it does**:
1. SSH into the VPS
2. Pull latest code from `main` branch
3. Run `npm install` to update dependencies
4. **Does not restart** the bot

**Use case**: Update code without disrupting current bot session

#### 4. Status (`status`)
**Usage**: `/dev vps action:Status`

**What it does**:
1. Check PM2 process status for `ative-casino-bot`
2. Show latest git commit information

**Use case**: Check if bot is running and what version is deployed

#### 5. Logs (`logs`)
**Usage**: `/dev vps action:Logs lines:50`

**What it does**:
1. Retrieve recent PM2 logs for `ative-casino-bot`
2. Show specified number of lines (default: 50, max: 100)

**Use case**: Debug issues or monitor bot activity

## Security Features

### Permission Control
- **Developer Only**: Command restricted to `DEVELOPER_USER_ID` (466050111680544798)
- **Ephemeral Responses**: All responses are private to the developer

### Error Handling
- **SSH Connection Failures**: Gracefully handled with error messages
- **Command Execution Failures**: Logged and reported
- **Output Truncation**: Long outputs are truncated to fit Discord limits

## Setup Requirements

### VPS Configuration
```bash
# Install PM2 globally
npm install -g pm2

# Clone repository
cd ~
git clone [repository-url] AtiveCasino
cd AtiveCasino

# Install dependencies
npm install

# Start with PM2
pm2 start index.js --name ative-casino-bot

# Save PM2 configuration
pm2 save
pm2 startup
```

### SSH Configuration
The development machine needs passwordless SSH access:
```bash
# Generate SSH key if not exists
ssh-keygen -t rsa -b 4096

# Copy public key to VPS
ssh-copy-id root@ativecasino
```

### Environment Variables
Ensure the VPS has all required environment variables:
- `DISCORD_TOKEN`
- `CLIENT_ID` 
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `DEVELOPER_USER_ID`

## Troubleshooting

### Common Issues

**Canvas Build Errors**:
- Use `Pull & Restart` action to rebuild native dependencies on Linux

**PM2 Process Not Found**:
- The command will automatically start a new PM2 process if none exists

**SSH Connection Refused**:
- Verify SSH key authentication is properly configured
- Check VPS firewall settings
- Ensure SSH service is running on VPS

**Git Pull Conflicts**:
- May require manual intervention on VPS to resolve merge conflicts

### Monitoring
- Use `/dev vps action:Status` regularly to verify deployment status
- Use `/dev vps action:Logs` to monitor for errors after deployments
- Check Discord bot presence to confirm successful restarts

## Best Practices

1. **Test Locally First**: Always test changes locally before deploying
2. **Use Pull & Restart**: For complete deployments with new code
3. **Monitor After Deployment**: Check logs and status after each deployment
4. **Backup Before Major Changes**: Consider database backups for significant updates
5. **Gradual Rollouts**: Deploy during low-activity periods when possible

This system provides seamless deployment management without requiring direct VPS access, making it ideal for rapid iterations and quick fixes.