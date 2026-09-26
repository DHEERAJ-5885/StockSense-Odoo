import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

// GET all products
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        name,
        sku,
        unit_of_measure,
        initial_stock,
        category_id,
        categories (
          id,
          name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch products",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Products fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// GET single product
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        name,
        sku,
        unit_of_measure,
        initial_stock,
        category_id,
        categories (
          id,
          name
        )
      `)
      .eq("id", id)
      .single();

    if (error) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Product fetched successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// CREATE product
router.post("/", async (req, res) => {
  try {
    const {
      name,
      sku,
      categoryId,
      unitOfMeasure,
      initialStock = 0,
    } = req.body;

    if (!name || !sku || !unitOfMeasure) {
      return res.status(400).json({
        success: false,
        message: "Name, SKU and unit of measure are required",
      });
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        sku,
        category_id: categoryId || null,
        unit_of_measure: unitOfMeasure,
        initial_stock: Number(initialStock) || 0,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to create product",
        error: error.message,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// UPDATE product
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      sku,
      categoryId,
      unitOfMeasure,
      initialStock,
    } = req.body;

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (sku !== undefined) updateData.sku = sku;
    if (categoryId !== undefined) updateData.category_id = categoryId;
    if (unitOfMeasure !== undefined) {
      updateData.unit_of_measure = unitOfMeasure;
    }
    if (initialStock !== undefined) {
      updateData.initial_stock = Number(initialStock);
    }

    const { data, error } = await supabase
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to update product",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Product updated successfully",
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

// DELETE product
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Failed to delete product",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unexpected server error",
    });
  }
});

export default router;