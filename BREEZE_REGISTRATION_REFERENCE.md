# 📋 ICICI Breeze App Registration - Quick Reference

## Copy-Paste Ready Values

When registering your app in ICICI Direct portal, use these exact values:

### 🔧 App Registration Form

**App Name:**
```
TradingSystemApp
```

**App Description:**
```
Multi-broker trading system for algorithmic and manual trading
```

**App Type:**
```
Desktop Application
```

**Redirect URL (Development):**
```
http://localhost:5173/auth/callback
```

**Primary IP Address (Development):**
```
127.0.0.1
```

**Secondary IP Address:**
```
(Leave blank or use: ::1)
```

---

## 🌐 Production Values (When Deploying)

**Redirect URL (Production):**
```
https://yourdomain.com/auth/callback
```

**Primary IP Address (Production):**
```
YOUR_SERVER_PUBLIC_IP
```

---

## 📱 Alternative Development URLs

If your frontend runs on a different port:

**Port 3000 (React default):**
```
http://localhost:3000/auth/callback
```

**Port 5174 (Vite alternative):**
```
http://localhost:5174/auth/callback
```

**Port 8080 (Common alternative):**
```
http://localhost:8080/auth/callback
```

---

## 🔐 Security Notes

- **IP Whitelisting**: Only registered IP addresses can access the API
- **Redirect URL**: Must match exactly what you register
- **HTTPS Required**: Production environments should use HTTPS
- **Localhost Only**: 127.0.0.1 only works for local development

---

## 🚀 After Registration

1. **Wait for Approval**: API access may take 1-2 business days
2. **Note Your Credentials**: Save API Key and Secret Key securely
3. **Set Your 2PIN**: Configure your API authentication PIN
4. **Test Connection**: Use provided test scripts to verify setup

---

## 🔄 If You Need to Change Details Later

Most brokers allow you to:
- Update redirect URLs
- Add additional IP addresses  
- Modify app description
- Regenerate API keys

Contact ICICI Direct API support if you need to make changes after registration.