/**
 * "Cross Pullback" strategy engine - bar-driven, shared by backtest and (Phase 3) live.
 *
 * SHORT (LONG is the mirror image):
 *  1. Setup: at a bar close the fast line (e.g. HMA 50), sloping down, crosses
 *     below the slow line (e.g. HMA 130). Any cross replaces the previous setup.
 *  2. Stop: highest high of the previous stretch - every bar since the
 *     previous (opposite) cross, i.e. the whole time the fast line was above
 *     the slow one, whether or not the lines were rising.
 *  3. First touch: when price rises to the fast line, go short at that price.
 *     The line is its LIVE value - what the chart shows while the candle is
 *     still forming (the current price standing in for the close). HMA/SMA are
 *     linear in the current price, line(p) = a + b*p, so the exact meeting
 *     price p = a / (1 - b) is known from the OHLC bar. That price is the
 *     "touch point". If the fast line turns back up first, keep waiting; no
 *     touch = no trade.
 *  4. Target: touch point - targetR x (stop - touch point).
 *  5. Re-entry: while flat after a target / intraday exit, short again whenever
 *     price touches the same touch point - until the stop is breached or the
 *     next cross.
 *  6. Reversal: an open trade is closed when the opposite setup's entry fires.
 *  7. Intraday mode: flat at session.exitTime; no entries until session.start.
 *  8. Red-candle stop (exits.afterStop = 'red-candle'; default 'exit' = exit at
 *     the stop). When price breaches the stop the trade is NOT exited:
 *      - the setup ends (no more re-entries at the touch point);
 *      - the first red candle (close < open) from the breach candle on - at any
 *        hour - fixes an exit level at its high; if price later passes that
 *        high, exit exactly there (at the open if it gapped past, or at the
 *        session open if it passed during the night);
 *      - otherwise the trade runs to its 2R target; an opposite cross does not
 *        reverse it once the stop has been breached.
 *     Long is the mirror: first green candle, exit below its low.
 *
 * CHART HOURS vs TRADING HOURS. GIFT NIFTY trades ~06:30-02:45 IST, and the
 * strategy reads that whole chart: crosses, the stop, the first touch (the
 * touch point) and stop breaches all happen on every bar. Trades, however, are
 * only placed and exited during trading hours [session.start, session.end):
 *  - a first touch outside trading hours still fixes the touch point; the first
 *    trade is then taken in trading hours when price returns to that point;
 *  - a stop breach at any hour ends the setup (no more re-entries);
 *  - an open trade can only be exited in trading hours: at the first bar of the
 *    session it exits at the open if price is already past its stop or target.
 *
 * Intrabar order on historical candles is unknown, so the backtest is
 * deliberately conservative:
 *  - a stop that is reachable in the same bar as a target is taken first;
 *  - a bar that triggers an entry and also reaches the stop is a stop-out;
 *  - a target is never counted in the entry bar;
 *  - after an exit, the next entry waits for the following bar.
 * Entries fill only AT the touch point (a bar must trade that price; no fill at
 * the open on a gap). Exits past a stop/target on a gap fill at the open.
 */

import { computeTrendSeries, liveLineAt, liveMeetingPrice } from '../indicators.js';
import { normalizeCandle, parseCandleTime, formatCandleTimestamp } from '../session.js';

const IST_MS = 330 * 60000;
const DAY_MS = 86400000;
const istMinutes = (ms) => Math.floor((((ms + IST_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60000);
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const round2 = (v) => Math.round(v * 100) / 100;

export const CROSS_SETUP_NAMES = {
  'short-first': 'Short · first touch',
  'short-reentry': 'Short · re-entry',
  'long-first': 'Long · first touch',
  'long-reentry': 'Long · re-entry',
};

/** Highest high (short) / lowest low (long) of the previous stretch: bars from..to. */
function swingStop(side, bars, from, to) {
  const short = side === 'short';
  let best = null;
  for (let j = Math.max(from, 0); j <= to; j++) {
    const v = short ? bars[j].high : bars[j].low;
    best = best == null ? v : short ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

/**
 * @param {object} opts
 * @param {Array}  opts.candles  raw candles, any time order
 * @param {string} opts.from     YYYY-MM-DD (IST) - only trades entered from here are reported
 * @param {string} opts.to       YYYY-MM-DD (IST)
 * @param {object} opts.config   normalized hma-cross-pullback config
 * @param {object} [opts.series]  { fast, slow, liveFast? } precomputed lines (tests); computed from config otherwise.
 *                                liveFast(i) -> {a, b}; without it an injected series uses a flat line at fast[i-1].
 * @param {boolean} [opts.trackAll] tracking only: every setup lives until the next cross and records its
 *                                first touch with its stop, even if price passed the stop first (no filtering).
 * @returns {{trades:Array, setups:Array, series:{fast:Array, slow:Array}, bars:Array}}
 */
export function runCrossPullback({ candles, from, to, config, series = null, trackAll = false }) {
  const bars = candles
    .map(normalizeCandle)
    .filter((c) => Number.isFinite(c.close))
    .map((c) => ({ ...c, ts: parseCandleTime(c.time).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  const { fastType = 'hma', fastPeriod, slowType = 'hma', slowPeriod } = config.trend;
  const fast = series?.fast ?? computeTrendSeries(bars, fastType, fastPeriod);
  const slow = series?.slow ?? computeTrendSeries(bars, slowType, slowPeriod);
  const closes = bars.map((b) => b.close);
  const liveFast = series?.liveFast
    ?? (series
      ? (i) => (Number.isFinite(fast[i - 1]) ? { a: fast[i - 1], b: 0 } : null)
      : (i) => liveLineAt(closes, fastType, fastPeriod, i));
  const R = config.exits.targetR;
  const intraday = config.holding === 'intraday';
  const startMin = toMinutes(config.session.start);
  const exitMin = toMinutes(config.session.exitTime);
  const fromMs = Date.parse(`${from}T00:00:00+05:30`);
  const toMs = Date.parse(`${to}T23:59:59.999+05:30`);

  let setup = null; // { id, side, phase: 'first'|'armed', stop, touch, touchTs, touchMarket, target, dead, crossTs }
  let pos = null;   // { side, kind, entry, entryTs, entryIndex, stop, target, touch, setupId }
  let lastCross = -1;
  let seq = 0;
  const trades = [];
  const setups = [];

  const close = (price, i, reason) => {
    const b = bars[i];
    const points = pos.side === 'short' ? pos.entry - price : price - pos.entry;
    trades.push({
      setupKey: `${pos.side}-${pos.kind}`,
      setupName: CROSS_SETUP_NAMES[`${pos.side}-${pos.kind}`],
      side: pos.side,
      setupId: pos.setupId,
      entryTs: pos.entryTs,
      exitTs: b.ts,
      entryTime: formatCandleTimestamp(pos.entryTs),
      exitTime: formatCandleTimestamp(b.ts),
      entryPrice: round2(pos.entry),
      exitPrice: round2(price),
      touchPoint: round2(pos.touch),
      touchTs: pos.touchTs,
      touchMarket: round2(pos.touchMarket),
      stop: round2(pos.stop),
      target: round2(pos.target),
      exitReason: reason,
      ...(pos.breachTs != null ? { breachTs: pos.breachTs, redCandleLevel: pos.confirm != null ? round2(pos.confirm) : null } : {}),
      points: round2(points),
      result: points > 0 ? 'win' : points < 0 ? 'loss' : 'flat',
      legs: [],
    });
    pos = null;
  };

  const endMin = toMinutes(config.session.end || '15:30');
  const touched = (side, b, price) => (side === 'short' ? b.high >= price : b.low <= price);
  // Entries fill only AT the touch point: the bar must actually trade that price.
  // A bar that gaps past it and never comes back does not fill (no fill at the open).
  const tradesAt = (b, price) => b.low <= price && b.high >= price;
  const beyond = (side, price, stop) => (side === 'short' ? price >= stop : price <= stop);
  const redCandleStop = config.exits.afterStop === 'red-candle';
  // Red-candle mode: after a stop breach, look for the first candle against the trade.
  const track = (i) => {
    if (!pos || !redCandleStop) return;
    const b = bars[i];
    const short = pos.side === 'short';
    if (!pos.breached && touched(pos.side, b, pos.stop)) {
      pos.breached = true;
      pos.breachTs = b.ts;
      if (setup && setup.id === pos.setupId) setup.dead = true; // no more re-entries
    }
    if (pos.breached && pos.confirm == null && (short ? b.close < b.open : b.close > b.open)) {
      pos.confirm = short ? b.high : b.low;
      pos.confirmIdx = i;
    }
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const mins = istMinutes(b.ts);
    const tradingHours = mins >= startMin && mins < endMin;
    const entryWindow = tradingHours && (!intraday || mins < exitMin);
    let exitedThisBar = false;

    // 1. Manage the open trade - only possible during trading hours.
    if (pos && redCandleStop) {
      const short = pos.side === 'short';
      const confirmHit = pos.confirm != null && i > pos.confirmIdx && touched(pos.side, b, pos.confirm);
      if (tradingHours) {
        if (intraday && mins >= exitMin) {
          close(b.open, i, 'intraday exit');
        } else if (pos.confirmTriggered) {
          close(b.open, i, 'red candle'); // passed the level outside trading hours
        } else if (confirmHit) {
          close(beyond(pos.side, b.open, pos.confirm) ? b.open : pos.confirm, i, 'red candle');
        } else if (i > pos.entryIndex && (pos.breached || !touched(pos.side, b, pos.stop)) && (short ? b.low <= pos.target : b.high >= pos.target)) {
          // (a bar that both breaches the stop and reaches the target is not counted as a target)
          const gap = short ? b.open <= pos.target : b.open >= pos.target;
          close(gap ? b.open : pos.target, i, 'target');
        }
        if (!pos) exitedThisBar = true;
      } else if (intraday) {
        close(b.open, i, 'intraday exit');
        exitedThisBar = true;
      } else if (confirmHit) {
        pos.confirmTriggered = true;
      }
      track(i);
    } else if (pos && tradingHours) {
      const short = pos.side === 'short';
      if (intraday && mins >= exitMin) {
        close(b.open, i, 'intraday exit');
        exitedThisBar = true;
      } else if (touched(pos.side, b, pos.stop)) {
        const sid = pos.setupId;
        close(beyond(pos.side, b.open, pos.stop) ? b.open : pos.stop, i, 'stop');
        if (setup && setup.id === sid) setup.dead = true;
        exitedThisBar = true;
      } else if (i > pos.entryIndex && (short ? b.low <= pos.target : b.high >= pos.target)) {
        const gap = short ? b.open <= pos.target : b.open >= pos.target;
        close(gap ? b.open : pos.target, i, 'target');
        exitedThisBar = true;
      }
    } else if (pos && intraday) {
      // Intraday trades never stay open outside trading hours (safety net; normally closed at exitMin).
      close(b.open, i, 'intraday exit');
      exitedThisBar = true;
    }

    // 2. The live setup, on the full chart.
    if (setup && !setup.dead) {
      const { side } = setup;
      // A breached trade in red-candle mode is not reversed by the opposite setup.
      const canTrade = entryWindow && !exitedThisBar && (!pos || (pos.side !== side && !(redCandleStop && pos.breached)));
      const enter = (fill, kind) => {
        if (pos) close(fill, i, 'reversal');
        pos = { side, kind, entry: fill, entryTs: b.ts, entryIndex: i, stop: setup.stop, target: setup.target, touch: setup.touch, touchTs: setup.touchTs, touchMarket: setup.touchMarket, setupId: setup.id };
        // Conservative: if this bar also reached the stop, assume it came after the entry.
        if (redCandleStop) track(i);
        else if (touched(side, b, setup.stop)) {
          close(setup.stop, i, 'stop');
          setup.dead = true;
        }
      };

      // The first touch only counts while the fast line slopes the setup's way,
      // judged on completed candles: down for a short (its value at the last
      // close below the close before), up for a long.
      const sloping = i >= 2 && Number.isFinite(fast[i - 1]) && Number.isFinite(fast[i - 2])
        && (side === 'short' ? fast[i - 1] < fast[i - 2] : fast[i - 1] > fast[i - 2]);
      if (setup.phase === 'first') {
        // First touch of the LIVE fast line - at any hour - while it slopes the right way.
        const live = sloping ? liveFast(i) : null;
        const meet = live && liveMeetingPrice(live);
        // Opened already at/past the line (a gap): the touch is at the open, and the
        // touch point is the line's live value at that moment. Otherwise price met
        // the line at `meet` if the bar reached it.
        const gapped = live && (side === 'short' ? b.open >= meet : b.open <= meet);
        if (live && (gapped || touched(side, b, meet))) {
          const line = gapped ? live.a + live.b * b.open : meet;
          if (!trackAll && beyond(side, line, setup.stop)) {
            setup.dead = true; // line already beyond the stop: the setup is broken
          } else {
            setup.touch = line;
            setup.touchTs = b.ts;
            setup.touchMarket = gapped ? b.open : meet; // the price at the moment of the touch
            setup.target = side === 'short' ? line - R * (setup.stop - line) : line + R * (line - setup.stop);
            setup.phase = 'armed';
            if (canTrade && tradesAt(b, line)) enter(line, 'first');
            else setup.firstPending = true; // touched outside trading hours, or gapped past: trade it AT the touch point later
          }
        }
      } else if (canTrade && (setup.firstPending || config.reentry) && tradesAt(b, setup.touch)) {
        const kind = setup.firstPending ? 'first' : 'reentry';
        setup.firstPending = false;
        enter(setup.touch, kind);
      }

      // A stop breach on the chart - at any hour - ends the setup.
      if (!trackAll && setup && !setup.dead && touched(side, b, setup.stop)) setup.dead = true;
    }

    // 3. Bar close: detect a cross and start a new setup.
    if (i >= 1 && [fast[i], fast[i - 1], slow[i], slow[i - 1]].every(Number.isFinite)) {
      const bear = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      const bull = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
      if (bear || bull) {
        // Every cross starts a setup; the slope rule applies at the first touch.
        const side = bear ? 'short' : 'long';
        const sloped = bear ? fast[i] < fast[i - 1] : fast[i] > fast[i - 1];
        const windowStart = Math.max(lastCross, 0); // whole stretch from the previous cross candle (or the start of data)
        setup = { id: ++seq, side, phase: 'first', stop: swingStop(side, bars, windowStart, i), touch: null, touchTs: null, touchMarket: null, target: null, dead: false, firstPending: false, crossTs: b.ts, slopedAtCross: sloped };
        setups.push(setup);
        lastCross = i;
      }
    }
  }

  // Settle anything still open at the last bar.
  if (pos && bars.length) close(bars[bars.length - 1].close, bars.length - 1, 'end of test');

  return {
    trades: trades.filter((t) => t.entryTs >= fromMs && t.entryTs <= toMs),
    setups: setups.filter((s) => s.crossTs >= fromMs && s.crossTs <= toMs).map((s) => ({ ...s, stop: round2(s.stop) })),
    series: { fast, slow },
    bars,
  };
}
