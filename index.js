import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// Supabase client with SERVICE_ROLE_KEY (for insert/update bypassing RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// FIXED: Default shop UUID (replace with your real shop ID from shops table)
const DEFAULT_SHOP_ID = "60dade83-843f-4ae9-802c-d10dd0ba1d08";

// Home route
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running with Supabase!");
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

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const phone_number_id = entry?.metadata?.phone_number_id;
    const from = entry?.messages?.[0]?.from; // User phone number
    const msg_body = entry?.messages?.[0]?.text?.body?.toLowerCase();

    if (msg_body && from) {
      console.log(`📩 Message from ${from}: ${msg_body}`);

      let reply = "Sorry, I didn’t understand that. Try 'order rice 2' or 'status <order_id>'.";

      // =====================
      // ORDER CREATION FLOW
      // =====================
      if (msg_body.startsWith("order")) {
        const parts = msg_body.split(" ");
        if (parts.length >= 3) {
          const productName = parts[1];
          const qty = parseInt(parts[2]) || 1;

          // Find product
          const { data: product, error: pErr } = await supabase
            .from("products")
            .select("*")
            .eq("shop_id", DEFAULT_SHOP_ID)
            .ilike("name", productName)
            .single();

          if (pErr || !product) {
            reply = `❌ Product '${productName}' not found.`;
          } else {
            // Create order
            const { data: order, error: oErr } = await supabase
              .from("orders")
              .insert([
                {
                  shop_id: DEFAULT_SHOP_ID,
                  channel: "whatsapp",
                  status: "pending",
                  customer_phone: from,
                  customer_name: "WhatsApp User",
                },
              ])
              .select()
              .single();

            if (oErr || !order) {
              console.error("Order creation error:", oErr);
              reply = "❌ Failed to create order.";
            } else {
              // Add order item
              const { error: iErr } = await supabase.from("order_items").insert([
                {
                  order_id: order.id,
                  product_id: product.id,
                  qty,
                  price: product.price,
                },
              ]);

              if (iErr) {
                console.error("Order item error:", iErr);
                reply = "❌ Failed to add items to order.";
              } else {
                reply = `✅ Order Created!\n🆔 Order ID: ${order.id}\n📦 ${product.name} x${qty}\n💰 Total: ₹${product.price * qty}`;
              }
            }
          }
        } else {
          reply = "⚠️ Usage: order <product> <qty>";
        }
      }

      // =====================
      // STATUS CHECK FLOW
      // =====================
      else if (msg_body.startsWith("status")) {
        const parts = msg_body.split(" ");
        if (parts.length >= 2) {
          const orderId = parts[1];
          const { data: order, error: sErr } = await supabase
            .from("orders")
            .select("id,status,total")
            .eq("id", orderId)
            .single();

          if (sErr || !order) {
            reply = `❌ Order not found with ID: ${orderId}`;
          } else {
            reply = `📦 Order Status\n🆔 ${order.id}\n📊 Status: ${order.status}\n💰 Total: ₹${order.total}`;
          }
        } else {
          reply = "⚠️ Usage: status <order_id>";
        }
      }

      // Send reply
      const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: reply },
        }),
      });
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
