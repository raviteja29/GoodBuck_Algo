# ICICI Breeze Credentials Template

## Step 1: Get Your API Credentials from ICICI Direct

### Login to ICICI Direct Portal
1. Visit: https://www.icicidirect.com/
2. Login with your trading account credentials

### Register Your Application
Before getting API credentials, you need to register your trading application:

**Required Information for App Registration:**

1. **App Name**: `Your Trading System` (or any name you prefer)
2. **App Description**: `Multi-broker trading system for personal use`
3. **App Type**: `Desktop Application` or `Web Application`
4. **Redirect URL**: `http://localhost:5173/auth/callback`
   - This is where users will be redirected after authentication
   - Use `http://localhost:5173` if you don't need a specific callback
5. **Primary IP Address**: `127.0.0.1` 
   - This is your localhost IP address for development
   - For production, use your server's public IP address
6. **Secondary IP Address (optional)**: Leave blank or use `::1` (IPv6 localhost)

**Development vs Production URLs:**
- **Development**: `http://localhost:5173/auth/callback`
- **Production**: `https://yourdomain.com/auth/callback`

**Development vs Production IP:**
- **Development**: `127.0.0.1` (localhost)
- **Production**: Your server's public IP address

### Navigate to API Section  
1. Go to: Tools & Services → API → Breeze API
2. Subscribe to API service if not already done
3. Click "Register App" or "Create New App"
4. Fill in the app registration details (see above)
5. Generate/View your API credentials after approval

### Copy Your Credentials
```
API Key: [Your API Key from ICICI Direct]
Secret Key: [Your Secret Key from ICICI Direct]  
2PIN: [Your API Secret/2PIN from ICICI Direct]
```

## Step 2: Update Your .env File

Replace the placeholder values in your `.env` file:

```env
# Current placeholder values in .env:
BREEZE_API_KEY=your_icici_breeze_api_key_here
BREEZE_SECRET_KEY=your_icici_breeze_secret_key_here

# Replace with your actual values:
BREEZE_API_KEY=YOUR_ACTUAL_API_KEY
BREEZE_SECRET_KEY=YOUR_ACTUAL_SECRET_KEY
```

## Step 3: Test Your Setup

Run the test script to verify everything is configured correctly:

```bash
cd premiumtrader-backend
node test-breeze.js
```

## Step 4: Login Credentials for Frontend

When you login through the frontend, you'll need:

- **Username**: Your ICICI Direct login ID (same as web login)
- **Password**: Your ICICI Direct password (same as web login) 
- **API Secret**: Your 2PIN (NOT your trading PIN - this is specific to API)

## Important Notes

⚠️ **Security**:
- Never share your credentials
- Don't commit them to git
- Keep your 2PIN separate from trading PIN

⚠️ **API Activation**:  
- API access may take 1-2 business days to activate after subscription
- Contact ICICI Direct support if you face activation issues

⚠️ **Credentials Location**:
- API Key & Secret: Available in ICICI Direct portal under API settings
- 2PIN: Set up separately in API configuration (different from trading PIN)

## Need Help?

If you don't have ICICI Direct account or API access yet:
1. Open ICICI Direct trading account
2. Complete KYC process  
3. Subscribe to Breeze API service
4. Wait for API activation
5. Generate API credentials

For immediate testing, you can continue using Zerodha Kite which is already configured.