import {
    Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
    ManyToOne, OneToMany, OneToOne, JoinColumn, Index,
} from "typeorm";

export enum OrderStatus {
    CREATED = "CREATED",
    PAID = "PAID",
    FAILED = "FAILED",
}

export enum CartStatus {
    ACTIVE = "ACTIVE",
    CHECKED_OUT = "CHECKED_OUT",
}

@Entity("users")
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column("varchar")
    email: string;

    @Column("varchar")
    name: string;

    @OneToOne(() => Cart, (cart) => cart.user)
    cart: Cart;

    @OneToMany(() => Order, (order) => order.user)
    orders: Order[];

    @CreateDateColumn({ name: "created_at" })
    createdAt: Date;

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt: Date;
}

@Entity("products")
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column("varchar")
    name: string;

    @Column({ type: "decimal", precision: 19, scale: 2 })
    price: string;

    @Column({ name: "total_stock", type: "integer" })
    totalStock: number;

    @Column({ name: "available_stock", type: "integer" })
    availableStock: number;

    @CreateDateColumn({ name: "created_at" })
    createdAt: Date;

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt: Date;
}

@Entity("carts")
export class Cart {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column({ name: "user_id", type: "integer" })
    userId: number;

    @OneToOne(() => User, (user) => user.cart)
    @JoinColumn({ name: "user_id" })
    user: User;

    @Column("enum", { enum: CartStatus, default: CartStatus.ACTIVE })
    status: CartStatus;

    @OneToMany(() => CartItem, (item) => item.cart)
    items: CartItem[];

    @CreateDateColumn({ name: "created_at" })
    createdAt: Date;

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt: Date;
}

@Entity("cart_items")
@Index(["cartId", "productId"], { unique: true })
export class CartItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: "cart_id", type: "integer" })
    cartId: number;

    @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "cart_id" })
    cart: Cart;

    @Column({ name: "product_id", type: "integer" })
    productId: number;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column({ type: "integer" })
    quantity: number;

    @Column({ name: "reserved_until", type: "timestamp" })
    reservedUntil: Date;

    @CreateDateColumn({ name: "created_at" })
    createdAt: Date;
}

@Entity("orders")
export class Order {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Index()
    @Column({ name: "user_id", type: "integer" })
    userId: number;

    @ManyToOne(() => User, (user) => user.orders, { createForeignKeyConstraints: false })
    @JoinColumn({ name: "user_id" })
    user: User;

    @Column({ name: "idempotency_key", type: "varchar", unique: true })
    idempotencyKey: string;

    @Column("enum", { enum: OrderStatus, name: "order_status" })
    status: OrderStatus;

    @Column({ name: "total_amount", type: "decimal", precision: 12, scale: 2 })
    totalAmount: string;

    @OneToMany(() => OrderItem, (item) => item.order)
    items: OrderItem[];

    @CreateDateColumn({ name: "created_at" })
    createdAt: Date;

    @UpdateDateColumn({ name: "updated_at" })
    updatedAt: Date;
}

@Entity("order_items")
export class OrderItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: "order_id", type: "uuid" })
    orderId: string;

    @ManyToOne(() => Order, (order) => order.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "order_id" })
    order: Order;

    @Column({ name: "product_id", type: "integer" })
    productId: number;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column({ type: "integer" })
    quantity: number;

    @Column({ type: "decimal", precision: 10, scale: 2 })
    price: string;
}
