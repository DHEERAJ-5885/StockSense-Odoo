import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET stock ledger
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("stock_ledger")
      .select(`
        id,
        reference,
        product_id,
        operation_type,
        warehouse_id,
        from_location_id,
        to_location_id,
        quantity,
        direction,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch stock ledger",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Stock ledger fetched successfully",
      data,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET ledger entry by reference
router.get("/:reference", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("stock_ledger")
      .select(`
        id,
        reference,
        product_id,
        operation_type,
        warehouse_id,
        from_location_id,
        to_location_id,
        quantity,
        direction,
        created_at
      `)
      .eq("reference", req.params.reference);

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch ledger entry",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Ledger entries fetched successfully",
      data,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;