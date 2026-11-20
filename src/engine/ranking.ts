// Bayesian "Famous" ranking: score = v/(v+m)·R + m/(v+m)·C, where R is a place's rating, v its review count,
// C the mean rating of the list and m a prior weight (300 for attractions, 150 otherwise). A small bonus for
// Google's own relevance order breaks ties.
export interface Rankable { rating?: number; userRatingCount?: number }

export const PRIOR = { attractions: 300, other: 150 };

export function bayesScores<T extends Rankable>(list: T[], m: number, relevanceWeight = 0.05): number[] {
  const rated = list.filter((x) => x.rating != null);
  const C = rated.length ? rated.reduce((s, x) => s + (x.rating as number), 0) / rated.length : 0;
  return list.map((x, i) => {
    const v = x.userRatingCount || 0;
    const R = x.rating ?? C;
    const bayes = v + m > 0 ? (v / (v + m)) * R + (m / (v + m)) * C : C;
    const relevance = list.length > 1 ? 1 - i / (list.length - 1) : 1;
    return bayes + relevanceWeight * relevance;
  });
}

export function rankFamous<T extends Rankable>(list: T[], m: number): (T & { score: number })[] {
  const s = bayesScores(list, m);
  return list.map((x, i) => ({ ...x, score: s[i] })).sort((a, b) => b.score - a.score);
}

/** Hidden gem: rating 4.5+ with 50–800 reviews. */
export const isHiddenGem = (x: Rankable) => (x.rating ?? 0) >= 4.5 && (x.userRatingCount ?? 0) >= 50 && (x.userRatingCount ?? 0) <= 800;
