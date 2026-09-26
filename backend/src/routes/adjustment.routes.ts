import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all adjustments
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inventory_adjustments")
      .select(`
        id,
        reference,
        warehouse_id,
        location_id,
        status,
        created_at,
        inventory_adjustment_items (
          id,
          product_id,
          recorded_quantity,
          counted_quantity,
          difference
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch adjustments",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Adjustments fetched successfully",
      data,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET adjustment by ID
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("inventory_adjustments")
      .select(`
        id,
        reference,
        warehouse_id,
        location_id,
        status,
        created_at,
        inventory_adjustment_items (
          id,
          product_id,
          recorded_quantity,
          counted_quantity,
          difference
        )
      `)
      .eq("id", req.params.id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Adjustment fetched successfully",
      data,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE adjustment
router.post("/", async (req, res) => {
  try {
    const {
      warehouseId,
      locationId,
      scheduledDate,
      createdBy,
      items,
    } = req.body;

    if (!warehouseId || !locationId) {
      return res.status(400).json({
        success: false,
        message: "Warehouse and location are required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one adjustment item is required",
      });
    }

    const reference = `WH/ADJ/${Date.now()}`;

    const { data: adjustment, error: adjustmentError } =
      await supabase
        .from("inventory_adjustments")
        .insert({
          reference,
          warehouse_id: warehouseId,
          location_id: locationId,
          status: "Draft",
          created_by: createdBy || null,
        })
        .select()
        .single();

    if (adjustmentError) {
      return res.status(400).json({
        success: false,
        message: "Failed to create adjustment",
        error: adjustmentError.message,
      });
    }

    const adjustmentItems = items.map((item: any) => ({
      adjustment_id: adjustment.id,
      product_id: item.productId,
      recorded_quantity: Number(item.recordedQuantity),
      counted_quantity: Number(item.countedQuantity),
      difference:
        Number(item.countedQuantity) - Number(item.recordedQuantity),
    }));

    const { error: itemsError } = await supabase
      .from("inventory_adjustment_items")
      .insert(adjustmentItems);

    if (itemsError) {
      await supabase
        .from("inventory_adjustments")
        .delete()
        .eq("id", adjustment.id);

      return res.status(400).json({
        success: false,
        message: "Failed to create adjustment items",
        error: itemsError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Stock adjustment created successfully",
      data: {
        ...adjustment,
        items: adjustmentItems,
      },
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CONFIRM adjustment
router.post("/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: adjustment, error } = await supabase
      .from("inventory_adjustments")
      .select("id, status")
      .eq("id", id)
      .single();

    if (error || !adjustment) {
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    if (adjustment.status === "Done") {
      return res.status(400).json({
        success: false,
        message: "Adjustment is already completed",
      });
    }

    const { error: rpcError } = await supabase.rpc(
      "validate_inventory_adjustment",
      {
        p_adjustment_id: id,
      }
    );

    if (rpcError) {
      return res.status(400).json({
        success: false,
        message: "Adjustment validation failed",
        error: rpcError.message,
      });
    }

    const { data: updated } = await supabase
      .from("inventory_adjustments")
      .select(`
        id,
        reference,
        warehouse_id,
        location_id,
        status,
        created_at
      `)
      .eq("id", id)
      .single();

    return res.json({
      success: true,
      message: "Stock adjustment completed successfully",
      data: updated,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;