import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// 🔑 Supabase init
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Home
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running!");
});

// Webhook verification
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

// Handle messages
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const phone_number_id = entry?.metadata?.phone_number_id;
    const from = entry?.messages?.[0]?.from;
    const msg_body = entry?.messages?.[0]?.text?.body?.toLowerCase();

    let replyText = "🙏 Hi! You can type:\n- order <product> <qty>\n- status <order_id>";

    if (msg_body?.startsWith("order")) {
      // 🛒 Order create flow
      const parts = msg_body.split(" ");
      const productName = parts[1];
      const qty = parseInt(parts[2]) || 1;

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("*")
        .ilike("name", productName)
        .single();

      if (productError || !product) {
        replyText = `⚠️ Product '${productName}' not found.`;
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
          console.error("❌ Supabase error:", error);
          replyText = "⚠️ Failed to create order.";
        } else {
          replyText = `✅ Order created!\n🆔 ID: ${order.id}\n📦 ${product.name} x${qty}\n💰 Total: ${total}`;
        }
      }
    } else if (msg_body?.startsWith("status")) {
      // 📦 Status check flow
      const parts = msg_body.split(" ");
      const orderId = parts[1];

      const { data: order, error } = await supabase
        .from("orders")
        .select("id, status, total, items")
        .eq("id", orderId)
        .single();

      if (error || !order) {
        replyText = `⚠️ Order '${orderId}' not found.`;
      } else {
        replyText = `📦 Order Status\n🆔 ${order.id}\nStatus: ${order.status}\nTotal: ${order.total}`;
      }
    }

    // ✅ Send reply back to WhatsApp
    const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;
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
