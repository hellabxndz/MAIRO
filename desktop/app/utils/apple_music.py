"""Finding something in the Apple Music catalogue and opening it.

Apple has no automation interface for the Apple Music app on Windows, so
"play the new Kendrick album" is done in two steps: look the release up in
Apple's public catalogue search (no account, no key, nothing about the user is
sent — only the words they asked for), then hand the resulting
music.apple.com link to the shell. Windows opens it in the Apple Music app
when that app is installed and in the browser otherwise.

Nothing here touches the user's library, purchases or account.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

from app.utils.logging_setup import get_logger

log = get_logger("applemusic")

SEARCH_URL = "https://itunes.apple.com/search"
TIMEOUT_SECONDS = 12
USER_AGENT = "Mairo/1.0 (desktop assistant)"

# What the user can ask for, mapped to the catalogue's own vocabulary.
ENTITIES = {"song": "song", "album": "album", "artist": "musicArtist"}


@dataclass
class Match:
    """One catalogue result, already reduced to what Mairo needs."""

    kind: str
    title: str
    artist: str
    url: str

    def describe(self) -> str:
        if self.kind == "artist" or not self.artist:
            return self.title
        return f"{self.title} by {self.artist}"


def search(query: str, kind: str = "song", country: str = "US") -> Optional[Match]:
    """Look one thing up in the Apple Music catalogue.

    Returns None when nothing matches. Raises nothing: network trouble is
    logged and reported as no match, because a missing song must never take
    the assistant down.
    """
    entity = ENTITIES.get(kind)
    if entity is None:
        return None
    cleaned = query.strip()
    if not cleaned:
        return None

    params = urllib.parse.urlencode(
        {"term": cleaned, "entity": entity, "limit": 5, "media": "music", "country": country}
    )
    request = urllib.request.Request(
        f"{SEARCH_URL}?{params}", headers={"User-Agent": USER_AGENT}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8", "replace"))
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
        log.warning("Apple Music search failed: %s", exc)
        return None

    for item in payload.get("results") or []:
        match = _to_match(item, kind)
        if match is not None:
            return match
    return None


def _to_match(item: dict, kind: str) -> Optional[Match]:
    """Pick the fields that differ between songs, albums and artists."""
    if kind == "song":
        url = item.get("trackViewUrl") or item.get("collectionViewUrl")
        title = item.get("trackName") or ""
    elif kind == "album":
        url = item.get("collectionViewUrl")
        title = item.get("collectionName") or ""
    else:
        url = item.get("artistLinkUrl")
        title = item.get("artistName") or ""
    if not url or not title:
        return None
    if not str(url).startswith("https://"):
        log.warning("Ignoring a catalogue link that is not https")
        return None
    return Match(kind=kind, title=title, artist=item.get("artistName") or "", url=str(url))
