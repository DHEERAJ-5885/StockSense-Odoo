import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all warehouses
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("warehouses")
      .select(`
        id,
        name,
        short_code,
        address,
        created_at,
        updated_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch warehouses",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Warehouses fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET single warehouse
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("warehouses")
      .select(`
        id,
        name,
        short_code,
        address,
        created_at,
        updated_at
      `)
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Warehouse not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Warehouse fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE warehouse
router.post("/", async (req, res) => {
  try {
    const { name, shortCode, address } = req.body;

    if (!name || !shortCode) {
      return res.status(400).json({
        success: false,
        message: "Warehouse name and short code are required",
      });
    }

    const { data, error } = await supabase
      .from("warehouses")
      .insert({
        name,
        short_code: shortCode,
        address: address || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to create warehouse",
        error: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Warehouse created successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// UPDATE warehouse
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shortCode, address } = req.body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (shortCode !== undefined) {
      updateData.short_code = shortCode;
    }

    if (address !== undefined) {
      updateData.address = address;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided for update",
      });
    }

    const { data, error } = await supabase
      .from("warehouses")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to update warehouse",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Warehouse updated successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// DELETE warehouse
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("warehouses")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to delete warehouse",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Warehouse deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;