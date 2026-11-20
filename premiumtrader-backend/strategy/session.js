/**
 * Candle-time, trading-session and weekly-window helpers.
 *
 * Behaviour-preserving extraction from src/components/GiftNiftyBacktest.jsx:
 * each declaration is byte-identical to the original apart from the `export`
 * keyword, so the server bins candles into exactly the same days, sessions
 * and expiry windows the original backtest did.
 */

export const pad = (value) => String(value).padStart(2, '0');

export const toInputDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const CANDLE_TIME_ZONE = 'Asia/Kolkata';

export const candleDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CANDLE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export const toCandleDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(candleDateFormatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const dateTime = (date, time) => `${toInputDate(date)} ${time}`;

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const parseCandleTime = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 1e12 ? value : value * 1000);
  }
  if (value == null || value === '') return new Date(NaN);
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return new Date(numeric > 1e12 ? numeric : numeric * 1000);
  }
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  return new Date(normalized);
};

export const getCandleDateKey = (value) => {
  if (value instanceof Date) return toCandleDateKey(value);
  if (typeof value === 'number' && Number.isFinite(value)) return toCandleDateKey(parseCandleTime(value));
  if (value == null) return '';
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) return toCandleDateKey(parseCandleTime(raw));
  const match = raw.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = parseCandleTime(value);
  return toCandleDateKey(parsed);
};

export const normalizeCandle = (candle) => {
  if (Array.isArray(candle)) {
    const time = candle[0];
    return {
      time,
      dateKey: getCandleDateKey(time),
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5] || 0)
    };
  }

  const time = candle?.date || candle?.time || candle?.timestamp;
  return {
    time,
    dateKey: getCandleDateKey(time),
    open: Number(candle?.open),
    high: Number(candle?.high),
    low: Number(candle?.low),
    close: Number(candle?.close),
    volume: Number(candle?.volume || 0)
  };
};

export const buildWeeklyWindows = (fromDate, toDate) => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const firstWednesday = new Date(from);
  while (firstWednesday.getDay() !== 3) firstWednesday.setDate(firstWednesday.getDate() + 1);

  const windows = [];
  for (let baseStart = firstWednesday; baseStart <= to; baseStart = addDays(baseStart, 7)) {
    const baseEnd = addDays(baseStart, 6);
    const expiryStart = addDays(baseStart, 7);
    const expiryDate = addDays(baseStart, 13);
    if (expiryDate > to) break;
    windows.push({
      baseStart: new Date(baseStart),
      baseEnd,
      expiryStart,
      expiryDate
    });
  }
  return windows;
};

export const formatCandleTimestamp = (value) => {
  const parsed = parseCandleTime(value);
  if (Number.isNaN(parsed.getTime())) return '--';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: CANDLE_TIME_ZONE,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(parsed);
};

export const getCandleSessionMinutes = (value) => {
  const parsed = parseCandleTime(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: CANDLE_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(parsed).map(part => [part.type, part.value]));
  return (Number(parts.hour) * 60) + Number(parts.minute);
};

export const isTradingSessionCandle = (candle) => {
  const minutes = getCandleSessionMinutes(candle.time);
  return minutes != null && minutes >= 555 && minutes <= 930;
};

export const getExitDeadline = (expiryDate) => new Date(`${toInputDate(expiryDate)}T15:15:00+05:30`);
