import crypto from "node:crypto";
import { supabase } from "../db/supabase";
import { createPasswordResetService } from "./passwordReset";
import { sendPasswordChangedEmail, sendResetCodeEmail } from "./mailer";

/** The real password-reset service: Supabase for users, Nodemailer for email. */
export const resetService = createPasswordResetService({
  secret: process.env.RESET_SECRET || crypto.randomBytes(32).toString("hex"),

  async lookupUserId(email) {
    const { data, error } = await supabase.rpc("user_id_for_email", { p_email: email });
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  },

  async updatePassword(userId, password) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(error.message);
  },

  sendCode: sendResetCodeEmail,
  sendChanged: sendPasswordChangedEmail,
});
