import unittest

from backend.github_growth.ingestion import StarHistoryIngestor
from backend.github_growth.models import RateLimitSnapshot, RepoRef


class FakePage:
    def __init__(self, data, next_url=None, last_page=None):
        self.data = data
        self.next_url = next_url
        self.last_page = last_page
        self.rate_limit = RateLimitSnapshot(limit=5000, remaining=4999, reset_epoch=0)


class FakeClient:
    def __init__(self):
        self.calls = 0

    def get_page(self, path_or_url, params=None, accept="application/vnd.github+json"):
        self.calls += 1
        if self.calls == 1:
            return FakePage(
                [
                    {"starred_at": "2026-01-01T01:00:00Z"},
                    {"starred_at": "2026-01-03T01:00:00Z"},
                ],
                next_url="next",
                last_page=2,
            )
        return FakePage(
            [{"starred_at": "2026-01-03T02:00:00Z"}],
            next_url=None,
            last_page=2,
        )


class StarHistoryIngestorTest(unittest.TestCase):
    def test_builds_filled_daily_cumulative_history(self) -> None:
        history = StarHistoryIngestor(FakeClient()).get_star_history(
            repo=RepoRef("owner", "repo"),
            total_stars=101,
            max_pages=10,
        )

        self.assertTrue(history.metadata.complete)
        self.assertEqual(
            [(point.date, point.stars, point.cumulative) for point in history.daily],
            [
                ("2026-01-01", 1, 1),
                ("2026-01-02", 0, 1),
                ("2026-01-03", 2, 3),
            ],
        )


if __name__ == "__main__":
    unittest.main()
