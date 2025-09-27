# 📈 ATIVE Casino Stock Trading System with Beautiful Charts

## Overview
The stocks command provides a marriage-only stock trading system powered by Polygon.io API. Married couples can buy and sell stocks using their shared bank account, with real-time price data cached for 30 minutes to respect API rate limits, plus beautiful interactive charts!

## Features
- ✅ **Marriage-only access** - Only married couples can trade stocks
- ✅ **Real-time stock prices** - Powered by Polygon.io API  
- ✅ **Smart caching system** - 30-minute cache + rate limiting (max 4 API calls per 30min)
- ✅ **Beautiful visual charts** - Price charts, portfolio distribution, profit/loss analysis
- ✅ **Portfolio tracking** - Track holdings with average cost basis
- ✅ **Advanced analytics** - Best/worst performers, diversification metrics
- ✅ **Transaction history** - Complete audit trail of all trades
- ✅ **Shared bank integration** - Uses marriage shared bank for funding
- ✅ **Partner notifications** - Both spouses are notified of trades

## Commands
- `/stocks price <symbol>` - Get current stock price **with price chart**
- `/stocks buy <symbol> <shares>` - Purchase stocks (requires confirmation)
- `/stocks sell <symbol> <shares>` - Sell stocks  
- `/stocks portfolio` - View marriage stock portfolio **with distribution chart**
- `/stocks popular` - View popular stocks with current prices
- `/stocks analytics` - **NEW!** Advanced analytics with multiple charts

## Setup Instructions

### 1. Polygon.io API Key
1. Sign up at https://polygon.io/
2. Get your API key from the dashboard
3. Add to your `.env` file:
```env
POLYGON_API_KEY=your_api_key_here
```

### 2. Database Tables
The system automatically creates these tables:
- `marriage_stock_holdings` - Current stock positions
- `marriage_stock_transactions` - Transaction history

### 3. Minimum Requirements
- Users must be married (use `/propose` and `/start-marriage`)
- Minimum investment: $100 per transaction
- Funds must be in marriage shared bank account

## 📊 Chart Features

### Price Charts
- **Line charts** showing 30-day price history with current price
- **Green/red coloring** based on daily performance
- **Professional styling** with dark background
- **Volume data** and OHLC (Open, High, Low, Close) prices

### Portfolio Charts  
- **Pie/doughnut charts** showing portfolio distribution
- **Profit/loss bar charts** for individual holdings
- **Color-coded performance** (green=profit, red=loss)
- **Percentage breakdowns** with actual dollar amounts

### Analytics Dashboard
- **Best/worst performer** identification
- **Diversification metrics** and position sizing
- **Trading activity** summaries (buy/sell ratio)
- **Recent transaction history** with visual formatting

## API Rate Limits & Caching
- Polygon.io allows 5 requests per minute on free tier
- **Conservative limit**: Max 4 API calls per 30 minutes
- **Smart caching**: 30-minute primary cache + 24-hour extended cache  
- **Rate limit protection**: Automatic fallback to extended cache
- **Mock data fallback** if API key not configured
- **Cache status indicators** show data source in embeds

## Security Features
- All transactions require button confirmation
- Both marriage partners are notified of trades
- Complete audit trail in database
- Funds only come from shared marriage bank
- Input validation and error handling

## Example Usage
```
/stocks price AAPL           # Get AAPL price with chart
/stocks buy AAPL 10          # Buy 10 shares with confirmation
/stocks portfolio            # View portfolio with pie chart
/stocks analytics            # Advanced analytics dashboard
/stocks sell AAPL 5          # Sell 5 shares
```

## Technical Details
- **QuickChart.js** for professional chart generation
- **NodeCache** for intelligent caching system
- **Average cost basis** calculated automatically
- **Foreign key constraints** ensure data integrity
- **Graceful fallbacks** for API unavailability
- **Transaction handling** with database rollbacks
- **Chart URLs** cached separately for performance