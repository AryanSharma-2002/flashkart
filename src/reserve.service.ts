import { Router } from "express";
import { randomUUID } from "crypto";
import {AppDataSource, Product} from "./data-source";
import {redis, reserveScript, expiredZset, RESERVE_TTL_SECONDS} from './redis';
export const reserveRouter:Router = Router();

reserveRouter.post("/" , async (req,res)=>{
    const userId = Number(req.body.userId);
    const productId = Number(req.body.productId);
    const quantity = Number(req.body.quantity);
    if(!isPositiveInt(userId) || !isPositiveInt(productId) || !isPositiveInt(quantity)){
        return res.status(400).json({error: "INVALID_INPUT", message: "userId, productId and quantity must be positive integers"});
    }
    const productRepo = AppDataSource.getRepository(Product);
    const product = await productRepo.findOne({where: { id: productId }});
    if(!product){
        return res.status(404).json({error: "PRODUCT_NOT_FOUND"});
    }
    const stockKey = "stock:product:" + productId;
    await redis.set(stockKey, String(product.availableStock), "NX");

    const reservationId = randomUUID();
    const reserveKey = "reserve:" + reservationId;
    const cartKey = "cart:user:" + userId;
    const expiresAt = Date.now() +RESERVE_TTL_SECONDS*1000;
    const ok = (await redis.eval(
        reserveScript,
        4,
        stockKey,
        reserveKey,
        cartKey,
        expiredZset,
        String(userId),
        String(quantity),
        String(productId),
        String(expiresAt)
    )) as number;
    if(ok !== 1){
        return res.status(409).json({error: "INSUFFICIENT_STOCK"});
    }
    res.status(200).json({status: "success", reservationId, productId, quantity, expiresAt});
});

function isPositiveInt(n: number): boolean {
    return Number.isInteger(n) && n > 0;
}
