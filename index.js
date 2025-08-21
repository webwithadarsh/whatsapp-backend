import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import pkg from "@supabase/supabase-js";

const { createClient } = pkg;

const app = express();
app.use(bodyParser.json());

// Supabase connect
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ✅ WhatsApp Verification (GET)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully!");
    res.status(200).send(challenge);
  } else {
    console.error("Webhook verification failed");
    res.sendStatus(403);
  }
});

// ✅ WhatsApp Message Receiver (POST)
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object) {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const message = changes?.value?.messages?.[0];

      if (message) {
        const from = message.from; // sender's phone number
        const text = message.text?.body;

        console.log("📩 Message received:", from, text);

        // Store in Supabase orders table
        const { error } = await supabase.from("orders").insert([
          {
            customer_number: from,
            raw_message: text,
            status: "pending",
          },
        ]);

        if (error) {
          console.error("❌ Supabase insert error:", error.message);
        } else {
          console.log("✅ Order inserted in Supabase");
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error handling webhook:", err.message);
    res.sendStatus(500);
  }
});

// Root check
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Backend is running.");
});

// Run server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
