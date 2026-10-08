import Redis from "ioredis";
export const redis:Redis = new Redis(
    process.env.REDIS_URL || "redis://localhost:6379"
);


export const expiredZset: string = "expired:reserve";

export const RESERVE_TTL_SECONDS: number = Number(process.env.RESERVE_TTL_SECONDS)|| 300;

export const reserveScript : string = `
    local stock = tonumber(redis.call("GET", KEYS[1]))
        
    if not stock or stock < tonumber(ARGV[2]) then
        return 0
    end

    redis.call("DECRBY", KEYS[1],tonumber(ARGV[2]))
    local value = ARGV[1] .. ":" ..tostring(ARGV[2]) .. ":" .. ARGV[3] 
    redis.call("SET", KEYS[2] , value)
    redis.call("SADD", KEYS[3], KEYS[2])  
    redis.call("ZADD", KEYS[4],ARGV[4],KEYS[2])
    return 1
`;

export const claimScript :string = `
    if redis.call("EXISTS", KEYS[1]) == 1 then 
    redis.call("DEL", KEYS[1]) 
    redis.call("SREM", KEYS[2], KEYS[1]) 
    redis.call("ZREM", KEYS[3], KEYS[1]) 
    return 1
    end 
    return 0;
`;
 
export const sweepScript : string = `
    local data = redis.call("GET", KEYS[1])
    if not data then 
        return 0
    end
    redis.call("INCRBY", KEYS[2],ARGV[1])
    redis.call("DEL", KEYS[1])
    redis.call("SREM", KEYS[3], KEYS[1])
    redis.call("ZREM", KEYS[4], KEYS[1])
    return 1
`