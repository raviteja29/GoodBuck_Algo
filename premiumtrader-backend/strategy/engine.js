/**
 * The shared seam.
 *
 * A TradeMachine consumes ONE CLOSED BAR at a time and decides what happens to
 * an open trade: stop, target, reversal on an opposite signal, or nothing. It
 * has no idea whether that bar came from a historical fetch or from a live
 * websocket tick stream - which is precisely why backtest results describe
 * what the live runner will do.
 *
 * Bars must be closed. Feeding a forming bar makes signals appear and then
 * vanish as the bar fills in ("repainting"), and the backtest could never
 * reproduce it.
 */

import { getTouchedLevelSignals } from './rules/levelTouch.js';

export const getTradePoints = (side, entryPrice, exitPrice) =>
  side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;

export const isTargetHit = (side, candle, target) =>
  Number.isFinite(target) && (side === 'long' ? candle.high >= target : candle.low <= target);

export const isStopHit = (side, candle, stop) =>
  Number.isFinite(stop) && (side === 'long' ? candle.low <= stop : candle.high >= stop);

export const getSideLevels = (side, levels) =>
  side === 'long'
    ? { target: levels.high, stop: levels.low }
    : { target: levels.low, stop: levels.high };

/** Drop a stop/target that sits on the wrong side of entry - it would fire instantly. */
export const normalizeTradeLevels = (side, entryPrice, levels) => {
  const target =
    Number.isFinite(levels.target) &&
    ((side === 'long' && levels.target > entryPrice) || (side === 'short' && levels.target < entryPrice))
      ? levels.target
      : null;
  const stop =
    Number.isFinite(levels.stop) &&
    ((side === 'long' && levels.stop < entryPrice) || (side === 'short' && levels.stop > entryPrice))
      ? levels.stop
      : null;
  return { target, stop };
};

export const createLeg = (side, entryPrice, entryTime, levels, tradeLevels = getSideLevels(side, levels)) => ({
  side,
  entryPrice,
  entryTime,
  ...normalizeTradeLevels(side, entryPrice, tradeLevels),
});

export const closeLeg = (leg, exitPrice, exitTime, exitReason) => ({
  ...leg,
  exitPrice,
  exitTime,
  exitReason,
  points: getTradePoints(leg.side, leg.entryPrice, exitPrice),
});

/**
 * Stateful, bar-at-a-time trade machine.
 *
 * @param {object}   opts
 * @param {object}   opts.setup       one of STRATEGY_SETUPS
 * @param {object}   opts.levels      { high, mid, low } for this window
 * @param {number}   opts.entryPrice  price the trigger filled at
 * @param {string}   opts.entryTime   formatted trigger timestamp
 * @param {function} opts.formatTime  (barTime) => display string
 */
export function createTradeMachine({ setup, levels, entryPrice, entryTime, formatTime }) {
  const legs = [];
  let activeLeg = createLeg(setup.side, entryPrice, entryTime, levels, {
    target: setup.target(levels),
    stop: setup.stop(levels),
  });
  let exitReason = 'expiry';
  let closed = false;

  return {
    get isOpen() { return !closed; },
    get legs() { return legs; },
    get activeLeg() { return activeLeg; },
    get exitReason() { return exitReason; },

    /**
     * Feed one closed bar.
     * @returns {{event:'stop'|'target'|'reverse'|'none', leg?:object, signal?:object}}
     */
    onBar(bar, hma50State, hma200State) {
      if (closed) return { event: 'none' };

      if (isStopHit(activeLeg.side, bar, activeLeg.stop)) {
        const leg = closeLeg(activeLeg, activeLeg.stop, formatTime(bar.time), 'stop loss');
        legs.push(leg);
        exitReason = 'stop loss';
        activeLeg = null;
        closed = true;
        return { event: 'stop', leg };
      }

      if (isTargetHit(activeLeg.side, bar, activeLeg.target)) {
        const leg = closeLeg(activeLeg, activeLeg.target, formatTime(bar.time), 'target');
        legs.push(leg);
        exitReason = 'target';
        activeLeg = null;
        closed = true;
        return { event: 'target', leg };
      }

      // Reversal needs both HMA states; before warmup we simply hold.
      if (!hma50State || !hma200State) return { event: 'none' };

      const opposite = getTouchedLevelSignals(bar, levels, hma50State, hma200State)
        .find((signal) => signal.side !== activeLeg.side);

      if (opposite) {
        const reason = `${opposite.levelLabel} ${opposite.side} signal`;
        const leg = closeLeg(activeLeg, opposite.price, formatTime(bar.time), reason);
        legs.push(leg);
        activeLeg = createLeg(opposite.side, opposite.price, formatTime(bar.time), levels);
        exitReason = reason;
        return { event: 'reverse', leg, signal: opposite };
      }

      return { event: 'none' };
    },

    /** Force-close at a final price (end of window / expiry). */
    settle(finalPrice, finalTime) {
      if (closed || !activeLeg) return null;
      const leg = closeLeg(activeLeg, finalPrice, formatTime(finalTime), 'expiry');
      legs.push(leg);
      exitReason = 'expiry';
      activeLeg = null;
      closed = true;
      return leg;
    },

    /** Net points across every leg, including reversals. */
    points() {
      return legs.reduce((sum, leg) => sum + leg.points, 0);
    },
  };
}
