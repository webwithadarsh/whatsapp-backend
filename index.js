import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// 🔑 Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🏠 Home route
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running with Supabase!");
});

// ✅ Webhook verification
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

// 📩 Handle incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const phone_number_id = entry?.metadata?.phone_number_id;
    const from = entry?.messages?.[0]?.from; // User phone number
    const msg_body = entry?.messages?.[0]?.text?.body?.toLowerCase();

    let replyText = "🙏 Please type a valid command (order <item> <qty> / status <id>)";

    if (msg_body && from) {
      console.log(`📩 Message from ${from}: ${msg_body}`);

      // ---------------------- ORDER FLOW ----------------------
      if (msg_body.startsWith("order")) {
        const parts = msg_body.split(" ");
        const productName = parts[1];
        const qty = parseInt(parts[2]);

        if (!productName || isNaN(qty)) {
          replyText = "⚠️ Usage: order <product> <qty>";
        } else {
          // Check product in Supabase
          const { data: product, error: productError } = await supabase
            .from("products")
            .select("*")
            .ilike("name", productName)
            .single();

          if (productError || !product) {
            replyText = `❌ Product not found: ${productName}`;
          } else {
            const total = product.price * qty;

            const { data: order, error } = await supabase
              .from("orders")
              .insert([
                {
                  customer_number: from,
                  status: "pending",
                  total,
                  items: [
                    {
                      product_id: product.id,
                      quantity: qty,
                      price: product.price,
                    },
                  ],
                },
              ])
              .select()
              .single();

            if (error) {
              console.error("❌ Supabase insert error:", JSON.stringify(error, null, 2));
              replyText = `⚠️ Failed to create order. Error: ${error.message}`;
            } else {
              replyText = `✅ Order created!\n🆔 ID: ${order.id}\n📦 ${product.name} x${qty}\n💰 Total: ${total}`;
            }
          }
        }
      }

      // ---------------------- STATUS FLOW ----------------------
      else if (msg_body.startsWith("status")) {
        const parts = msg_body.split(" ");
        const orderId = parts[1];

        if (!orderId) {
          replyText = "⚠️ Usage: status <order_id>";
        } else {
          const { data: order, error } = await supabase
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();

          if (error || !order) {
            replyText = `❌ Order not found with ID: ${orderId}`;
          } else {
            replyText = `📦 Order Status:\n🆔 ${order.id}\nStatus: ${order.status}\nTotal: ${order.total}`;
          }
        }
      }

      // ---------------------- SEND REPLY ----------------------
      const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;
      console.log("➡️ Sending reply via:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: replyText },
        }),
      });

      const data = await response.json();
      console.log("Message sent ✅:", data);
    }
  } catch (err) {
    console.error("❌ Error handling webhook:", err);
  }

  res.sendStatus(200);
});

// 🚀 Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`);
});
