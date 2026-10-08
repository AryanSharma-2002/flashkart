# FlashKart - flash sale backend

Node + TypeScript + TypeORM + Postgres + Redis.

## Run

Need Postgres and Redis running locally.

```
npm install
npm start
```

Runs on port 4000. On first start it creates the tables and adds one product (Laptop, id 1, stock 100).

Env vars (all optional):
- `DATABASE_URL` default `postgres://postgres:postgres@localhost:5432/stockapp`
- `REDIS_URL` default `redis://localhost:6379`
- `RESERVE_TTL_SECONDS` default 300 (5 min)
- `PORT` default 4000

## APIs

**POST /cart/reserve** - hold stock for 5 min

```
curl -X POST localhost:4000/cart/reserve -H 'Content-Type: application/json' \
  -d '{"userId":1,"productId":1,"quantity":2}'
```

- 200 reserved, returns reservationId and expiresAt
- 400 INVALID_INPUT (missing, negative or decimal values)
- 404 PRODUCT_NOT_FOUND
- 409 INSUFFICIENT_STOCK

**POST /order/checkout** - turn the user's reservations into an order

```
curl -X POST localhost:4000/order/checkout -H 'Content-Type: application/json' \
  -d '{"userId":1,"idempotencyKey":"order-001"}'
```

- 200 order created (`replayed: false`)
- 200 same key sent again, no new order (`replayed: true`)
- 400 NO_ACTIVE_RESERVATION (nothing reserved, or it expired)
- 500 CHECKOUT_FAILED (stock is given back)

## A1. Database design

Tables: users, products, carts, cart_items, orders, order_items.

- user has one cart and many orders
- cart has many cart_items, order has many order_items
- every table has created_at, most have updated_at
- indexes: unique users.email, unique carts.user_id, unique (cart_id, product_id), orders.user_id, order_items.order_id
- orders.idempotency_key is unique, this is what stops duplicate orders
- order_items stores the price at the time of order

Assumptions:
- no login in this task, userId comes in the body
- the live cart / reservation is kept in Redis because it is fast and expires by itself. carts and cart_items are the saved version
- orders.user_id has no foreign key so testing works with any userId

## A2. How reserve stops overselling

Stock is kept in Redis as `stock:product:{id}`.

The check and the decrease happen inside one Lua script. Redis runs one script at a time, so no other request can run in between "is there enough stock?" and "take it". Two users can never both take the last item.

The script also saves the reservation, adds it to the user's cart and records the expiry time, all in the same step.

The first time a product is used, its stock is copied from Postgres using `SET ... NX`. NX means set only if the key does not exist, so two first requests can't overwrite each other.

Tested with 150 parallel requests for 98 items. 98 got it, 52 got 409, stock ended at 0.

## A3. Checkout and rollback

1. If an order already exists with this idempotencyKey, return it. Done.
2. Get the user's reservations from Redis, skip expired ones.
3. Claim each one with a Lua script (delete it only if it still exists). So the sweeper and checkout can't both use the same reservation.
4. In one TypeORM transaction:
   - `UPDATE products SET available_stock = available_stock - qty WHERE id = ? AND available_stock >= qty`
   - if no row updated, throw (this is a second guard against overselling)
   - save the order and order items
5. Return the order.

Rollback: if anything in step 4 fails, Postgres rolls back the whole transaction, so no half order is saved. Then we add the quantity back to Redis stock so others can buy it.

## B. Redis keys

| Key | Type | What |
|---|---|---|
| `stock:product:{id}` | string | stock left to reserve |
| `reserve:{reservationId}` | string | `userId:qty:productId` |
| `cart:user:{userId}` | set | user's reservation keys |
| `expired:reserve` | sorted set | reservation key, score = expiry time |

Expiry: a sweeper runs every second. It picks reservations whose time is up and gives the stock back with a Lua script (only if the reservation still exists, so it never gives back stock that was already checked out). It is safe to run on many servers at once.

Invalidation: if an admin changes stock in Postgres, delete `stock:product:{id}` and the next request reloads it.

Product cache (not built, would add): `product:{id}` with a TTL of around 60s, so reserve doesn't hit Postgres every time. Delete it when the product is updated.

## C. Scaling to 10k req/sec

```
            clients
               |
         load balancer
        /      |      \
    node-1  node-2  node-3   (no state, add more when needed)
        \      |      /
     Redis              Postgres
 (stock, holds,      (orders, products,
  expiry)             source of truth)
```

- Node servers keep no state, so we can add more behind the load balancer
- Redis takes the heavy traffic. Most reserve requests are a single Lua call in memory
- Postgres only gets real checkouts, and each one is a short transaction
- Redis decides who gets to reserve. Postgres keeps the final record and double checks stock
- DB side: connection pool, indexes above, read replicas for product reads, migrations instead of `synchronize: true` in prod
- If one Redis is not enough, use Redis Cluster. All keys for one product live in one slot

## D1. Stock 100, orders 120

Cause: code that reads stock and then updates it in two steps. 120 requests all read "stock left" before any of them updates it, so all of them pass.

Fix:
- check and decrease in one Lua script in Redis (atomic)
- in Postgres use `UPDATE ... WHERE available_stock >= qty`, so the DB itself refuses to go below 0
- copy stock into Redis with `SET NX` so it doesn't get reset

## D2. Refresh makes 2 orders

The client sends the same idempotencyKey on refresh (made once per payment page).

- checkout first looks up the key. If found, it returns the old order
- if two requests come at the exact same time, the unique index on idempotency_key lets only one insert. The other gets a duplicate key error and we return the existing order
- reservations are also claimed only once, so the second request has nothing to buy

## Known gaps

- if the server crashes after claiming a reservation but before the DB commit, that stock is lost in Redis. This means selling less, not overselling. Fix: a job that resyncs Redis stock from Postgres
- payment is skipped, orders go straight to PAID
