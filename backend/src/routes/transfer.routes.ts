import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all internal transfers
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("internal_transfers")
      .select(`
        id,
        reference,
        warehouse_id,
        scheduled_date,
        status,
        created_at,
        internal_transfer_items (
          id,
          product_id,
          source_location_id,
          destination_location_id,
          quantity
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch internal transfers",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Internal transfers fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET single transfer
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("internal_transfers")
      .select(`
        id,
        reference,
        warehouse_id,
        scheduled_date,
        status,
        created_at,
        internal_transfer_items (
          id,
          product_id,
          source_location_id,
          destination_location_id,
          quantity
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Internal transfer not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Internal transfer fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE internal transfer
router.post("/", async (req, res) => {
  try {
    const {
      warehouseId,
      scheduledDate,
      createdBy,
      items,
    } = req.body;

    if (!warehouseId || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: "Warehouse and scheduled date are required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one transfer item is required",
      });
    }

    const reference = `WH/INT/${Date.now()}`;

    const { data: transfer, error: transferError } = await supabase
      .from("internal_transfers")
      .insert({
        reference,
        warehouse_id: warehouseId,
        scheduled_date: scheduledDate,
        status: "Draft",
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (transferError) {
      return res.status(400).json({
        success: false,
        message: "Failed to create internal transfer",
        error: transferError.message,
      });
    }

    const transferItems = items.map((item: any) => ({
      transfer_id: transfer.id,
      product_id: item.productId,
      source_location_id: item.sourceLocationId,
      destination_location_id: item.destinationLocationId,
      quantity: Number(item.quantity),
    }));

    const { error: itemsError } = await supabase
      .from("internal_transfer_items")
      .insert(transferItems);

    if (itemsError) {
      await supabase
        .from("internal_transfers")
        .delete()
        .eq("id", transfer.id);

      return res.status(400).json({
        success: false,
        message: "Failed to create transfer items",
        error: itemsError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Internal transfer created successfully",
      data: {
        ...transfer,
        items: transferItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// VALIDATE / CONFIRM transfer
router.post("/:id/confirm", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: transfer, error: findError } = await supabase
      .from("internal_transfers")
      .select("id, reference, status")
      .eq("id", id)
      .single();

    if (findError || !transfer) {
      return res.status(404).json({
        success: false,
        message: "Internal transfer not found",
      });
    }

    if (transfer.status === "Done") {
      return res.status(400).json({
        success: false,
        message: "Internal transfer is already completed",
      });
    }

    const { error: rpcError } = await supabase.rpc(
      "validate_internal_transfer",
      {
        p_transfer_id: id,
      }
    );

    if (rpcError) {
      return res.status(400).json({
        success: false,
        message: "Internal transfer validation failed",
        error: rpcError.message,
      });
    }

    const { data: updatedTransfer } = await supabase
      .from("internal_transfers")
      .select(`
        id,
        reference,
        warehouse_id,
        scheduled_date,
        status,
        created_at
      `)
      .eq("id", id)
      .single();

    return res.json({
      success: true,
      message: "Internal transfer completed successfully",
      data: updatedTransfer,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;