/**
 * Simple In-Memory Cache for Hot Data
 * Reduces database load for frequently accessed data
 * TTL-based expiration with automatic cleanup
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
    
    // Cleanup expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  /**
   * Get a cached value
   * @param {string} key - Cache key
   * @returns {*} Cached value or null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a cached value with TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds (default: 5000ms)
   */
  set(key, value, ttlMs = 5000) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  /**
   * Delete a cached value
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} prefix - Key prefix to match
   */
  deleteByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size
    };
  }

  /**
   * Shutdown cache
   */
  shutdown() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Singleton instance
const cache = new MemoryCache();

// Cache key generators
const cacheKeys = {
  gameState: () => 'game_state',
  leaderboard: (level) => `leaderboard:${level || 'all'}`,
  teamProgress: (teamId) => `team_progress:${teamId}`,
  puzzleList: (level) => `puzzles:${level || 'all'}`,
  dashboardStats: () => 'dashboard_stats'
};

// TTL constants (in milliseconds)
const TTL = {
  GAME_STATE: 2000,      // 2 seconds - changes infrequently
  LEADERBOARD: 3000,     // 3 seconds - updates on submissions
  TEAM_PROGRESS: 2000,   // 2 seconds - updates on puzzle solve
  PUZZLES: 30000,        // 30 seconds - rarely changes
  DASHBOARD_STATS: 5000  // 5 seconds - admin dashboard
};

/**
 * Cached wrapper function
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch data if not cached
 * @param {number} ttl - TTL in milliseconds
 * @returns {*} Cached or fetched value
 */
async function cached(key, fetchFn, ttl = 5000) {
  const cachedValue = cache.get(key);
  if (cachedValue !== null) {
    return cachedValue;
  }
  
  const value = await fetchFn();
  cache.set(key, value, ttl);
  return value;
}

module.exports = {
  cache,
  cacheKeys,
  TTL,
  cached
};
