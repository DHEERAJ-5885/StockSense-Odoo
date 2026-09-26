import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, sku")
      .limit(5);

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Supabase connection failed",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "StockSense API and Supabase are connected",
      api: "StockSense Inventory API",
      technology: ["Node.js", "Express", "TypeScript", "Supabase"],
      database: "Supabase",
      productsConnection: true,
      products: data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;
