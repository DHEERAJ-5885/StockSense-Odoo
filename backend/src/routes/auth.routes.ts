import { Router } from "express";
import { supabase } from "../db/supabase";

const router = Router();

function isValidLoginId(loginId: string) {
  return /^[A-Za-z0-9]{6,12}$/.test(loginId);
}

function isValidPassword(password: string) {
  return (
    password.length > 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

/**
 * SIGNUP
 */
router.post("/signup", async (req, res) => {
  try {
    const {
      loginId,
      fullName,
      email,
      password,
      role = "staff",
    } = req.body;

    const cleanLoginId = String(loginId || "").trim();
    const cleanName = String(fullName || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!isValidLoginId(cleanLoginId)) {
      return res.status(400).json({
        success: false,
        message: "Login ID must be 6-12 letters or numbers.",
      });
    }

    if (!cleanName) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be more than 8 characters and contain lowercase, uppercase and special characters.",
      });
    }

    if (!["admin", "manager", "staff"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role.",
      });
    }

    // Check whether Login ID already exists in profiles.
    const { data: existingLogin, error: loginCheckError } = await supabase
      .from("profiles")
      .select("id, login_id")
      .ilike("login_id", cleanLoginId)
      .maybeSingle();

    if (loginCheckError) {
      console.error("Signup Login ID lookup error:", loginCheckError);

      return res.status(500).json({
        success: false,
        message: "Database error checking Login ID",
      });
    }

    if (existingLogin) {
      return res.status(409).json({
        success: false,
        message: "That Login ID is already taken.",
      });
    }

    // Create the Supabase Auth user.
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          login_id: cleanLoginId,
          full_name: cleanName,
          role,
        },
      });

    if (authError || !authData.user) {
      console.error("Signup Auth error:", authError);

      return res.status(400).json({
        success: false,
        message: authError?.message || "Unable to create account",
      });
    }

    // Create/update the existing profile row.
    // login_id is now stored in the profiles table.
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: authData.user.id,
        login_id: cleanLoginId,
        full_name: cleanName,
        role,
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);

      // Remove Auth user if profile creation failed.
      await supabase.auth.admin.deleteUser(authData.user.id);

      return res.status(500).json({
        success: false,
        message: "Account profile could not be created.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      data: {
        user: {
          userId: authData.user.id,
          loginId: cleanLoginId,
          fullName: cleanName,
          email: cleanEmail,
          role,
        },
      },
    });
  } catch (error) {
    console.error("Signup unexpected error:", error);

    return res.status(500).json({
      success: false,
      message: "Signup failed",
    });
  }
});

/**
 * LOGIN
 */
router.post("/login", async (req, res) => {
  try {
    const { loginId, password } = req.body;

    const cleanLoginId = String(loginId || "").trim();

    if (!cleanLoginId || !password) {
      return res.status(400).json({
        success: false,
        message: "Login ID and password are required.",
      });
    }

    // Find the profile using the database Login ID.
    const { data: profile, error: profileLookupError } = await supabase
      .from("profiles")
      .select("id, login_id, full_name, role")
      .ilike("login_id", cleanLoginId)
      .maybeSingle();

    if (profileLookupError) {
      console.error("Login profile lookup error:", profileLookupError);

      return res.status(500).json({
        success: false,
        message: "Database error finding account",
      });
    }

    if (!profile) {
      return res.status(401).json({
        success: false,
        message: "Invalid Login ID or Password",
      });
    }

    // Get the corresponding Supabase Auth user directly by ID.
    // This avoids the failing admin.listUsers() call.
    const { data: authUserData, error: authUserError } =
      await supabase.auth.admin.getUserById(profile.id);

    if (authUserError || !authUserData.user) {
      console.error("Login Auth user lookup error:", authUserError);

      return res.status(401).json({
        success: false,
        message: "Invalid Login ID or Password",
      });
    }

    const authUser = authUserData.user;

    if (!authUser.email) {
      return res.status(401).json({
        success: false,
        message: "Invalid Login ID or Password",
      });
    }

    // Authenticate using the actual email + password.
    const { data: loginData, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: authUser.email,
        password,
      });

    if (loginError || !loginData.user) {
      return res.status(401).json({
        success: false,
        message: "Invalid Login ID or Password",
      });
    }

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          userId: loginData.user.id,
          loginId: profile.login_id || cleanLoginId,
          fullName:
            profile.full_name ||
            authUser.user_metadata?.full_name ||
            "",
          email: loginData.user.email,
          role:
            profile.role ||
            authUser.user_metadata?.role ||
            "staff",
          accessToken: loginData.session?.access_token || null,
          refreshToken: loginData.session?.refresh_token || null,
        },
      },
    });
  } catch (error) {
    console.error("Login unexpected error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

/**
 * FORGOT PASSWORD
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const { error } =
      await supabase.auth.resetPasswordForEmail(cleanEmail);

    if (error) {
      console.error("Forgot password error:", error);

      return res.status(400).json({
        success: false,
        message: error.message || "Unable to send reset email",
      });
    }

    return res.json({
      success: true,
      message: "Password reset email sent successfully.",
    });
  } catch (error) {
    console.error("Forgot password unexpected error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send reset email",
    });
  }
});

export default router;