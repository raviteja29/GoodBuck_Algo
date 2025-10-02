# ICICI Breeze API Setup Guide

## Prerequisites

1. **ICICI Direct Trading Account**: You need an active ICICI Direct trading account
2. **API Subscription**: Subscribe to ICICI Breeze API service
3. **KYC Completion**: Ensure your KYC is completed for API access

## Step 1: Get ICICI Breeze API Credentials

### 1.1 Login to ICICI Direct Portal
1. Visit [https://www.icicidirect.com/](https://www.icicidirect.com/)
2. Login with your ICICI Direct credentials

### 1.2 Navigate to API Section
1. Go to **"Tools & Services"** → **"API"** → **"Breeze API"**
2. Or search for "Breeze API" in the portal

### 1.3 Register Your Application
Before getting API credentials, you must register your trading application:

**🔧 App Registration Details:**

| Field | Value | Notes |
|-------|--------|--------|
| **App Name** | `YourTradingSystem` | Choose any meaningful name |
| **App Description** | `Multi-broker trading system for personal use` | Brief description of your app |
| **App Type** | `Desktop Application` or `Web Application` | Choose based on your setup |
| **Redirect URL** | `http://localhost:5173/auth/callback` | For development environment |
| **Primary IP Address** | `127.0.0.1` | Your localhost IP for development |
| **Secondary IP** | Leave blank or `::1` | IPv6 localhost (optional) |

**📝 Important Notes:**
- **Development Setup**: Use `127.0.0.1` and `http://localhost:5173`
- **Production Setup**: Use your server's public IP and domain
- **Redirect URL**: Must match exactly what you register
- **IP Whitelisting**: Only registered IPs can access the API

### 1.4 Subscribe to Breeze API
1. Click on **"Subscribe to API"**
2. Read and accept the terms and conditions
3. Pay the subscription fee (if applicable)
4. Wait for API activation (usually takes 1-2 business days)

### 1.5 Generate API Credentials
Once your API is activated:
1. Go to **API Settings** or **API Management**
2. Click **"Generate API Key"**
3. Note down your **API Key** and **Secret Key**
4. Set up your **2PIN** (API Secret) - this is different from your login PIN

## Step 2: Configure Your Application

### 2.1 Update Environment Variables
Open your `.env` file in the `premiumtrader-backend` folder and update:

```env
# ICICI Breeze Configuration
BREEZE_API_KEY=your_actual_api_key_here
BREEZE_SECRET_KEY=your_actual_secret_key_here
```

Replace the placeholder values with your actual credentials from ICICI Direct.

### 2.2 Example Configuration
```env
# Your existing Zerodha config
KITE_API_KEY=mt23bk4vqz8uryv2
KITE_API_SECRET=38oqwj6yq222ek0w5svl6ww7ex43nqmi

# Add your ICICI Breeze credentials here
BREEZE_API_KEY=ICICI123456789
BREEZE_SECRET_KEY=abcd1234efgh5678ijkl9012

PORT=5000
```

## Step 3: Test Your Setup

### 3.1 Start the Server
```bash
cd premiumtrader-backend
node server-new.js
```

### 3.2 Check Available Brokers
Visit: `http://https://goodbuck-algo.onrender.com/api/brokers`

You should see both brokers listed:
```json
{
  "brokers": [
    {
      "id": "zerodha",
      "name": "Zerodha Kite",
      "isAvailable": true
    },
    {
      "id": "breeze",
      "name": "ICICI Breeze",
      "isAvailable": true
    }
  ],
  "activeBroker": "zerodha"
}
```

## Step 4: Login with ICICI Breeze

### 4.1 Switch to Breeze Broker
In your frontend application:
1. Select "ICICI Breeze" from the broker dropdown
2. You'll see the username/password login form

### 4.2 Login Credentials
- **Username**: Your ICICI Direct login ID
- **Password**: Your ICICI Direct password  
- **API Secret (2PIN)**: The 2PIN you set up in API settings

### 4.3 Test Login
Try logging in with your credentials. If successful, you should be redirected to the dashboard.

## Troubleshooting

### Common Issues

#### 1. "Broker not configured" Error
**Problem**: BREEZE_API_KEY or BREEZE_SECRET_KEY not set
**Solution**: Check your `.env` file has the correct credentials

#### 2. Authentication Failed
**Problem**: Invalid username, password, or 2PIN
**Solutions**:
- Verify your ICICI Direct login credentials
- Check your 2PIN is correct (not your trading PIN)
- Ensure API subscription is active

#### 3. API Not Activated
**Problem**: "API access not enabled" error
**Solutions**:
- Contact ICICI Direct customer support
- Verify API subscription payment
- Wait 1-2 business days for activation

#### 4. Network/Connection Issues
**Problem**: Timeout or connection errors
**Solutions**:
- Check internet connection
- Verify ICICI Direct servers are operational
- Try again after some time

### Debug Steps

1. **Check Environment Variables**:
   ```javascript
   console.log('BREEZE_API_KEY:', process.env.BREEZE_API_KEY ? 'Set' : 'Not Set');
   console.log('BREEZE_SECRET_KEY:', process.env.BREEZE_SECRET_KEY ? 'Set' : 'Not Set');
   ```

2. **Test API Connection**:
   ```bash
   curl -X POST "https://api.icicidirect.com/breezeapi/api/v1/customer/authenticate" \
   -H "Content-Type: application/json" \
   -H "X-API-KEY: YOUR_API_KEY" \
   -d '{
     "UserName": "your_username",
     "Password": "your_password",  
     "My2PIN": "your_2pin"
   }'
   ```

## Important Security Notes

### 🔒 Security Best Practices

1. **Never commit credentials to git**:
   ```bash
   # Add to .gitignore
   echo ".env" >> .gitignore
   ```

2. **Use environment variables only**:
   - Never hardcode credentials in source code
   - Use different credentials for development/production

3. **Limit API permissions**:
   - Only enable required API permissions in ICICI Direct portal
   - Regularly review and rotate API keys

4. **Secure your 2PIN**:
   - Don't share your 2PIN with anyone
   - Use a strong, unique 2PIN
   - Don't use the same PIN as your trading PIN

## API Limits & Usage

### Rate Limits
- **Order Placement**: Up to X orders per second
- **Market Data**: Up to Y requests per minute  
- **Account Data**: Up to Z requests per minute

*Note: Check latest ICICI Breeze API documentation for current limits*

### Data Access
- **Live Market Data**: Available during market hours
- **Historical Data**: Limited lookback period
- **Intraday Data**: Available based on subscription

## Support Contacts

### ICICI Direct API Support
- **Phone**: 1800-111-555 (API Support)
- **Email**: api.support@icicidirect.com
- **Portal**: [ICICI Direct Help Center](https://www.icicidirect.com/help)

### Documentation
- **API Docs**: [ICICI Breeze API Documentation](https://api.icicidirect.com/docs)
- **Developer Portal**: [ICICI Developer Portal](https://developer.icicidirect.com)

## Next Steps

Once ICICI Breeze is set up:
1. ✅ Test basic authentication
2. ✅ Verify portfolio data access
3. ✅ Test order placement (with small amounts)
4. ✅ Set up real-time data streaming
5. ✅ Configure risk management rules

Your multi-broker trading system is now ready to use both Zerodha Kite and ICICI Breeze!