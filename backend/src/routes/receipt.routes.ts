import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all receipts
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("receipts")
      .select(`
        id,
        reference,
        supplier,
        warehouse_id,
        scheduled_date,
        status,
        created_at,
        receipt_items (
          id,
          product_id,
          location_id,
          quantity,
          unit
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch receipts",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Receipts fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET single receipt
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("receipts")
      .select(`
        id,
        reference,
        supplier,
        warehouse_id,
        scheduled_date,
        status,
        created_at,
        receipt_items (
          id,
          product_id,
          location_id,
          quantity,
          unit
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Receipt fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE receipt
router.post("/", async (req, res) => {
  try {
    const {
      supplier,
      warehouseId,
      scheduledDate,
      createdBy,
      items,
    } = req.body;

    if (!supplier || !warehouseId || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: "Supplier, warehouse and scheduled date are required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one receipt item is required",
      });
    }

    // Generate reference
    const reference = `WH/IN/${Date.now()}`;

    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .insert({
        reference,
        supplier,
        warehouse_id: warehouseId,
        scheduled_date: scheduledDate,
        status: "Draft",
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (receiptError) {
      return res.status(400).json({
        success: false,
        message: "Failed to create receipt",
        error: receiptError.message,
      });
    }

    const receiptItems = items.map((item: any) => ({
      receipt_id: receipt.id,
      product_id: item.productId,
      location_id: item.locationId,
      quantity: Number(item.quantity),
      unit: item.unit || "units",
    }));

    const { error: itemsError } = await supabase
      .from("receipt_items")
      .insert(receiptItems);

    if (itemsError) {
      // Remove header if item insertion fails
      await supabase
        .from("receipts")
        .delete()
        .eq("id", receipt.id);

      return res.status(400).json({
        success: false,
        message: "Failed to create receipt items",
        error: itemsError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Receipt created successfully",
      data: {
        ...receipt,
        items: receiptItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// VALIDATE receipt
router.post("/:id/validate", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: receipt, error: findError } = await supabase
      .from("receipts")
      .select("id, reference, status")
      .eq("id", id)
      .single();

    if (findError || !receipt) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    if (receipt.status === "Done") {
      return res.status(400).json({
        success: false,
        message: "Receipt is already validated",
      });
    }

    const { error: rpcError } = await supabase.rpc(
      "validate_receipt",
      {
        p_receipt_id: receipt.id,
      }
    );

    if (rpcError) {
      return res.status(400).json({
        success: false,
        message: "Receipt validation failed",
        error: rpcError.message,
      });
    }

    const { data: updatedReceipt, error: updateError } =
      await supabase
        .from("receipts")
        .select(`
          id,
          reference,
          supplier,
          warehouse_id,
          scheduled_date,
          status,
          created_at
        `)
        .eq("id", id)
        .single();

    if (updateError) {
      return res.json({
        success: true,
        message: "Receipt validated successfully",
        data: {
          id,
          status: "Done",
        },
      });
    }

    return res.json({
      success: true,
      message: "Receipt validated successfully",
      data: updatedReceipt,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;