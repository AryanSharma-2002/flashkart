import {redis, sweepScript, expiredZset} from './redis';

export function startSweeper(): void{
    const delay = 1000;
    setInterval(async()=>{
        try{
            const now = Date.now();
            const expiredKeys = await redis.zrangebyscore(expiredZset, 0 , now);
            for(const key of expiredKeys){
                const raw = await redis.get(key);
                if(!raw){
                    await redis.zrem(expiredZset, key);
                    continue;
                }
                const parts = raw.split(":");
                const userId = Number(parts[0]);
                const quantity = Number(parts[1]);
                const productId = Number(parts[2]);
                const ok = (await redis.eval(
                    sweepScript,
                    4,
                    key,
                    `stock:product:${productId}`,
                    `cart:user:${userId}`,
                    expiredZset,
                    String(quantity)
                )) as number;
                if(ok !== 1){
                    await redis.zrem(expiredZset, key);
                }
            }
        }catch(err){
            console.error("Sweeper error", err);
        }
    }, delay);
}