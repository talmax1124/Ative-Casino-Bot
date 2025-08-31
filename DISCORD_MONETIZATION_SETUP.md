# Discord Server Products & Monetization Setup Guide

## 🎯 Overview

This guide walks you through setting up Discord's Server Products/Premium Apps to monetize your ATIVE Casino Bot. Users will be able to purchase coin packs directly through Discord, and your bot will automatically reward them with casino coins.

## 🚀 Quick Start Summary

1. **Create SKUs** in Discord Developer Portal
2. **Update SKU IDs** in your bot code
3. **Test purchases** in development
4. **Go live** with monetization

---

## 📋 Step 1: Discord Developer Portal Setup

### **Access Your Application**

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your **ATIVE Casino Bot** application
3. Navigate to **"Monetization"** in the left sidebar
4. Click **"SKUs"** tab

### **Create Your SKUs (Products)**

Create these 4 products matching your bot configuration:

#### **Small Coin Pack**
- **Name:** Small Coin Pack
- **SKU ID:** `small_coin_pack_1000` ⚠️ **Copy this exact ID**
- **Type:** Consumable (One-time purchase)
- **Price:** $0.99 USD
- **Description:** Get 1,000 casino coins instantly!

#### **Medium Coin Pack**
- **Name:** Medium Coin Pack  
- **SKU ID:** `medium_coin_pack_5500` ⚠️ **Copy this exact ID**
- **Type:** Consumable
- **Price:** $4.99 USD
- **Description:** Get 5,500 casino coins (10% bonus included!)

#### **Large Coin Pack**
- **Name:** Large Coin Pack
- **SKU ID:** `large_coin_pack_18750` ⚠️ **Copy this exact ID**
- **Type:** Consumable
- **Price:** $14.99 USD
- **Description:** Get 18,750 casino coins (25% bonus included!)

#### **Mega Coin Pack**
- **Name:** Mega Coin Pack
- **SKU ID:** `mega_coin_pack_75000` ⚠️ **Copy this exact ID**
- **Type:** Consumable
- **Price:** $39.99 USD
- **Description:** Get 75,000 casino coins (50% bonus included!)

> **Important:** Use the exact SKU IDs shown above, or update them in your bot code to match!

---

## 🔧 Step 2: Update Your Bot Code

### **Method A: Use Pre-configured IDs (Recommended)**

The bot is already configured with the SKU IDs shown above. Just make sure you create the SKUs in Discord Developer Portal with those exact IDs.

### **Method B: Use Custom SKU IDs**

If you want different SKU IDs, update `/UTILS/serverProducts.js`:

```javascript
const SERVER_PRODUCTS = {
    'small_coin_pack': {
        id: 'YOUR_ACTUAL_SKU_ID_HERE', // Replace with your SKU ID from Discord Portal
        name: '🪙 Small Coin Pack',
        // ... rest stays the same
    },
    // ... update all 4 products
};
```

---

## 🛍️ Step 3: How Users Purchase

### **Option 1: /shop Command (Recommended)**

Users can use the new `/shop` command:

```
/shop
```

This shows all available products and opens Discord's purchase interface.

### **Option 2: Direct Premium Buttons**

The bot automatically creates premium purchase buttons that integrate directly with Discord's payment system.

---

## ⚙️ Step 4: Testing Your Setup

### **Development Testing**

1. **Enable Test Mode** in Discord Developer Portal:
   - Go to your app → Monetization → Settings
   - Enable "Test Mode"

2. **Test Purchases:**
   - Use `/shop` command in your test server  
   - Make test purchases (they won't charge real money)
   - Verify coins are added to user accounts

3. **Check Logs:**
   - Monitor your bot logs for entitlement events
   - Verify database records are created
   - Use `/serverproducts history` to see purchase records

### **Verification Checklist**

- [ ] SKUs created in Developer Portal
- [ ] SKU IDs match bot configuration  
- [ ] `/shop` command works
- [ ] Test purchases complete successfully
- [ ] Coins are added to user wallets
- [ ] Purchase records appear in database
- [ ] Admin can see purchase history with `/serverproducts`

---

## 🎯 Step 5: Going Live

### **Enable Production Mode**

1. **Disable Test Mode** in Discord Developer Portal
2. **Review Pricing** - make sure all prices are correct
3. **Test with Small Purchase** - verify everything works with real money
4. **Announce to Users** - let your community know about the new shop!

### **Marketing Your Products**

```
🛍️ NEW: Casino Coin Shop is now open!

💰 Buy coin packs directly through Discord:
• Small Pack: $0.99 → 1,000 coins
• Medium Pack: $4.99 → 5,500 coins (10% bonus!)  
• Large Pack: $14.99 → 18,750 coins (25% bonus!)
• Mega Pack: $39.99 → 75,000 coins (50% bonus!)

Use `/shop` to get started! 🎰
```

---

## 📊 Step 6: Managing Your Shop

### **Admin Commands**

Use these commands to manage your monetization:

```bash
# View available products and their configuration
/serverproducts list

# See purchase history for all users or specific user  
/serverproducts history user:@someone days:7

# View sales statistics and revenue
/serverproducts stats

# Issue refunds (removes coins from user account)
/serverproducts refund entitlement_id:abc123 reason:"Requested refund"
```

### **Monitoring Sales**

- **Purchase Logs:** All purchases logged to channel `1405096821512212521`
- **Database Records:** Full audit trail in `purchases` table
- **User Notifications:** Buyers receive confirmation messages
- **Error Alerts:** Any issues are automatically logged

---

## 🛡️ Security & Compliance

### **Data Protection**

- ✅ Purchase data is encrypted and secured
- ✅ No payment info is stored by your bot
- ✅ Discord handles all payment processing
- ✅ Full GDPR compliance with Privacy Policy

### **Anti-Fraud**

- ✅ Entitlement verification prevents fake purchases
- ✅ One-time consumables prevent duplicate rewards
- ✅ Admin refund system for dispute resolution
- ✅ Complete audit trail for all transactions

---

## ❓ Troubleshooting

### **Common Issues**

**"No products available"**
- ✅ Check SKUs are created in Developer Portal
- ✅ Verify SKU IDs match your bot code
- ✅ Make sure bot has proper permissions

**"Purchase not working"**
- ✅ Confirm your bot application has monetization enabled
- ✅ Check if test mode is enabled (disable for production)
- ✅ Verify user has payment method set up

**"Coins not delivered"**
- ✅ Check bot logs for entitlement events
- ✅ Verify database connection is working
- ✅ Use `/serverproducts history` to check purchase records

### **Support Channels**

- **Bot Issues:** Use `/support` command
- **Payment Issues:** Direct users to Discord Support  
- **Setup Help:** Check this documentation

---

## 💡 Advanced Configuration

### **Custom Products**

To add new products:

1. **Create SKU** in Discord Developer Portal
2. **Add to Code** in `serverProducts.js`:

```javascript
'new_product': {
    id: 'your_new_sku_id',
    name: '✨ Special Pack',
    description: 'Limited time offer!',
    reward: 25000,
    price: 19.99
}
```

3. **Restart Bot** to load new configuration

### **Pricing Strategy**

Current bonus structure:
- **Small:** No bonus (baseline)
- **Medium:** 10% bonus (encourages larger purchases)
- **Large:** 25% bonus (best value proposition)  
- **Mega:** 50% bonus (premium tier)

### **Revenue Optimization**

- **Monitor Popular Packs:** Use `/serverproducts stats`
- **Adjust Pricing:** Based on purchase patterns
- **Seasonal Offers:** Create limited-time SKUs
- **Bundle Deals:** Combine coins with exclusive perks

---

## 🎉 Success!

Your Discord Server Products monetization is now fully set up! Users can purchase coin packs directly through Discord, and your bot will automatically reward them with casino coins.

### **What Happens Next?**

1. **Users see `/shop` command** in their slash command list
2. **Premium purchase buttons** appear when they use the shop
3. **Discord handles payment processing** securely
4. **Your bot receives entitlement events** automatically  
5. **Coins are added to user wallets** instantly
6. **Purchase records are logged** for your records

### **Revenue Tracking**

- View real-time sales with `/serverproducts stats`
- Export purchase data from your database
- Monitor user engagement and spending patterns
- Scale your monetization strategy based on data

**🚀 Ready to monetize your casino bot!**