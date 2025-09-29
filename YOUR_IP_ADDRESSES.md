# 🌐 Your IP Addresses for ICICI Breeze App Registration

## 📋 Your Network Configuration

Based on your current network setup, here are the IP addresses you can use:

### 🏠 **Local Development (Recommended)**
```
Primary IP Address: 127.0.0.1
```
- **Use this for**: Development and testing on your local machine
- **Best for**: Initial setup and learning
- **Access**: Only from your computer

### 🖥️ **Local Network Access**
```
Primary IP Address: 192.168.68.52
```
- **Use this for**: Access from other devices on your Wi-Fi network
- **Best for**: Testing from mobile/tablet on same network
- **Access**: From any device on your Wi-Fi (192.168.68.x)

### 🌍 **Public Internet Access**
```
Primary IP Address: 49.43.218.139
```
- **Use this for**: Production deployment or remote access
- **Best for**: When your app needs to work from anywhere
- **Access**: From anywhere on the internet
- **⚠️ Note**: This IP may change if your ISP assigns dynamic IPs

## 🎯 **Recommended for ICICI Breeze Registration**

### **For Development/Testing:**
```
Primary IP Address: 127.0.0.1
Redirect URL: http://localhost:5173/auth/callback
```

### **For Production Use:**
```
Primary IP Address: 49.43.218.139
Redirect URL: http://localhost:5173/auth/callback (for now)
```

## 📝 **Complete Registration Form**

Here's what to enter in the ICICI Breeze app registration:

| Field | Value |
|-------|-------|
| **App Name** | `TradingSystemApp` |
| **App Description** | `Multi-broker trading system for personal use` |
| **App Type** | `Desktop Application` |
| **Redirect URL** | `http://localhost:5173/auth/callback` |
| **Primary IP Address** | `127.0.0.1` (for development) |
| **Secondary IP Address** | `192.168.68.52` (optional - your local network IP) |

## 🔄 **Multiple IP Registration**

Some brokers allow multiple IPs. If ICICI Breeze supports this, you can register:

1. **Primary**: `127.0.0.1` (localhost)
2. **Secondary**: `192.168.68.52` (your local network)
3. **Tertiary**: `49.43.218.139` (your public IP)

## ⚠️ **Important Notes**

### **IP Address Stability**
- **127.0.0.1**: Always stable (localhost)
- **192.168.68.52**: Stable on your current Wi-Fi
- **49.43.218.139**: May change if you restart router or ISP reassigns

### **Security Considerations**
- **127.0.0.1**: Most secure (only your machine)
- **192.168.68.52**: Secure within your network
- **49.43.218.139**: Exposed to internet (use with caution)

### **Development vs Production**
- **Start with**: `127.0.0.1` for development
- **Later upgrade to**: Your public IP for production
- **You can change**: IP addresses later through ICICI portal

## 🧪 **Test Your Setup**

After registration, you can test API access from different IPs:

### **Test from localhost (127.0.0.1):**
```bash
# This should work if you registered 127.0.0.1
cd premiumtrader-backend
node test-breeze.js
```

### **Test from your network IP (192.168.68.52):**
```bash
# Access your app from another device on same Wi-Fi using:
http://192.168.68.52:5173
```

## 🔧 **Quick Copy-Paste**

**For immediate registration, use this:**
```
Primary IP Address: 127.0.0.1
```

**If you need network access, add this as secondary:**
```
Secondary IP Address: 192.168.68.52
```

## 📞 **If You Have Issues**

1. **IP Not Working?** Try the alternative IPs listed above
2. **Can't Access API?** Verify the registered IP matches your actual IP
3. **IP Changed?** Contact ICICI support to update registered IPs
4. **Multiple IPs Needed?** Ask ICICI if they support multiple IP registration

Your most reliable choice for development is **127.0.0.1** - use this for your initial registration! 🎯