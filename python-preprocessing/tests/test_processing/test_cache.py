"""Tests for result caching."""

import pytest
import time
import tempfile
from pathlib import Path

from src.processing.cache import (
    CacheKey,
    CacheEntry,
    ResultCache,
)


class TestCacheKey:
    """Tests for CacheKey dataclass."""

    def test_create_key(self):
        """Test creating a cache key."""
        key = CacheKey(
            image_hash="abc123",
            config_hash="def456",
            version="1.0",
        )
        assert key.image_hash == "abc123"
        assert key.config_hash == "def456"
        assert key.version == "1.0"

    def test_key_str(self):
        """Test string representation."""
        key = CacheKey(
            image_hash="abcdef1234567890",
            config_hash="12345678",
            version="2.0",
        )
        key_str = str(key)
        assert "abcdef1234567890" in key_str
        assert "12345678" in key_str
        assert "2.0" in key_str

    def test_from_image_data(self):
        """Test creating key from image data."""
        data = b"test image data"
        config = {"param": "value"}

        key = CacheKey.from_image_data(data, config)

        assert len(key.image_hash) == 64  # SHA256
        assert len(key.config_hash) == 32  # MD5
        assert key.version == "1.0"

    def test_from_image_data_different_data(self):
        """Test different data produces different keys."""
        data1 = b"image data 1"
        data2 = b"image data 2"
        config = {"param": "value"}

        key1 = CacheKey.from_image_data(data1, config)
        key2 = CacheKey.from_image_data(data2, config)

        assert key1.image_hash != key2.image_hash

    def test_from_image_data_different_config(self):
        """Test different config produces different keys."""
        data = b"image data"
        config1 = {"param": "value1"}
        config2 = {"param": "value2"}

        key1 = CacheKey.from_image_data(data, config1)
        key2 = CacheKey.from_image_data(data, config2)

        assert key1.config_hash != key2.config_hash

    def test_from_image_and_config(self, tmp_path):
        """Test creating key from file path."""
        # Create temp image file
        image_path = tmp_path / "test.png"
        image_path.write_bytes(b"fake image data")

        config = {"param": "value"}
        key = CacheKey.from_image_and_config(str(image_path), config)

        assert len(key.image_hash) == 64
        assert len(key.config_hash) == 32


class TestCacheEntry:
    """Tests for CacheEntry dataclass."""

    def test_create_entry(self):
        """Test creating a cache entry."""
        key = CacheKey("hash1", "hash2")
        entry = CacheEntry(
            key=key,
            result={"zones": []},
            created_at=time.time(),
        )
        assert entry.result == {"zones": []}
        assert entry.expires_at is None

    def test_entry_not_expired_no_ttl(self):
        """Test entry without TTL is never expired."""
        key = CacheKey("hash1", "hash2")
        entry = CacheEntry(
            key=key,
            result={"zones": []},
            created_at=time.time(),
            expires_at=None,
        )
        assert entry.is_expired is False

    def test_entry_not_expired_future_ttl(self):
        """Test entry with future expiry is not expired."""
        key = CacheKey("hash1", "hash2")
        entry = CacheEntry(
            key=key,
            result={"zones": []},
            created_at=time.time(),
            expires_at=time.time() + 3600,  # 1 hour in future
        )
        assert entry.is_expired is False

    def test_entry_expired_past_ttl(self):
        """Test entry with past expiry is expired."""
        key = CacheKey("hash1", "hash2")
        entry = CacheEntry(
            key=key,
            result={"zones": []},
            created_at=time.time() - 7200,
            expires_at=time.time() - 3600,  # 1 hour ago
        )
        assert entry.is_expired is True


class TestResultCacheInit:
    """Tests for ResultCache initialization."""

    def test_default_init(self):
        """Test default initialization."""
        cache = ResultCache()
        assert cache.max_memory_items == 100
        assert cache.default_ttl is None
        assert cache.persist is True

    def test_custom_init(self):
        """Test custom initialization."""
        cache = ResultCache(
            max_memory_items=50,
            default_ttl=3600,
            persist=False,
        )
        assert cache.max_memory_items == 50
        assert cache.default_ttl == 3600
        assert cache.persist is False

    def test_init_creates_cache_dir(self, tmp_path):
        """Test initialization creates cache directory."""
        cache_dir = tmp_path / "cache"
        cache = ResultCache(cache_dir=str(cache_dir))
        assert cache_dir.exists()


class TestResultCacheMemory:
    """Tests for in-memory caching."""

    @pytest.fixture
    def cache(self):
        return ResultCache(persist=False)

    def test_set_and_get(self, cache):
        """Test setting and getting values."""
        key = CacheKey("hash1", "hash2")
        result = {"zones": [{"id": "zone_1"}]}

        cache.set(key, result)
        retrieved = cache.get(key)

        assert retrieved == result

    def test_has_existing(self, cache):
        """Test has returns True for existing key."""
        key = CacheKey("hash1", "hash2")
        cache.set(key, {"zones": []})

        assert cache.has(key) is True

    def test_has_missing(self, cache):
        """Test has returns False for missing key."""
        key = CacheKey("hash1", "hash2")
        assert cache.has(key) is False

    def test_get_missing(self, cache):
        """Test get returns None for missing key."""
        key = CacheKey("hash1", "hash2")
        assert cache.get(key) is None

    def test_invalidate(self, cache):
        """Test invalidating a key."""
        key = CacheKey("hash1", "hash2")
        cache.set(key, {"zones": []})

        assert cache.has(key) is True
        removed = cache.invalidate(key)
        assert removed is True
        assert cache.has(key) is False

    def test_invalidate_missing(self, cache):
        """Test invalidating missing key."""
        key = CacheKey("hash1", "hash2")
        removed = cache.invalidate(key)
        assert removed is False

    def test_clear(self, cache):
        """Test clearing cache."""
        for i in range(5):
            key = CacheKey(f"hash{i}", "config")
            cache.set(key, {"id": i})

        count = cache.clear()
        assert count == 5
        assert cache.stats()["memory_items"] == 0


class TestResultCacheLRU:
    """Tests for LRU eviction."""

    def test_lru_eviction(self):
        """Test LRU eviction when at capacity."""
        cache = ResultCache(max_memory_items=3, persist=False)

        # Add 3 items
        for i in range(3):
            key = CacheKey(f"hash{i}", "config")
            cache.set(key, {"id": i})

        # All 3 should exist
        for i in range(3):
            key = CacheKey(f"hash{i}", "config")
            assert cache.has(key) is True

        # Add 4th item - should evict first
        key4 = CacheKey("hash4", "config")
        cache.set(key4, {"id": 4})

        # First should be evicted
        key0 = CacheKey("hash0", "config")
        assert cache.has(key0) is False

        # Rest should exist
        for i in [1, 2]:
            key = CacheKey(f"hash{i}", "config")
            assert cache.has(key) is True
        assert cache.has(key4) is True

    def test_lru_access_updates_order(self):
        """Test accessing an item updates LRU order."""
        cache = ResultCache(max_memory_items=3, persist=False)

        # Add 3 items
        for i in range(3):
            key = CacheKey(f"hash{i}", "config")
            cache.set(key, {"id": i})

        # Access first item to make it most recent
        key0 = CacheKey("hash0", "config")
        cache.get(key0)

        # Add new item - should evict second (hash1), not first
        key4 = CacheKey("hash4", "config")
        cache.set(key4, {"id": 4})

        # hash1 should be evicted
        key1 = CacheKey("hash1", "config")
        assert cache.has(key1) is False

        # hash0 should still exist
        assert cache.has(key0) is True


class TestResultCacheTTL:
    """Tests for TTL expiration."""

    def test_ttl_expiration(self):
        """Test entries expire after TTL."""
        cache = ResultCache(default_ttl=1, persist=False)  # 1 second TTL

        key = CacheKey("hash1", "config")
        cache.set(key, {"zones": []})

        # Should exist initially
        assert cache.has(key) is True

        # Wait for expiration
        time.sleep(1.5)

        # Should be expired
        assert cache.has(key) is False
        assert cache.get(key) is None

    def test_custom_ttl(self):
        """Test custom TTL per entry."""
        cache = ResultCache(default_ttl=3600, persist=False)

        key = CacheKey("hash1", "config")
        cache.set(key, {"zones": []}, ttl=1)  # 1 second

        assert cache.has(key) is True
        time.sleep(1.5)
        assert cache.has(key) is False


class TestResultCachePersistence:
    """Tests for disk persistence."""

    def test_persist_and_load(self, tmp_path):
        """Test persisting and loading from disk."""
        cache_dir = tmp_path / "cache"

        # Write to cache
        cache1 = ResultCache(cache_dir=str(cache_dir), persist=True)
        key = CacheKey("hash1", "config")
        cache1.set(key, {"zones": [{"id": "z1"}]})

        # Create new cache instance
        cache2 = ResultCache(cache_dir=str(cache_dir), persist=True)

        # Should load from disk
        assert cache2.has(key) is True
        result = cache2.get(key)
        assert result == {"zones": [{"id": "z1"}]}

    def test_invalidate_removes_disk_file(self, tmp_path):
        """Test invalidate removes disk file."""
        cache_dir = tmp_path / "cache"
        cache = ResultCache(cache_dir=str(cache_dir), persist=True)

        key = CacheKey("hash1", "config")
        cache.set(key, {"zones": []})

        # File should exist
        cache_files = list(cache_dir.glob("*.cache"))
        assert len(cache_files) == 1

        # Invalidate
        cache.invalidate(key)

        # File should be removed
        cache_files = list(cache_dir.glob("*.cache"))
        assert len(cache_files) == 0

    def test_clear_removes_disk_files(self, tmp_path):
        """Test clear removes all disk files."""
        cache_dir = tmp_path / "cache"
        cache = ResultCache(cache_dir=str(cache_dir), persist=True)

        for i in range(3):
            key = CacheKey(f"hash{i}", "config")
            cache.set(key, {"id": i})

        # Files should exist
        cache_files = list(cache_dir.glob("*.cache"))
        assert len(cache_files) == 3

        # Clear
        cache.clear()

        # Files should be removed
        cache_files = list(cache_dir.glob("*.cache"))
        assert len(cache_files) == 0


class TestResultCacheStats:
    """Tests for cache statistics."""

    def test_stats_empty(self):
        """Test stats for empty cache."""
        cache = ResultCache(persist=False)
        stats = cache.stats()

        assert stats["memory_items"] == 0
        assert stats["disk_items"] == 0
        assert stats["persist_enabled"] is False

    def test_stats_with_items(self, tmp_path):
        """Test stats with items."""
        cache_dir = tmp_path / "cache"
        cache = ResultCache(
            cache_dir=str(cache_dir),
            max_memory_items=10,
            persist=True,
        )

        for i in range(3):
            key = CacheKey(f"hash{i}", "config")
            cache.set(key, {"id": i})

        stats = cache.stats()
        assert stats["memory_items"] == 3
        assert stats["disk_items"] == 3
        assert stats["max_memory_items"] == 10
        assert stats["persist_enabled"] is True


class TestResultCacheMetadata:
    """Tests for cache metadata."""

    def test_set_with_metadata(self):
        """Test setting entry with metadata."""
        cache = ResultCache(persist=False)
        key = CacheKey("hash1", "config")

        cache.set(
            key,
            {"zones": []},
            metadata={"source": "test", "version": "1.0"},
        )

        # Metadata is stored internally
        assert cache.has(key) is True
