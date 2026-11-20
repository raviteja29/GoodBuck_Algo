/**
 * The "level touch" strategy family, extracted from GiftNiftyBacktest.jsx.
 *
 * Six setups: each of the high / mid / low levels, taken long when both HMAs
 * are rising and short otherwise. Entry is the level price on any candle whose
 * range contains it; stop and target are the opposite and same ends of the
 * level box.
 *
 * Pure predicates only - no fetching, no state. The engine drives these, which
 * is what lets the backtester and the live runner share one implementation.
 */

export const LEVEL_CONFIGS = [
  { key: 'low', label: 'Low', value: (levels) => levels.low },
  { key: 'mid', label: 'Mid', value: (levels) => levels.mid },
  { key: 'high', label: 'High', value: (levels) => levels.high },
];

/** A candle "touches" a level when the level falls inside its range. */
export const levelWasTouched = (candle, levelValue) =>
  candle.low <= levelValue && candle.high >= levelValue;

export const bothIncreasing = (hma50State, hma200State) =>
  hma50State.trend === 'increasing' && hma200State.trend === 'increasing';

export const getTrendSignalSide = (hma50State, hma200State) =>
  bothIncreasing(hma50State, hma200State) ? 'long' : 'short';

/** Every level the candle touched, each tagged with the side the trend implies. */
export const getTouchedLevelSignals = (candle, levels, hma50State, hma200State) =>
  LEVEL_CONFIGS
    .filter((cfg) => levelWasTouched(candle, cfg.value(levels)))
    .map((cfg) => ({
      level: cfg.key,
      levelLabel: cfg.label,
      price: cfg.value(levels),
      side: getTrendSignalSide(hma50State, hma200State),
    }));

export const STRATEGY_SETUPS = LEVEL_CONFIGS.flatMap((cfg) => [
  {
    key: `${cfg.key}-rising-long`,
    name: `${cfg.label} Rising Long`,
    side: 'long',
    entry: (_candle, levels) => cfg.value(levels),
    stop: (levels) => levels.low,
    target: (levels) => levels.high,
    matches: ({ candle, levels, hma50State, hma200State }) =>
      levelWasTouched(candle, cfg.value(levels)) && bothIncreasing(hma50State, hma200State),
  },
  {
    key: `${cfg.key}-non-rising-short`,
    name: `${cfg.label} Non-Rising Short`,
    side: 'short',
    entry: (_candle, levels) => cfg.value(levels),
    stop: (levels) => levels.high,
    target: (levels) => levels.low,
    matches: ({ candle, levels, hma50State, hma200State }) =>
      levelWasTouched(candle, cfg.value(levels)) && !bothIncreasing(hma50State, hma200State),
  },
]);

export const getSetup = (key) => STRATEGY_SETUPS.find((s) => s.key === key) || null;
