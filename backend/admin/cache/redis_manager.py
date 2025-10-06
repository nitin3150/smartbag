import redis.asyncio as redis
import json
import pickle
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class RedisManager:
    def __init__(self):
        self.redis = None
    
    async def init_redis_pool(self, redis_url: str = "redis://localhost:6379"):
        """Initialize Redis connection pool"""
        self.redis = await redis.from_url(
            redis_url,
            max_connections=20,
            retry_on_timeout=True,
            decode_responses=False  # Handle binary data for complex objects
        )
        logger.info("Redis connection pool initialized")
    
    async def close(self):
        """Close Redis connections"""
        if self.redis:
            await self.redis.close()
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from Redis with automatic deserialization"""
        try:
            value = await self.redis.get(key)
            if value is None:
                return None
            
            # Try JSON first, fallback to pickle
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return pickle.loads(value)
        except Exception as e:
            logger.error(f"Redis GET error for key {key}: {e}")
            return None
    
    async def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """Set value in Redis with TTL"""
        try:
            # Try JSON first for simple objects, fallback to pickle
            try:
                serialized_value = json.dumps(value, default=str)
            except (TypeError, ValueError):
                serialized_value = pickle.dumps(value)
            
            await self.redis.setex(key, ttl, serialized_value)
            return True
        except Exception as e:
            logger.error(f"Redis SET error for key {key}: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from Redis"""
        try:
            result = await self.redis.delete(key)
            return bool(result)
        except Exception as e:
            logger.error(f"Redis DELETE error for key {key}: {e}")
            return False
    
    async def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """Get multiple keys from Redis"""
        try:
            if not keys:
                return {}
            
            values = await self.redis.mget(keys)
            result = {}
            
            for key, value in zip(keys, values):
                if value is not None:
                    try:
                        result[key] = json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        result[key] = pickle.loads(value)
            
            return result
        except Exception as e:
            logger.error(f"Redis MGET error: {e}")
            return {}
    
    async def increment(self, key: str, amount: int = 1) -> int:
        """Increment counter in Redis"""
        try:
            return await self.redis.incrby(key, amount)
        except Exception as e:
            logger.error(f"Redis INCR error for key {key}: {e}")
            return 0

# Global Redis instance
redis_manager = RedisManager()

def get_redis() -> RedisManager:
    return redis_manager