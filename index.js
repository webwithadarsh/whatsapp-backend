import express from "express";
import fetch from "node-fetch";
import pkg from "@supabase/supabase-js";

const { createClient } = pkg;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());

// Home route
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

      let replyMessage = "Sorry, I didn't understand. Try 'order rice 2' or 'status <order_id>'.";

      // === ORDER FLOW ===
      if (msg_body.startsWith("order")) {
        const parts = msg_body.split(" ");
        if (parts.length >= 3) {
          const productName = parts[1];
          const qty = parseInt(parts[2]);

          // Find product in DB
          const { data: product, error: productError } = await supabase
            .from("products")
            .select("*")
            .ilike("name", productName)
            .single();

          if (productError || !product) {
            replyMessage = `❌ Product "${productName}" not found.`;
          } else {
            // Insert order
            const { data: order, error: orderError } = await supabase
              .from("orders")
              .insert([
                {
                  shop_id: product.shop_id,
                  channel: "whatsapp",
                  customer_name: "WhatsApp User",
                  customer_phone: from,
                  status: "pending",
                  payment: "cod",
                },
              ])
              .select()
              .single();

            if (orderError) {
              console.error("Order insert error:", orderError);
              replyMessage = "❌ Could not create order.";
            } else {
              // Insert order item
              const { error: itemError } = await supabase
                .from("order_items")
                .insert([
                  {
                    order_id: order.id,
                    product_id: product.id,
                    qty: qty,
                    price: product.price,
                  },
                ]);

              if (itemError) {
                console.error("Order item insert error:", itemError);
                replyMessage = "❌ Could not add item to order.";
              } else {
                replyMessage = `✅ Order created!\nOrder ID: ${order.id}\nProduct: ${product.name}\nQty: ${qty}\nTotal: ₹${qty * product.price}`;
              }
            }
          }
        } else {
          replyMessage = "❌ Usage: order <product_name> <qty>";
        }
      }

      // === STATUS FLOW ===
      else if (msg_body.startsWith("status")) {
        const parts = msg_body.split(" ");
        if (parts.length >= 2) {
          const orderId = parts[1];
          const { data: order, error } = await supabase
            .from("orders")
            .select("id, status, total")
            .eq("id", orderId)
            .single();

          if (error || !order) {
            replyMessage = `❌ Order not found with ID: ${orderId}`;
          } else {
            replyMessage = `📦 Order Status:\nID: ${order.id}\nStatus: ${order.status}\nTotal: ₹${order.total}`;
          }
        } else {
          replyMessage = "❌ Usage: status <order_id>";
        }
      }

      // Send reply to WhatsApp
      const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;
      console.log("➡️ Sending reply via:", url);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: replyMessage },
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

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`);
});
