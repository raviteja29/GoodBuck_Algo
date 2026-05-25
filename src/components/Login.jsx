import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  KeyRound,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Terminal
} from 'lucide-react';
import AuthService from '../services/AuthService';
import './Login.css';

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const matrixCanvasRef = useRef(null);
  const chartCanvasRef = useRef(null);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const loginUrl = AuthService.getLoginUrl();
      window.location.href = loginUrl;
    } catch (e) {
      console.error('Login error:', e);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const canvas = matrixCanvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    const fontSize = 14;
    const chars = '01NIFTYBANKALGOHFTQUANT';
    let drops = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drops = Array(Math.ceil(canvas.width / fontSize)).fill(1);
    };

    const draw = () => {
      ctx.fillStyle = 'rgba(6, 14, 24, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#44f0af';
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;

      drops.forEach((drop, index) => {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        ctx.fillText(text, index * fontSize, drop * fontSize);

        if (drop * fontSize > canvas.height && Math.random() > 0.975) {
          drops[index] = 0;
        } else {
          drops[index] = drop + 1;
        }
      });
    };

    resize();
    window.addEventListener('resize', resize);
    const intervalId = window.setInterval(draw, 55);

    return () => {
      window.removeEventListener('resize', resize);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    let points = Array.from({ length: 30 }, () => 44 + Math.random() * 22);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    };

    const drawChart = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(68, 240, 175, 0.22)';
      ctx.lineWidth = 1;
      for (let y = 16; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.strokeStyle = '#44f0af';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const step = width / (points.length - 1);
      ctx.moveTo(0, height - points[0]);

      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(index * step, height - points[index]);
      }

      ctx.stroke();
      points.shift();
      const last = points[points.length - 1];
      points.push(Math.max(12, Math.min(height - 10, last + (Math.random() - 0.48) * 10)));
    };

    resize();
    window.addEventListener('resize', resize);
    const intervalId = window.setInterval(drawChart, 220);

    return () => {
      window.removeEventListener('resize', resize);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="terminal-login">
      <canvas ref={matrixCanvasRef} className="terminal-login__matrix" aria-hidden="true" />
      <div className="terminal-login__scanline" aria-hidden="true" />

      <div className="terminal-login__ticker" aria-hidden="true">
        <div className="terminal-login__ticker-track">
          <span className="ticker-up">NIFTY +0.42% [22564.80]</span>
          <span className="ticker-down">BANKNIFTY -0.18% [48210.35]</span>
          <span>FINNIFTY +0.09% [21420.10]</span>
          <span className="ticker-up">ALGO_ALPHA [LIVE_RUNNING]</span>
          <span className="ticker-up">NIFTY +0.42% [22564.80]</span>
          <span className="ticker-down">BANKNIFTY -0.18% [48210.35]</span>
          <span>FINNIFTY +0.09% [21420.10]</span>
          <span className="ticker-up">ALGO_ALPHA [LIVE_RUNNING]</span>
        </div>
      </div>

      <main className="terminal-login__shell" aria-labelledby="terminal-login-title">
        <section className="terminal-login__card">
          <header className="terminal-login__header">
            <p className="terminal-login__eyebrow">GOODBUCK SECURE ACCESS</p>
            <h1 id="terminal-login-title">ALGO_TERMINAL_V1</h1>
            <p>INSTITUTIONAL QUANTITATIVE GATEWAY</p>
          </header>

          <div className="terminal-login__form" role="group" aria-label="Secure access panel">
            <label className="terminal-login__field">
              <span>TERMINAL ID</span>
              <span className="terminal-login__input">
                <Terminal size={18} aria-hidden="true" />
                <input value="TID_KITE_CONNECT" readOnly />
              </span>
            </label>

            <label className="terminal-login__field">
              <span>SECURE TOKEN</span>
              <span className="terminal-login__input">
                <KeyRound size={18} aria-hidden="true" />
                <input value="OAUTH_TOKEN_EXTERNAL" readOnly type="password" />
              </span>
            </label>

            <div className="terminal-login__security">
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                API_ENCRYPTED
              </span>
              <span>
                <LockKeyhole size={15} aria-hidden="true" />
                2FA_REQUIRED
              </span>
            </div>

            <button
              className="terminal-login__submit"
              onClick={handleLogin}
              disabled={isLoading}
              type="button"
            >
              {isLoading ? (
                <>
                  <span className="terminal-login__spinner" aria-hidden="true" />
                  HANDSHAKE_PENDING
                </>
              ) : (
                <>
                  INITIATE_SESSION
                  <LogIn size={17} aria-hidden="true" />
                </>
              )}
            </button>
          </div>

          <footer className="terminal-login__footer">
            <div className="terminal-login__links">
              <button type="button">NETWORK_STATUS</button>
              <span aria-hidden="true">|</span>
              <button type="button">RESET_KEYS</button>
            </div>

            <div className="terminal-login__system">
              <span>LNTY: 12ms</span>
              <span className="terminal-login__core">
                <Activity size={12} aria-hidden="true" />
                CORE_STABLE
              </span>
              <span>V.2.4.0_ST</span>
            </div>
          </footer>
        </section>

        <div className="terminal-login__authorized" aria-hidden="true">
          <span />
          <p>AUTHORIZED PERSONNEL ONLY</p>
          <span />
        </div>
      </main>

      <aside className="terminal-login__mini-chart" aria-label="System performance">
        <div>
          <span>SYSTEM_PERFORMANCE</span>
          <strong>0.00% DRIFT</strong>
        </div>
        <canvas ref={chartCanvasRef} />
      </aside>
    </div>
  );
};

export default Login;
