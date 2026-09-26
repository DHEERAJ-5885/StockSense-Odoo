import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import receiptRoutes from "./routes/receipt.routes";
import deliveryRoutes from "./routes/delivery.routes";
import transferRoutes from "./routes/transfer.routes";
import adjustmentRoutes from "./routes/adjustment.routes";
import ledgerRoutes from "./routes/ledger.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import warehouseRoutes from "./routes/warehouse.routes";
import locationRoutes from "./routes/location.routes";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/deliveries", deliveryRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/adjustments", adjustmentRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/locations", locationRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`StockSense backend running on http://localhost:${PORT}`);
});