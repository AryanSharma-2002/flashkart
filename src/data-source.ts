import "reflect-metadata";
import { DataSource } from "typeorm";
import {User, Product, Cart, CartItem, Order, OrderItem} from "./entities";

export const AppDataSource: DataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/stockapp",
    entities: [User, Product, Cart, CartItem, Order, OrderItem],
    synchronize: true,
    logging: false,
});
export async function initDb(): Promise<void> {
    try{
        await AppDataSource.initialize();
        console.log("Database connected");
        const productRepo = AppDataSource.getRepository(Product);
        const allProducts = await productRepo.find();
        if (allProducts.length === 0){
            await productRepo.save({
                name: "Laptop",
                price: "1000",
                totalStock: 100,
                availableStock: 100,
            })
        }
    }catch(err){
        console.error(err);
        throw err;
    }
}


export { User, Product, Cart, CartItem, Order, OrderItem, OrderStatus } from "./entities";