import { Router } from "express";
import {AppDataSource, Product,Order, OrderItem, OrderStatus} from "./data-source";
import {redis, claimScript, expiredZset} from './redis';
export const checkoutRouter:Router = Router();

checkoutRouter.post("/" , async (req,res) => {
    const userId = Number(req.body.userId);
    const idempotencyKey = typeof req.body.idempotencyKey === "string" ? req.body.idempotencyKey.trim() : "";
    if(!Number.isInteger(userId) || userId <= 0 || !idempotencyKey){
        return res.status(400).json({error: "INVALID_INPUT", message: "userId and idempotencyKey are required"});
    }
    const orderRepo = AppDataSource.getRepository(Order);
    const existing = await orderRepo.findOne({where: {idempotencyKey}});
    
    if(existing){
        return res.status(200).json({order: "existing" , replayed: true, status: "success", reservationId: existing.id});
    }

    const cartKey = "cart:user:" + userId;
    const reserveKeys = await redis.smembers(cartKey);
    const claimed: {productId:number, quantity:number}[] = [];
    const now =Date.now();
    for(const key of reserveKeys){
        const scoreRaw = await redis.zscore(expiredZset, key);
        if(scoreRaw===null || Number(scoreRaw) <= now){
            continue;
        }
        const raw = await redis.get(key);
        if(!raw){
            continue;
        }
        const parts = raw?.split(":");
        const qty = Number(parts[1]);
        const productId = Number(parts[2]);
        
        const ok = (await redis.eval(claimScript, 3, key, cartKey, expiredZset)) as number;
        if(ok ===1){
            claimed.push({productId, quantity:qty})
        }
    }
    if (claimed.length === 0){
        return res.status(400).json({error: "NO_ACTIVE_RESERVATION"});
    }
    
    try {
        const savedOrder = await AppDataSource.transaction(async(em)=>{
            let total =0;
            const items: {product: Product, quantity: number}[] = [];

            for(const item of claimed){
                const [updated] = (
                    await em.query(
                        "UPDATE products SET available_stock = available_stock - $1 where id=$2 AND available_stock>=$1 RETURNING id,name,price"
                        , [item.quantity, item.productId])) as [any[], number];

                if(updated.length ===0){
                    throw new Error("OVERSELL");
                }

                const product = new Product();
                product.id = updated[0].id;
                product.name = updated[0].name;
                product.price = String(updated[0].price);
                total += Number(product.price)* item.quantity;
                items.push({product ,quantity:item.quantity});
            } 
            const order = await em.save(
                em.create(Order, {
                    userId,
                    idempotencyKey,
                    status: OrderStatus.PAID,
                    totalAmount: total.toFixed(2)
                })
            );
            const orderItems = items.map((item) => em.create(OrderItem, {
                orderId: order.id,
                productId: item.product.id,
                quantity: item.quantity,
                price: item.product.price
            }));
            await em.save(OrderItem, orderItems);
            return order;
        })
        res.json({order: savedOrder, replayed: false});
   
    } catch (err) {
        console.error("checkout_error", err);
        const driverError = (err as any).driverError ?? err;
        const code = driverError? driverError.code: undefined;
        const detail = String(driverError?.detail ?? err);
        const duplicateOrder = code === '23505' && detail.includes('idempotency_key');
        
        for(const item of claimed){
            await redis.incrby(`stock:product:${item.productId}`, item.quantity);
        }
        if(duplicateOrder){
            const replay = await AppDataSource.getRepository(Order).findOne({where: {idempotencyKey}});
            if(replay){
                return res.json({order: replay, replayed: true});
            }
        }
        res.status(500).json({error: "CHECKOUT_FAILED"});
    }
})
