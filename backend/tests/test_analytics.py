import unittest

from backend.github_growth.analytics import detect_growth_spikes
from backend.github_growth.models import DailyStarPoint


class GrowthSpikeDetectionTest(unittest.TestCase):
    def test_detect_growth_spikes_finds_outlier_day(self) -> None:
        daily = [
            DailyStarPoint(date=f"2026-01-{day:02d}", stars=2, cumulative=day * 2)
            for day in range(1, 15)
        ]
        daily.append(DailyStarPoint(date="2026-01-15", stars=50, cumulative=78))

        spikes = detect_growth_spikes(daily, window_days=7, min_z_score=3.0, min_stars=10)

        self.assertEqual(len(spikes), 1)
        self.assertEqual(spikes[0].date, "2026-01-15")
        self.assertEqual(spikes[0].stars, 50)


if __name__ == "__main__":
    unittest.main()
