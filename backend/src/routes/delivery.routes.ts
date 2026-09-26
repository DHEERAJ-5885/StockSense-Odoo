import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all deliveries
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        id,
        reference,
        customer,
        warehouse_id,
        scheduled_date,
        status,
        created_at,
        delivery_items (
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
        message: "Failed to fetch deliveries",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Deliveries fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET single delivery
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("deliveries")
      .select(`
        id,
        reference,
        customer,
        warehouse_id,
        scheduled_date,
        status,
        created_at,
        delivery_items (
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
        message: "Delivery not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Delivery fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE delivery
router.post("/", async (req, res) => {
  try {
    const {
      customer,
      warehouseId,
      scheduledDate,
      createdBy,
      items,
    } = req.body;

    if (!customer || !warehouseId || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: "Customer, warehouse and scheduled date are required",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one delivery item is required",
      });
    }

    const reference = `WH/OUT/${Date.now()}`;

    const { data: delivery, error: deliveryError } = await supabase
      .from("deliveries")
      .insert({
        reference,
        customer,
        warehouse_id: warehouseId,
        scheduled_date: scheduledDate,
        status: "Draft",
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (deliveryError) {
      return res.status(400).json({
        success: false,
        message: "Failed to create delivery",
        error: deliveryError.message,
      });
    }

    const deliveryItems = items.map((item: any) => ({
      delivery_id: delivery.id,
      product_id: item.productId,
      location_id: item.locationId,
      quantity: Number(item.quantity),
      unit: item.unit || "units",
    }));

    const { error: itemsError } = await supabase
      .from("delivery_items")
      .insert(deliveryItems);

    if (itemsError) {
      await supabase
        .from("deliveries")
        .delete()
        .eq("id", delivery.id);

      return res.status(400).json({
        success: false,
        message: "Failed to create delivery items",
        error: itemsError.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Delivery created successfully",
      data: {
        ...delivery,
        items: deliveryItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// VALIDATE delivery
router.post("/:id/validate", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: delivery, error: findError } = await supabase
      .from("deliveries")
      .select("id, reference, status")
      .eq("id", id)
      .single();

    if (findError || !delivery) {
      return res.status(404).json({
        success: false,
        message: "Delivery not found",
      });
    }

    if (delivery.status === "Done") {
      return res.status(400).json({
        success: false,
        message: "Delivery is already validated",
      });
    }

    const { error: rpcError } = await supabase.rpc(
      "validate_delivery",
      {
        p_delivery_id: delivery.id,
      }
    );

    if (rpcError) {
      return res.status(400).json({
        success: false,
        message: "Delivery validation failed",
        error: rpcError.message,
      });
    }

    const { data: updatedDelivery, error: updateError } =
      await supabase
        .from("deliveries")
        .select(`
          id,
          reference,
          customer,
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
        message: "Delivery validated successfully",
        data: {
          id,
          status: "Done",
        },
      });
    }

    return res.json({
      success: true,
      message: "Delivery validated successfully",
      data: updatedDelivery,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;