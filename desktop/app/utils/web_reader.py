"""Fetching a web page and reducing it to readable text.

Two things make this more than a download. The address is chosen by the model,
so it is validated before anything is opened — only http and https, and never
an address on this machine or the local network, which is the classic way an
assistant gets talked into reading something it should not. And the text that
comes back is untrusted: it is content from a stranger, handed to a model that
holds tools. The tool that uses this labels it as data, never instructions.

No new dependency: urllib and html.parser are both standard library.
"""

from __future__ import annotations

import ipaddress
import os
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser

from app.utils.errors import MairoError
from app.utils.logging_setup import get_logger

log = get_logger("web")

TIMEOUT = 15
MAX_BYTES = 2_000_000
MAX_TEXT_CHARS = 6_000
USER_AGENT = "Mairo/0.1 (local desktop assistant)"

# Tags whose contents are never readable text.
SKIPPED_TAGS = {"script", "style", "noscript", "template", "svg", "head", "iframe"}
# Tags that should produce a line break in the extracted text.
BREAKING_TAGS = {
    "p", "div", "br", "li", "tr", "section", "article", "header", "footer",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre",
}


@dataclass
class PageText:
    url: str
    title: str
    text: str
    truncated: bool = False


class _TextExtractor(HTMLParser):
    """Collects visible text, and the page title, from HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in SKIPPED_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in BREAKING_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIPPED_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
        elif tag == "title":
            self._in_title = False
        elif tag in BREAKING_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif self._skip_depth == 0:
            self.parts.append(data)

    def text(self) -> str:
        joined = "".join(self.parts)
        joined = re.sub(r"[ \t\r\f\v]+", " ", joined)
        joined = re.sub(r" *\n *", "\n", joined)
        joined = re.sub(r"\n{3,}", "\n\n", joined)
        return joined.strip()


def _local_fetch_allowed() -> bool:
    """Escape hatch for tests, and for anyone deliberately reading a local server."""
    return os.environ.get("MAIRO_ALLOW_LOCAL_FETCH", "").strip().lower() in {"1", "true", "yes"}


def _blocked_reason(host: str) -> str | None:
    """Why this host must not be fetched, or None if it is fine."""
    if not host:
        return "the address has no host"
    if _local_fetch_allowed():
        return None
    try:
        resolved = socket.getaddrinfo(host, None)
    except OSError:
        return f"“{host}” could not be found"
    for entry in resolved:
        address = entry[4][0]
        try:
            parsed = ipaddress.ip_address(address.split("%")[0])
        except ValueError:
            continue
        if (
            parsed.is_private
            or parsed.is_loopback
            or parsed.is_link_local
            or parsed.is_reserved
            or parsed.is_multicast
            or parsed.is_unspecified
        ):
            return "it points at this computer or your local network"
    return None


def validate_url(raw: str) -> str:
    """Return a safe absolute http(s) URL, or raise with the reason."""
    candidate = (raw or "").strip()
    if not candidate:
        raise MairoError("No web address was given.")

    # "example.com" should become https://example.com, but "javascript:alert(1)"
    # must be refused rather than turned into https://javascript:alert(1). A
    # scheme has no dot in it, and is not followed by a port number.
    scheme_only = re.match(r"^([a-zA-Z][a-zA-Z0-9+.\-]*):(.*)$", candidate, re.DOTALL)
    if "://" in candidate:
        pass
    elif (
        scheme_only
        and "." not in scheme_only.group(1)
        and not scheme_only.group(2)[:1].isdigit()
    ):
        raise MairoError(
            f"Mairo can only read http and https pages, not “{scheme_only.group(1)}”."
        )
    else:
        candidate = f"https://{candidate}"

    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme not in ("http", "https"):
        raise MairoError(
            f"Mairo can only read http and https pages, not “{parsed.scheme}”."
        )
    reason = _blocked_reason(parsed.hostname or "")
    if reason:
        raise MairoError(f"That page cannot be read because {reason}.")
    return candidate


class _SafeRedirects(urllib.request.HTTPRedirectHandler):
    """Re-checks the destination on every hop, so a redirect cannot slip past."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_page(raw_url: str) -> PageText:
    """Download a page and return its readable text."""
    url = validate_url(raw_url)
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/plain,*/*"}
    )
    opener = urllib.request.build_opener(_SafeRedirects)

    try:
        with opener.open(request, timeout=TIMEOUT) as response:
            content_type = (response.headers.get("Content-Type") or "").lower()
            raw = response.read(MAX_BYTES + 1)
            final_url = response.geturl()
    except urllib.error.HTTPError as exc:
        raise MairoError(
            f"That page answered with status {exc.code}.",
            hint="Check the address, or the page may need a login.",
        ) from exc
    except urllib.error.URLError as exc:
        raise MairoError(
            "That page could not be reached.", hint="Check the address and your connection."
        ) from exc
    except (TimeoutError, OSError) as exc:
        raise MairoError("That page took too long to answer.") from exc

    oversized = len(raw) > MAX_BYTES
    raw = raw[:MAX_BYTES]

    if "html" not in content_type and "text" not in content_type and content_type:
        raise MairoError(
            f"That address is {content_type.split(';')[0]}, not a readable page.",
            hint="Mairo can read web pages and plain text.",
        )

    body = raw.decode("utf-8", errors="replace")
    if "html" in content_type or "<html" in body[:2000].lower():
        extractor = _TextExtractor()
        try:
            extractor.feed(body)
        except Exception as exc:  # malformed markup should not raise past here
            log.debug("HTML parsing stopped early: %s", exc)
        text, title = extractor.text(), extractor.title.strip()
    else:
        text, title = body.strip(), ""

    truncated = oversized or len(text) > MAX_TEXT_CHARS
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS].rstrip() + "…"

    if not text:
        raise MairoError("That page had no readable text on it.")

    log.info("Read %d characters from %s", len(text), final_url)
    return PageText(url=final_url, title=title, text=text, truncated=truncated)
