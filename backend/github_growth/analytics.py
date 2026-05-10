from __future__ import annotations

import statistics

from .models import DailyStarPoint, GrowthSpike


def detect_growth_spikes(
    daily: list[DailyStarPoint],
    window_days: int = 14,
    min_z_score: float = 3.0,
    min_stars: int = 10,
    limit: int = 10,
) -> list[GrowthSpike]:
    spikes: list[GrowthSpike] = []
    if len(daily) <= window_days:
        return spikes

    for index in range(window_days, len(daily)):
        current = daily[index]
        baseline_window = [point.stars for point in daily[index - window_days : index]]
        mean = statistics.fmean(baseline_window)
        stddev = statistics.pstdev(baseline_window)
        z_score = (current.stars - mean) / stddev if stddev > 0 else 0.0

        if stddev == 0 and current.stars >= max(min_stars, mean * 3):
            z_score = float(current.stars)

        if current.stars >= min_stars and z_score >= min_z_score:
            spikes.append(
                GrowthSpike(
                    date=current.date,
                    stars=current.stars,
                    baseline=round(mean, 2),
                    z_score=round(z_score, 2),
                    cumulative=current.cumulative,
                    window_days=window_days,
                )
            )

    return sorted(spikes, key=lambda spike: (spike.z_score, spike.stars), reverse=True)[:limit]
