import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all locations
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("locations")
      .select(`
        id,
        name,
        short_code,
        warehouse_id,
        created_at,
        updated_at,
        warehouses (
          id,
          name,
          short_code
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch locations",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Locations fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET single location
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("locations")
      .select(`
        id,
        name,
        short_code,
        warehouse_id,
        created_at,
        updated_at,
        warehouses (
          id,
          name,
          short_code
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Location fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE location
router.post("/", async (req, res) => {
  try {
    const {
      name,
      shortCode,
      warehouseId,
    } = req.body;

    if (!name || !shortCode || !warehouseId) {
      return res.status(400).json({
        success: false,
        message: "Location name, short code and warehouse are required",
      });
    }

    // Verify warehouse exists
    const { data: warehouse, error: warehouseError } = await supabase
      .from("warehouses")
      .select("id")
      .eq("id", warehouseId)
      .single();

    if (warehouseError || !warehouse) {
      return res.status(400).json({
        success: false,
        message: "Warehouse not found",
      });
    }

    const { data, error } = await supabase
      .from("locations")
      .insert({
        name,
        short_code: shortCode,
        warehouse_id: warehouseId,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to create location",
        error: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Location created successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// UPDATE location
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      shortCode,
      warehouseId,
    } = req.body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (shortCode !== undefined) {
      updateData.short_code = shortCode;
    }

    if (warehouseId !== undefined) {
      updateData.warehouse_id = warehouseId;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided for update",
      });
    }

    const { data, error } = await supabase
      .from("locations")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to update location",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Location updated successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// DELETE location
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("locations")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to delete location",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;