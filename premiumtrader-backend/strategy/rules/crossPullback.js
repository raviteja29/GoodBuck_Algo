/**
 * "Cross Pullback" strategy engine - bar-driven, shared by backtest and (Phase 3) live.
 *
 * SHORT (LONG is the mirror image):
 *  1. Setup: at a bar close the fast line (e.g. HMA 50), sloping down, crosses
 *     below the slow line (e.g. HMA 130). Any cross replaces the previous setup.
 *  2. Stop: highest high while BOTH lines were rising since the previous cross;
 *     if there was no such bar, the highest high since the previous cross.
 *  3. First touch: when price rises to the fast line (its value at the last
 *     COMPLETED bar - fixed for the current bar, so live alerts and backtests
 *     agree), go short at that price. That price is the "touch point".
 *     If the fast line turns back up first, keep waiting; no touch = no trade.
 *  4. Target: touch point - targetR x (stop - touch point).
 *  5. Re-entry: while flat after a target / intraday exit, short again whenever
 *     price touches the same touch point - until the stop is breached or the
 *     next cross.
 *  6. Reversal: an open trade is closed when the opposite setup's entry fires.
 *  7. Intraday mode: flat at session.exitTime; no entries until session.start.
 *
 * Intrabar order on historical candles is unknown, so the backtest is
 * deliberately conservative:
 *  - a stop that is reachable in the same bar as a target is taken first;
 *  - a bar that triggers an entry and also reaches the stop is a stop-out;
 *  - a target is never counted in the entry bar;
 *  - after an exit, the next entry waits for the following bar.
 * Gaps fill at the bar's open.
 */

import { computeTrendSeries } from '../indicators.js';
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

/** Highest high (short) / lowest low (long) for the stop, per the rules above. */
function swingStop(side, bars, fast, slow, from, to) {
  const short = side === 'short';
  let trend = null;
  let any = null;
  for (let j = Math.max(from, 1); j <= to; j++) {
    const v = short ? bars[j].high : bars[j].low;
    any = any == null ? v : short ? Math.max(any, v) : Math.min(any, v);
    const ok = [fast[j], fast[j - 1], slow[j], slow[j - 1]].every(Number.isFinite);
    const both = ok && (short
      ? fast[j] > fast[j - 1] && slow[j] > slow[j - 1]
      : fast[j] < fast[j - 1] && slow[j] < slow[j - 1]);
    if (both) trend = trend == null ? v : short ? Math.max(trend, v) : Math.min(trend, v);
  }
  return trend ?? any;
}

/**
 * @param {object} opts
 * @param {Array}  opts.candles  raw candles, any time order
 * @param {string} opts.from     YYYY-MM-DD (IST) - only trades entered from here are reported
 * @param {string} opts.to       YYYY-MM-DD (IST)
 * @param {object} opts.config   normalized hma-cross-pullback config
 * @param {object} [opts.series]  { fast, slow } precomputed lines (tests); computed from config otherwise
 * @returns {{trades:Array, setups:Array, series:{fast:Array, slow:Array}, bars:Array}}
 */
export function runCrossPullback({ candles, from, to, config, series = null }) {
  const bars = candles
    .map(normalizeCandle)
    .filter((c) => Number.isFinite(c.close))
    .map((c) => ({ ...c, ts: parseCandleTime(c.time).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  const { fastType = 'hma', fastPeriod, slowType = 'hma', slowPeriod } = config.trend;
  const fast = series?.fast ?? computeTrendSeries(bars, fastType, fastPeriod);
  const slow = series?.slow ?? computeTrendSeries(bars, slowType, slowPeriod);
  const R = config.exits.targetR;
  const intraday = config.holding === 'intraday';
  const startMin = toMinutes(config.session.start);
  const exitMin = toMinutes(config.session.exitTime);
  const fromMs = Date.parse(`${from}T00:00:00+05:30`);
  const toMs = Date.parse(`${to}T23:59:59.999+05:30`);

  let setup = null; // { id, side, phase: 'first'|'armed', stop, touch, target, dead, crossTs }
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
      stop: round2(pos.stop),
      target: round2(pos.target),
      exitReason: reason,
      points: round2(points),
      result: points > 0 ? 'win' : points < 0 ? 'loss' : 'flat',
      legs: [],
    });
    pos = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const mins = istMinutes(b.ts);
    const entryWindow = !intraday || (mins >= startMin && mins < exitMin);
    let exitedThisBar = false;

    // 1. Manage the open trade (levels fixed since the last close).
    if (pos) {
      const short = pos.side === 'short';
      if (intraday && !entryWindow) {
        close(b.open, i, 'intraday exit');
        exitedThisBar = true;
      } else if (short ? b.high >= pos.stop : b.low <= pos.stop) {
        const gap = short ? b.open >= pos.stop : b.open <= pos.stop;
        const sid = pos.setupId;
        close(gap ? b.open : pos.stop, i, 'stop');
        if (setup && setup.id === sid) setup.dead = true;
        exitedThisBar = true;
      } else if (i > pos.entryIndex && (short ? b.low <= pos.target : b.high >= pos.target)) {
        const gap = short ? b.open <= pos.target : b.open >= pos.target;
        close(gap ? b.open : pos.target, i, 'target');
        exitedThisBar = true;
      }
    }

    // 2. Entries for the live setup: first touch of the fast line, then re-entries at the touch point.
    if (setup && !setup.dead && entryWindow && !exitedThisBar && (!pos || pos.side !== setup.side)) {
      const short = setup.side === 'short';
      const first = setup.phase === 'first';
      const trigger = first ? fast[i - 1] : setup.touch;
      if ((first || config.reentry) && Number.isFinite(trigger) && (short ? b.high >= trigger : b.low <= trigger)) {
        const fill = short ? Math.max(b.open, trigger) : Math.min(b.open, trigger);
        if (short ? fill >= setup.stop : fill <= setup.stop) {
          setup.dead = true; // price is already through the stop: the setup is broken
        } else {
          if (pos) close(fill, i, 'reversal');
          if (first) {
            setup.touch = fill;
            setup.target = short ? fill - R * (setup.stop - fill) : fill + R * (fill - setup.stop);
            setup.phase = 'armed';
          }
          pos = {
            side: setup.side, kind: first ? 'first' : 'reentry', entry: fill, entryTs: b.ts, entryIndex: i,
            stop: setup.stop, target: setup.target, touch: setup.touch, setupId: setup.id,
          };
          // Conservative: if this bar also reached the stop, assume it came after the entry.
          if (short ? b.high >= setup.stop : b.low <= setup.stop) {
            close(setup.stop, i, 'stop');
            setup.dead = true;
          }
        }
      }
    }

    // 3. Bar close: detect a cross and start a new setup.
    if (i >= 1 && [fast[i], fast[i - 1], slow[i], slow[i - 1]].every(Number.isFinite)) {
      const bear = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      const bull = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
      if (bear || bull) {
        const side = bear ? 'short' : 'long';
        const sloped = bear ? fast[i] < fast[i - 1] : fast[i] > fast[i - 1];
        const windowStart = lastCross >= 0 ? lastCross + 1 : 1;
        setup = sloped
          ? { id: ++seq, side, phase: 'first', stop: swingStop(side, bars, fast, slow, windowStart, i), touch: null, target: null, dead: false, crossTs: b.ts }
          : null;
        if (setup) setups.push(setup);
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
