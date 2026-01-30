"""
Result caching for pipeline optimization.

Task 8.1: Implement Result Caching Strategy
"""

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List
from pathlib import Path
import pickle


@dataclass
class CacheKey:
    """
    Unique key for caching results.

    Based on:
    - Image hash (content-based)
    - Processing configuration
    - Version identifier
    """
    image_hash: str
    config_hash: str
    version: str = "1.0"

    def __str__(self) -> str:
        """Get string representation for file naming."""
        return f"{self.image_hash[:16]}_{self.config_hash[:8]}_{self.version}"

    @classmethod
    def from_image_and_config(
        cls,
        image_path: str,
        config: Dict[str, Any],
        version: str = "1.0",
    ) -> "CacheKey":
        """
        Create cache key from image path and config.

        Args:
            image_path: Path to image file
            config: Processing configuration
            version: Version identifier

        Returns:
            CacheKey instance
        """
        # Hash image file content
        with open(image_path, "rb") as f:
            image_hash = hashlib.sha256(f.read()).hexdigest()

        # Hash config
        config_str = json.dumps(config, sort_keys=True)
        config_hash = hashlib.md5(config_str.encode()).hexdigest()

        return cls(
            image_hash=image_hash,
            config_hash=config_hash,
            version=version,
        )

    @classmethod
    def from_image_data(
        cls,
        image_data: bytes,
        config: Dict[str, Any],
        version: str = "1.0",
    ) -> "CacheKey":
        """
        Create cache key from image data bytes.

        Args:
            image_data: Raw image bytes
            config: Processing configuration
            version: Version identifier

        Returns:
            CacheKey instance
        """
        image_hash = hashlib.sha256(image_data).hexdigest()
        config_str = json.dumps(config, sort_keys=True)
        config_hash = hashlib.md5(config_str.encode()).hexdigest()

        return cls(
            image_hash=image_hash,
            config_hash=config_hash,
            version=version,
        )


@dataclass
class CacheEntry:
    """Cached result entry."""
    key: CacheKey
    result: Dict[str, Any]
    created_at: float
    expires_at: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        """Check if entry is expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at


class ResultCache:
    """
    Cache for processing results.

    Supports:
    - In-memory caching
    - File-based persistence
    - TTL-based expiration
    - LRU eviction

    Example:
        >>> cache = ResultCache(cache_dir="./cache")
        >>> key = CacheKey.from_image_and_config(path, config)
        >>> if cache.has(key):
        ...     result = cache.get(key)
        >>> else:
        ...     result = process(image)
        ...     cache.set(key, result)
    """

    def __init__(
        self,
        cache_dir: Optional[str] = None,
        max_memory_items: int = 100,
        default_ttl: Optional[int] = None,
        persist: bool = True,
    ):
        """
        Initialize cache.

        Args:
            cache_dir: Directory for persistent cache
            max_memory_items: Maximum items in memory
            default_ttl: Default time-to-live in seconds
            persist: Whether to persist to disk
        """
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.max_memory_items = max_memory_items
        self.default_ttl = default_ttl
        self.persist = persist

        # In-memory cache
        self._memory_cache: Dict[str, CacheEntry] = {}
        self._access_order: List[str] = []

        # Create cache directory
        if self.cache_dir and self.persist:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

    def has(self, key: CacheKey) -> bool:
        """
        Check if key exists in cache and is valid.

        Args:
            key: Cache key

        Returns:
            True if valid entry exists
        """
        key_str = str(key)

        # Check memory cache
        if key_str in self._memory_cache:
            entry = self._memory_cache[key_str]
            if not entry.is_expired:
                return True
            else:
                self._remove_from_memory(key_str)

        # Check disk cache
        if self.persist and self.cache_dir:
            cache_path = self._get_cache_path(key_str)
            if cache_path.exists():
                try:
                    entry = self._load_from_disk(cache_path)
                    if not entry.is_expired:
                        self._add_to_memory(key_str, entry)
                        return True
                    else:
                        cache_path.unlink()
                except Exception:
                    pass

        return False

    def get(self, key: CacheKey) -> Optional[Dict[str, Any]]:
        """
        Get cached result.

        Args:
            key: Cache key

        Returns:
            Cached result or None if not found
        """
        key_str = str(key)

        # Check memory cache first
        if key_str in self._memory_cache:
            entry = self._memory_cache[key_str]
            if not entry.is_expired:
                self._update_access(key_str)
                return entry.result
            else:
                self._remove_from_memory(key_str)

        # Check disk cache
        if self.persist and self.cache_dir:
            cache_path = self._get_cache_path(key_str)
            if cache_path.exists():
                try:
                    entry = self._load_from_disk(cache_path)
                    if not entry.is_expired:
                        self._add_to_memory(key_str, entry)
                        return entry.result
                    else:
                        cache_path.unlink()
                except Exception:
                    pass

        return None

    def set(
        self,
        key: CacheKey,
        result: Dict[str, Any],
        ttl: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Store result in cache.

        Args:
            key: Cache key
            result: Result to cache
            ttl: Time-to-live in seconds (overrides default)
            metadata: Optional metadata
        """
        key_str = str(key)
        now = time.time()

        ttl_seconds = ttl if ttl is not None else self.default_ttl
        expires_at = now + ttl_seconds if ttl_seconds else None

        entry = CacheEntry(
            key=key,
            result=result,
            created_at=now,
            expires_at=expires_at,
            metadata=metadata or {},
        )

        # Add to memory
        self._add_to_memory(key_str, entry)

        # Persist to disk
        if self.persist and self.cache_dir:
            self._save_to_disk(key_str, entry)

    def invalidate(self, key: CacheKey) -> bool:
        """
        Remove entry from cache.

        Args:
            key: Cache key

        Returns:
            True if entry was removed
        """
        key_str = str(key)
        removed = False

        if key_str in self._memory_cache:
            self._remove_from_memory(key_str)
            removed = True

        if self.persist and self.cache_dir:
            cache_path = self._get_cache_path(key_str)
            if cache_path.exists():
                cache_path.unlink()
                removed = True

        return removed

    def clear(self) -> int:
        """
        Clear all cached entries.

        Returns:
            Number of entries cleared
        """
        count = len(self._memory_cache)
        self._memory_cache.clear()
        self._access_order.clear()

        if self.persist and self.cache_dir:
            for cache_file in self.cache_dir.glob("*.cache"):
                cache_file.unlink()
                count += 1

        return count

    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        memory_count = len(self._memory_cache)
        disk_count = 0

        if self.persist and self.cache_dir:
            disk_count = len(list(self.cache_dir.glob("*.cache")))

        return {
            "memory_items": memory_count,
            "disk_items": disk_count,
            "max_memory_items": self.max_memory_items,
            "persist_enabled": self.persist,
        }

    def _get_cache_path(self, key_str: str) -> Path:
        """Get file path for cache entry."""
        return self.cache_dir / f"{key_str}.cache"

    def _add_to_memory(self, key_str: str, entry: CacheEntry) -> None:
        """Add entry to memory cache with LRU eviction."""
        # Remove oldest if at capacity
        while len(self._memory_cache) >= self.max_memory_items:
            if self._access_order:
                oldest = self._access_order.pop(0)
                self._memory_cache.pop(oldest, None)

        self._memory_cache[key_str] = entry
        if key_str in self._access_order:
            self._access_order.remove(key_str)
        self._access_order.append(key_str)

    def _remove_from_memory(self, key_str: str) -> None:
        """Remove entry from memory cache."""
        self._memory_cache.pop(key_str, None)
        if key_str in self._access_order:
            self._access_order.remove(key_str)

    def _update_access(self, key_str: str) -> None:
        """Update access order for LRU."""
        if key_str in self._access_order:
            self._access_order.remove(key_str)
            self._access_order.append(key_str)

    def _save_to_disk(self, key_str: str, entry: CacheEntry) -> None:
        """Save entry to disk."""
        cache_path = self._get_cache_path(key_str)
        with open(cache_path, "wb") as f:
            pickle.dump(entry, f)

    def _load_from_disk(self, cache_path: Path) -> CacheEntry:
        """Load entry from disk."""
        with open(cache_path, "rb") as f:
            return pickle.load(f)
