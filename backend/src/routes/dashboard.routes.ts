import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const [
      productsResult,
      stockResult,
      receiptsResult,
      deliveriesResult,
      transfersResult,
      ledgerResult,
    ] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),

      supabase
        .from("stock")
        .select("product_id, quantity, location_id"),

      supabase
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .neq("status", "Done")
        .neq("status", "Canceled"),

      supabase
        .from("deliveries")
        .select("id", { count: "exact", head: true })
        .neq("status", "Done")
        .neq("status", "Canceled"),

      supabase
        .from("internal_transfers")
        .select("id", { count: "exact", head: true })
        .neq("status", "Done")
        .neq("status", "Canceled"),

      supabase
        .from("stock_ledger")
        .select(`
          id,
          reference,
          product_id,
          operation_type,
          quantity,
          direction,
          created_at
        `)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    if (productsResult.error) throw productsResult.error;
    if (stockResult.error) throw stockResult.error;
    if (receiptsResult.error) throw receiptsResult.error;
    if (deliveriesResult.error) throw deliveriesResult.error;
    if (transfersResult.error) throw transfersResult.error;
    if (ledgerResult.error) throw ledgerResult.error;

    const stock = stockResult.data || [];

    const totalStock = stock.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const productQuantities = new Map<string, number>();

    for (const item of stock) {
      const current = productQuantities.get(item.product_id) || 0;
      productQuantities.set(
        item.product_id,
        current + Number(item.quantity || 0)
      );
    }

    const lowStockProducts = [...productQuantities.values()].filter(
      (quantity) => quantity > 0 && quantity <= 10
    ).length;

    const outOfStockProducts = [...productQuantities.values()].filter(
      (quantity) => quantity <= 0
    ).length;

    return res.json({
      success: true,
      message: "Dashboard data fetched successfully",
      data: {
        totalProducts: productsResult.count || 0,
        totalStock,
        lowStockProducts,
        outOfStockProducts,
        lowOrOutOfStock: lowStockProducts + outOfStockProducts,
        pendingReceipts: receiptsResult.count || 0,
        pendingDeliveries: deliveriesResult.count || 0,
        internalTransfersScheduled: transfersResult.count || 0,
        recentMovements: ledgerResult.data || [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
      error: error?.message || "Unknown error",
    });
  }
});

export default router;