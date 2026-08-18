export const WINNER_RULE_VERSION = "GWAP_WINNER_RULE_V1";

export const WINNER_DECISIONS = Object.freeze({
  MONETIZE: "MONETIZE",
  CLONE: "CLONE",
  KILL: "KILL",
  HOLD: "HOLD",
});

const DEFAULT_THRESHOLDS = Object.freeze({
  minExternalDemandScore: 55,
  minEngagementLiftPct: 5,
  minTrafficLiftPct: 5,
  minCloneRevenueCents: 1,
  minComparisonWindowsForKill: 2,
});

function finite(value