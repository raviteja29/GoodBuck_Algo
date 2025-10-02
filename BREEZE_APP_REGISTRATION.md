# 🎯 ICICI Breeze App Registration - Complete Guide

## 📋 Registration Details for ICICI Direct Portal

When you register your app in the ICICI Direct Breeze API portal, use these **exact values**:

### 📝 Required Information

| Field | Value to Enter | Explanation |
|-------|----------------|-------------|
| **App Name** | `TradingSystemApp` | Your app's display name |
| **App Description** | `Multi-broker trading system for personal use` | Brief description |
| **App Type** | `Desktop Application` | Since you're running locally |
| **Redirect URL** | `http://localhost:5173/auth/callback` | Where users return after auth |
| **Primary IP Address** | `127.0.0.1` | Your development machine IP |
| **Secondary IP** | *(leave blank)* | Optional field |

### 🔗 URL Breakdown

**Redirect URL: `http://localhost:5173/auth/callback`**
- `http://` - Protocol (HTTPS not needed for localhost)
- `localhost` - Your local machine
- `5173` - Your Vite dev server port (confirmed from your config)
- `/auth/callback` - Path where auth response is handled

### 🌐 IP Address Details

**Primary IP: `127.0.0.1`**
- This is the standard localhost IP address
- Required for development environment
- Allows API calls from your local machine

### 🔄 Alternative Values (If Needed)

If the standard values don't work, try these alternatives:

**Alternative Redirect URLs:**
```
http://127.0.0.1:5173/auth/callback
http://localhost:5173/
http://localhost:5173
```

**Alternative IP Addresses:**
```
Your actual machine IP (run `ipconfig` in cmd to find)
Public IP (if developing on cloud/remote server)
```

## 🚀 Step-by-Step Registration Process

### 1. Access ICICI Direct Portal
1. Go to: https://www.icicidirect.com/
2. Login with your trading credentials
3. Navigate to: **Tools & Services** → **API** → **Breeze API**

### 2. Register Your Application
1. Click **"Register New App"** or **"Create App"**
2. Fill in the form with values from the table above
3. Submit the application
4. Wait for approval (1-2 business days)

### 3. Get Your Credentials
After approval, you'll receive:
- **API Key** (e.g., `ICICI123456789`)
- **Secret Key** (e.g., `abcd1234efgh5678`)
- **App ID** (if applicable)

### 4. Set Up 2PIN
- Create your **2PIN** (API authentication PIN)
- This is different from your trading PIN
- Used during login authentication

## 🔧 Update Your .env File

Once you have credentials, update your `.env` file:

```env
# Replace these placeholder values:
BREEZE_API_KEY=your_icici_breeze_api_key_here
BREEZE_SECRET_KEY=your_icici_breeze_secret_key_here

# With your actual values:
BREEZE_API_KEY=ICICI123456789
BREEZE_SECRET_KEY=abcd1234efgh5678ijkl
```

## 🧪 Test Your Setup

After registration and configuration:

```bash
cd premiumtrader-backend
node simple-test.js      # Quick config test
node status-check.js     # Full system check
node server-new.js       # Start multi-broker server
```

## ⚠️ Important Notes

### Security
- **Never share** your API credentials
- **Don't commit** credentials to git
- **Keep 2PIN secure** (different from trading PIN)

### Network
- **IP Whitelisting**: Only registered IPs can access API
- **Redirect URL**: Must match exactly what you register
- **HTTPS**: Required for production (not localhost)

### Development vs Production
- **Development**: Use `127.0.0.1` and `http://localhost:5173`
- **Production**: Use server public IP and HTTPS domain

## 🆘 Troubleshooting

### If Registration Fails
- Try alternative redirect URLs listed above
- Contact ICICI Direct API support
- Ensure trading account is active and KYC complete

### If API Calls Fail
- Verify IP address is registered correctly
- Check redirect URL matches exactly
- Ensure API subscription is active and paid

### If Authentication Fails
- Verify username/password are correct
- Check 2PIN is set up properly in API settings
- Ensure API key/secret are entered correctly

## 📞 Support Contacts

**ICICI Direct API Support:**
- Phone: 1800-111-555
- Email: api.support@icicidirect.com
- Portal: ICICI Direct Help Center

## ✅ Checklist

- [ ] ICICI Direct trading account active
- [ ] KYC completed
- [ ] API subscription purchased
- [ ] App registered with correct details
- [ ] API credentials received
- [ ] 2PIN set up
- [ ] Credentials added to .env file
- [ ] Test scripts pass
- [ ] Multi-broker server starts successfully

Your ICICI Breeze integration will be ready once you complete these steps! 🎉