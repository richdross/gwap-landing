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

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bool(value) {
  return value === true;
}

export function evaluateWinnerRule(input = {}, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  const externalDemandScore = finite(input.externalDemandScore);
  const trafficLiftPct = finite(input.trafficLiftPct);
  const engagementLiftPct = finite(input.engagementLiftPct);
  const revenueCents = finite(input.revenueCents);
  const comparisonWindows = finite(input.comparisonWindows);
  const hasExternalEvidence = bool(input.hasExternalEvidence);
  const hasGA4Evidence = bool(input.hasGA4Evidence);
  const hasRevenueEvidence = bool(input.hasRevenueEvidence);

  const evidenceComplete = hasExternalEvidence && hasGA4Evidence && hasRevenueEvidence;
  const externalDemandStrong = hasExternalEvidence && externalDemandScore >= t.minExternalDemandScore;
  const trafficRising = hasGA4Evidence && trafficLiftPct >= t.minTrafficLiftPct;
  const engagementRising = hasGA4Evidence && engagementLiftPct >= t.minEngagementLiftPct;
  const revenuePositive = hasRevenueEvidence && revenueCents >= t.minCloneRevenueCents;
  const monetizationGap = hasRevenueEvidence && revenueCents <= 0;

  let decision = WINNER_DECISIONS.HOLD;
  let winnerAlert = false;
  let reason = "Evidence is incomplete or mixed. Keep observing.";

  // Revenue has priority. If demand and engagement are proven and revenue exists,
  // the operating move is to clone/scale the proven pattern rather than merely monetize it.
  if (evidenceComplete && revenuePositive && externalDemandStrong && engagementRising) {
    decision = WINNER_DECISIONS.CLONE;
    reason = "Revenue exists and the pattern is supported by external demand plus rising internal engagement.";
  }
  // Recovered GA4 Sniper doctrine:
  // Traffic up + Engagement up + Revenue = 0 => WINNER ALERT => monetize.
  else if (evidenceComplete && monetizationGap && externalDemandStrong && trafficRising && engagementRising) {
    decision = WINNER_DECISIONS.MONETIZE;
    winnerAlert = true;
    reason = "External demand and internal engagement are rising, but revenue is zero: monetization gap detected.";
  }
  // Kill only after enough observed comparison windows and weak evidence.
  else if (
    evidenceComplete &&
    comparisonWindows >= t.minComparisonWindowsForKill &&
    !externalDemandStrong &&
    !trafficRising &&
    !engagementRising &&
    !revenuePositive
  ) {
    decision = WINNER_DECISIONS.KILL;
    reason = "Multiple observation windows show weak demand, weak engagement, and no revenue.";
  }

  return {
    rule: WINNER_RULE_VERSION,
    decision,
    winnerAlert,
    reason,
    evidenceComplete,
    priorityOrder: ["revenue", "engagement", "traffic"],
    evidence: {
      externalDemandScore,
      trafficLiftPct,
      engagementLiftPct,
      revenueCents,
      comparisonWindows,
      hasExternalEvidence,
      hasGA4Evidence,
      hasRevenueEvidence,
    },
    gates: {
      externalDemandStrong,
      trafficRising,
      engagementRising,
      revenuePositive,
      monetizationGap,
    },
    thresholds: t,
  };
}
