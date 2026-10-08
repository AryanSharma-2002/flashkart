import "reflect-metadata";
import express, { type Request, type Response, type NextFunction } from "express";
import { initDb } from './data-source';
import { startSweeper } from "./sweeper";
import { reserveRouter } from './reserve.service';
import { checkoutRouter } from './checkout.service';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(express.json());
app.use('/cart/reserve', reserveRouter);
app.use('/order/checkout', checkoutRouter);

app.get("/health", (req, res) => {
    res.json({ status: "healthy" })
});

app.use((req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error("unhandled_error", err);
    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ error: "INVALID_JSON" });
    }
    res.status(500).json({ error: "INTERNAL_ERROR" });
});

(async () => {
    await initDb();
    startSweeper();
    app.listen(PORT, () => {
        console.log(`server is running on port ${PORT}`);
    });
})().catch((err) => {
    console.error("startup_error", err);
    process.exit(1);
});

