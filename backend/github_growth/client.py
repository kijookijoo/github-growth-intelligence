from __future__ import annotations

import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from .models import RateLimitSnapshot


GITHUB_API_BASE_URL = "https://api.github.com"
GITHUB_API_VERSION = "2022-11-28"


class GitHubApiError(RuntimeError):
    def __init__(self, status_code: int, message: str, rate_limit: RateLimitSnapshot):
        super().__init__(message)
        self.status_code = status_code
        self.rate_limit = rate_limit


class GitHubRateLimitError(GitHubApiError):
    pass


@dataclass
class PageResult:
    data: Any
    next_url: str | None
    last_page: int | None
    rate_limit: RateLimitSnapshot


def parse_github_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class GitHubHttpClient:
    def __init__(
        self,
        token: str | None = None,
        base_url: str = GITHUB_API_BASE_URL,
        timeout_seconds: float = 30.0,
        max_retries: int = 2,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.max_retries = max_retries
        self._client = httpx.Client(timeout=timeout_seconds, follow_redirects=True)

    def close(self) -> None:
        self._client.close()

    def get_json(
        self,
        path_or_url: str,
        params: dict[str, Any] | None = None,
        accept: str = "application/vnd.github+json",
    ) -> tuple[Any, RateLimitSnapshot]:
        response = self._request("GET", path_or_url, params=params, accept=accept)
        return response.json(), self._rate_limit_from_response(response)

    def get_page(
        self,
        path_or_url: str,
        params: dict[str, Any] | None = None,
        accept: str = "application/vnd.github+json",
    ) -> PageResult:
        response = self._request("GET", path_or_url, params=params, accept=accept)
        links = self._parse_link_header(response.headers.get("link"))
        return PageResult(
            data=response.json(),
            next_url=links.get("next"),
            last_page=self._extract_page_number(links.get("last")),
            rate_limit=self._rate_limit_from_response(response),
        )

    def _request(
        self,
        method: str,
        path_or_url: str,
        params: dict[str, Any] | None,
        accept: str,
    ) -> httpx.Response:
        url = path_or_url if path_or_url.startswith("http") else f"{self.base_url}{path_or_url}"
        headers = {
            "Accept": accept,
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
            "User-Agent": "open-source-growth-intelligence-mvp",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        last_response: httpx.Response | None = None
        for attempt in range(self.max_retries + 1):
            response = self._client.request(method, url, params=params, headers=headers)
            if response.status_code not in {403, 429}:
                self._raise_for_error(response)
                return response

            last_response = response
            if attempt >= self.max_retries:
                break
            self._sleep_for_rate_limit(response, attempt)

        assert last_response is not None
        self._raise_for_error(last_response)
        return last_response

    def _raise_for_error(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return

        rate_limit = self._rate_limit_from_response(response)
        message = self._error_message(response)
        if response.status_code in {403, 429}:
            raise GitHubRateLimitError(response.status_code, message, rate_limit)
        raise GitHubApiError(response.status_code, message, rate_limit)

    def _sleep_for_rate_limit(self, response: httpx.Response, attempt: int) -> None:
        retry_after = response.headers.get("retry-after")
        if retry_after and retry_after.isdigit():
            time.sleep(min(int(retry_after), 120))
            return

        remaining = response.headers.get("x-ratelimit-remaining")
        reset = response.headers.get("x-ratelimit-reset")
        if remaining == "0" and reset and reset.isdigit():
            delay = int(reset) - int(time.time()) + 1
            time.sleep(max(0, min(delay, 120)))
            return

        time.sleep(min(60 * (2**attempt), 120))

    def _error_message(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return response.text or f"GitHub API returned HTTP {response.status_code}"
        return payload.get("message") or f"GitHub API returned HTTP {response.status_code}"

    def _rate_limit_from_response(self, response: httpx.Response) -> RateLimitSnapshot:
        return RateLimitSnapshot(
            limit=self._parse_int_header(response, "x-ratelimit-limit"),
            remaining=self._parse_int_header(response, "x-ratelimit-remaining"),
            reset_epoch=self._parse_int_header(response, "x-ratelimit-reset"),
            resource=response.headers.get("x-ratelimit-resource"),
        )

    def _parse_int_header(self, response: httpx.Response, name: str) -> int | None:
        value = response.headers.get(name)
        if value is None:
            return None
        try:
            return int(value)
        except ValueError:
            return None

    def _parse_link_header(self, value: str | None) -> dict[str, str]:
        if not value:
            return {}
        links: dict[str, str] = {}
        for part in value.split(","):
            section = part.strip().split(";")
            if len(section) < 2:
                continue
            url = section[0].strip()
            rel = section[1].strip()
            if url.startswith("<") and url.endswith(">") and rel.startswith('rel="'):
                links[rel[5:-1]] = url[1:-1]
        return links

    def _extract_page_number(self, url: str | None) -> int | None:
        if not url:
            return None
        parsed = httpx.URL(url)
        page = parsed.params.get("page")
        if not page:
            return None
        try:
            return int(page)
        except ValueError:
            return None


def parse_http_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = parsedate_to_datetime(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
