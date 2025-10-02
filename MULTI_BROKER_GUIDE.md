# Multi-Broker Trading System

This system has been upgraded to support multiple brokers including Zerodha Kite and ICICI Breeze APIs. You can now easily switch between different brokers or even trade across multiple brokers simultaneously.

## Supported Brokers

### ✅ Zerodha Kite
- **Authentication**: Web-based OAuth flow with request token
- **Features**: Full trading, positions, orders, market data, real-time WebSocket
- **Status**: Fully implemented

### ✅ ICICI Breeze  
- **Authentication**: Username/Password with API secret (2PIN)
- **Features**: Trading, positions, orders, market data, historical data
- **Status**: Implemented (WebSocket pending)

### 🔄 Coming Soon
- Angel Broking
- Upstox
- 5Paisa
- Other popular brokers

## Architecture Overview

The system uses a broker abstraction layer that provides:
- **Unified API**: Same interface for all brokers
- **Data Normalization**: Consistent data formats across brokers
- **Easy Integration**: Add new brokers by extending `BaseBroker` class
- **Flexible Authentication**: Support for different auth flows
- **Multi-broker Operations**: Trade across multiple brokers simultaneously

## Setup Instructions

### 1. Backend Configuration

1. **Copy environment template**:
   ```bash
   cd premiumtrader-backend
   cp .env.template .env
   ```

2. **Configure broker credentials in `.env`**:
   ```env
   # Zerodha
   KITE_API_KEY=your_zerodha_api_key
   KITE_API_SECRET=your_zerodha_api_secret
   
   # ICICI Breeze  
   BREEZE_API_KEY=your_breeze_api_key
   BREEZE_SECRET_KEY=your_breeze_secret_key
   ```

3. **Install dependencies**:
   ```bash
   npm install axios  # For ICICI Breeze HTTP requests
   ```

4. **Start the server**:
   ```bash
   node server-new.js  # Use the new multi-broker server
   ```

### 2. Frontend Configuration

1. **Update imports in your components**:
   ```javascript
   import AuthService from '../services/AuthService-new';
   ```

2. **Add broker selection to your app**:
   ```jsx
   import BrokerSelector from './components/BrokerSelector';
   ```

## Usage Guide

### Switching Brokers

Users can switch brokers through the UI:
1. Select broker from the dropdown
2. System will clear existing tokens
3. Redirect to appropriate login flow

### Authentication Flows

#### Zerodha Kite
1. Click "Login with Kite"
2. Redirect to Zerodha authorization
3. Get request token from callback
4. Generate session automatically

#### ICICI Breeze
1. Enter ICICI Direct username
2. Enter password  
3. Enter API secret (2PIN)
4. Direct authentication

### API Endpoints

#### Broker Management
- `GET /api/brokers` - List available brokers
- `POST /api/brokers/set` - Switch active broker

#### Multi-Broker Operations
- `GET /api/multi-broker/positions` - Get positions from all authenticated brokers
- `GET /api/multi-broker/orders` - Get orders from all authenticated brokers

#### Standard Trading APIs
All existing endpoints work with the active broker:
- `POST /api/generate_session` - Authenticate (format varies by broker)
- `GET /api/profile` - User profile
- `GET /api/positions` - Current positions  
- `GET /api/orders` - Order history
- `POST /api/orders` - Place order
- `GET /api/quotes` - Market quotes

## Adding New Brokers

To add a new broker (e.g., Angel Broking):

### 1. Create Broker Implementation

```javascript
// brokers/AngelBroker.js
import BaseBroker from './BaseBroker.js';

export class AngelBroker extends BaseBroker {
  constructor(config) {
    super(config);
    // Initialize Angel-specific config
  }

  async generateSession(credentials) {
    // Implement Angel authentication
  }

  async getProfile() {
    // Implement profile fetching
  }

  // Implement other required methods...
  
  // Override normalization methods
  normalizeOrder(rawOrder) {
    // Convert Angel order format to standard format
  }
}
```

### 2. Register in BrokerManager

```javascript
// brokers/BrokerManager.js
initializeBrokers() {
  // Existing brokers...
  
  this.brokers.set('angel', new AngelBroker({
    apiKey: process.env.ANGEL_API_KEY,
    apiSecret: process.env.ANGEL_API_SECRET
  }));
}
```

### 3. Add Environment Variables

```env
ANGEL_API_KEY=your_angel_api_key
ANGEL_API_SECRET=your_angel_api_secret
```

### 4. Update UI (Optional)

The broker selector will automatically detect and display new brokers.

## Data Format Standardization

All broker responses are normalized to a common format:

### Order Format
```javascript
{
  order_id: "string",
  status: "COMPLETE|OPEN|CANCELLED|REJECTED",
  tradingsymbol: "string",  
  transaction_type: "BUY|SELL",
  quantity: number,
  price: number,
  broker: "zerodha|breeze|angel"
}
```

### Position Format
```javascript
{
  instrument_token: "string|number",
  tradingsymbol: "string",
  quantity: number,
  average_price: number,
  last_price: number,
  pnl: number,
  broker: "zerodha|breeze|angel"
}
```

## Error Handling

The system provides standardized error handling:

```javascript
{
  error: "Human readable message",
  error_type: "PermissionException|NetworkException|GeneralException", 
  status_code: 400|401|500,
  broker: "zerodha|breeze"
}
```

## WebSocket Support

Currently only Zerodha Kite has full WebSocket support. ICICI Breeze WebSocket implementation is pending their API documentation.

## Migration from Single-Broker

1. **Backup your current `.env` file**
2. **Replace server.js with server-new.js**
3. **Update frontend service imports**
4. **Add broker selection component**
5. **Test with existing Zerodha credentials**

Your existing Zerodha integration will continue working unchanged.

## Troubleshooting

### Broker Not Available
- Check environment variables are set
- Verify API keys are valid
- Check network connectivity

### Authentication Failures  
- **Zerodha**: Verify API key/secret, check request token
- **Breeze**: Verify username/password, check 2PIN is correct

### API Errors
- Check broker-specific error messages
- Verify rate limits
- Ensure market hours for live data

## Security Notes

- Store API secrets in environment variables only
- Never commit credentials to git
- Use HTTPS in production
- Implement proper session management
- Validate all user inputs

## Performance Considerations

- Broker switching clears all cached data
- Multiple broker calls may impact rate limits  
- WebSocket connections are per-broker
- Consider caching for frequently accessed data

## Support

For broker-specific issues:
- **Zerodha**: Check Kite Connect documentation
- **ICICI Breeze**: Check Breeze API documentation
- **General**: Check server logs and error messages