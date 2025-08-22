import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// 🔑 Supabase client init
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Home route
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running!");
});

// Webhook verification (Facebook callback)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified ✅");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const phone_number_id = entry?.metadata?.phone_number_id;
    const from = entry?.messages?.[0]?.from; // User phone number
    const msg_body = entry?.messages?.[0]?.text?.body;

    if (msg_body && from) {
      console.log(`📩 Message from ${from}: ${msg_body}`);

      // 1. Save message as order in Supabase
      const { data, error } = await supabase
        .from("orders")
        .insert([
          {
            channel: "whatsapp",
            status: "pending",
            payment: "unknown",
            customer_phone: from,
            customer_name: null, // TODO: पुढे विचारायचं
            delivery_address: null,
            notes: msg_body, // WhatsApp text as notes
            shop_id: null,   // TODO: nearest shop mapping
          },
        ])
        .select();

      if (error) {
        console.error("❌ Error saving to Supabase:", error);
      } else {
        console.log("✅ Order saved in Supabase:", data);
      }

      // 2. Reply back to user
      const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: `You said: ${msg_body}` },
        }),
      });

      const respData = await response.json();
      console.log("Message sent ✅:", respData);
    }
  } catch (err) {
    console.error("❌ Error handling webhook:", err);
  }

  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`);
});
