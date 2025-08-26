# 🍃 MongoDB Atlas Backup Database Setup

## Overview
This system provides automatic fallback from Firestore to MongoDB Atlas when quota limits are exceeded, ensuring uninterrupted service with virtually unlimited reads at low cost.

## Why MongoDB Atlas?
- **Free Tier**: 512MB storage, 100 connections
- **Cheap Scaling**: $0.10/GB/month beyond free tier
- **High Read Capacity**: 1000+ reads per second
- **Global Distribution**: Multiple regions available
- **99.95% Uptime SLA**

## Setup Instructions

### 1. Create MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for free account
3. Create new project: `ATIVE-Casino-Backup`

### 2. Create Cluster
1. Choose **FREE M0 Sandbox** tier
2. Select closest region (e.g., `us-east-1`)
3. Name cluster: `ative-casino-backup`
4. Create cluster (takes 3-5 minutes)

### 3. Setup Database Access
1. Go to **Database Access**
2. Click **Add New Database User**
3. Username: `ative-casino-user`
4. Password: Generate secure password
5. Database User Privileges: **Read and write to any database**
6. Add User

### 4. Setup Network Access
1. Go to **Network Access**
2. Click **Add IP Address**
3. Choose **Allow Access From Anywhere** (0.0.0.0/0)
   - For production, use specific IP ranges
4. Confirm

### 5. Get Connection String
1. Go to **Clusters**
2. Click **Connect** on your cluster
3. Choose **Connect your application**
4. Select **Node.js** driver
5. Copy connection string
6. Replace `<password>` with your database user password

### 6. Configure Environment Variables

#### For Web API Server:
Add to `/web-api-server/.env`:
```bash
# MongoDB Backup Database
MONGODB_URI=mongodb+srv://ative-casino-user:Sa54uVvPR34RXLas@ative-casino-backup.xxxxx.mongodb.net/ative_casino_backup?retryWrites=true&w=majority
MONGODB_DB_NAME=ative_casino_backup
```



#### For Discord Bot:
Add to `/.env`:
```bash
# MongoDB Backup Database
MONGODB_URI=mongodb+srv://ative-casino-user:YOUR_PASSWORD@ative-casino-backup.xxxxx.mongodb.net/ative_casino_backup?retryWrites=true&w=majority
MONGODB_DB_NAME=ative_casino_backup
```

## How It Works

### Automatic Fallback
1. **Primary**: Firestore (fast, limited quota)
2. **Fallback**: MongoDB Atlas (unlimited, cheap)
3. **Emergency**: Local storage (temporary)

### Database Collections

#### `users`
- User profile data
- Indexes: `userId` (unique), `createdAt`, `lastUpdated`

#### `user_balances` 
- Wallet, bank, and credit balances
- Indexes: `userId` (unique), `lastUpdated`

#### `transactions`
- All financial transactions
- Indexes: `userId + timestamp`, `type + timestamp`, `timestamp`

#### `purchases`
- Credit purchases from web portal
- Indexes: `userId + timestamp`, `paymentId` (unique), `timestamp`

## Cost Estimation

### Free Tier (512MB)
- **Users**: ~50,000 user records
- **Transactions**: ~500,000 transaction records
- **Monthly Cost**: $0

### Paid Tier (Beyond 512MB)
- **Storage**: $0.10/GB/month
- **Reads**: Virtually unlimited included
- **Example**: 5GB = $0.50/month

## API Endpoints

### Balance Update
```
POST /api/users/update-balance
{
  "userId": "123456789",
  "credits": 1000,
  "operation": "add",
  "source": "credit_purchase",
  "paymentId": "sim_1234567890"
}
```

### Database Status
```
GET /api/database/status
```
Returns current status of both Firestore and MongoDB.

## Monitoring

### Health Checks
- Automatic health checks every 5 minutes
- Switches between databases based on availability
- Logs all database operations

### Status Dashboard
Check database status at: `http://localhost:5001/api/database/status`

Response:
```json
{
  "firestore": {
    "available": false,
    "lastCheck": 1672531200000
  },
  "mongodb": {
    "available": true,
    "connected": true
  },
  "primaryDB": "mongodb"
}
```

## Benefits

### For Users
- ✅ No service interruptions
- ✅ Purchases always succeed
- ✅ Balances always update

### For Developers
- ✅ Automatic failover
- ✅ Cost-effective scaling
- ✅ No manual intervention needed
- ✅ Comprehensive logging

### For Business
- ✅ 99.9% uptime
- ✅ Unlimited growth potential
- ✅ Minimal operational costs
- ✅ Revenue protection

## Maintenance

### Data Sync
- Automatic sync between databases
- Conflict resolution built-in
- Manual sync commands available

### Backup Strategy
- MongoDB Atlas: Automatic backups
- Firestore: Built-in backups
- Local storage: Emergency only

## Testing

Test the fallback system:
```bash
# Force MongoDB mode
curl -X POST http://localhost:5001/api/database/force-mongodb

# Test purchase
# Complete a credit purchase in web portal

# Check status
curl http://localhost:5001/api/database/status

# Switch back
curl -X POST http://localhost:5001/api/database/force-firestore
```

## Production Recommendations

1. **Network Security**: Whitelist specific IP addresses
2. **Connection Pooling**: Optimize for high traffic
3. **Monitoring**: Set up Atlas alerts
4. **Backups**: Configure automated backups
5. **Scaling**: Monitor storage and upgrade as needed

---

**Ready to go!** The system will automatically use MongoDB when Firestore quota is exceeded, ensuring your users never experience payment failures.