# Fyers NIFTY Analyzer (Python)

This standalone tool authenticates with Fyers (v3) and analyzes NIFTY options based on NIFTY's high/low across a date range. It works for both expired and active options and exports CSVs.

Files:
- fyers_nifty_analyzer.py — main script
- requirements.txt — Python dependencies

Environment variables (use a .env file or set in shell):
- FYERS_CLIENT_ID (e.g. YOUR_APPID-100)
- FYERS_SECRET_KEY
- FYERS_REDIRECT_URI (default: http://127.0.0.1:3002/api/auth/callback)

Quickstart (Windows PowerShell):
1. Ensure Python 3.10+ in PATH
2. Create and activate a virtual env (recommended)
   - python -m venv .venv
   - .\.venv\Scripts\Activate.ps1
3. Install dependencies
   - pip install -r .\scripts\requirements.txt
4. Set env vars (either create .env at project root or set in shell)
   - .env example (see scripts/.env.example)
5. Run
   - python .\scripts\fyers_nifty_analyzer.py

Flow:
- Local Flask server listens on port 3002 for Fyers redirect
- Browser opens Fyers consent; on success, access token saved to fyers_token.txt
- Enter 3 dates: From, To (for NIFTY range), and Option Expiry (YYYY-MM-DD)
- Script computes rounded strikes (High→PE rounded up, Low→CE rounded down), builds symbols, fetches 15m history for entire series up to expiry, and exports CSVs.

Troubleshooting:
- If imports fail (python-dotenv/fyers_apiv3), ensure the venv is active and step 3 is re-run
- If browser doesn't open, copy the printed auth URL into your browser
- If port 3002 is busy, change FYERS_REDIRECT_URI and the app.run port in the script accordingly
