import express from "express";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// Supabase client - Render env vars वापर
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ Missing Supabase URL or Key in Render Environment Variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// WhatsApp credentials
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

if (!WHATSAPP_TOKEN || !VERIFY_TOKEN) {
  throw new Error("❌ Missing WhatsApp token or verify token in Render Environment Variables");
}

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running!");
});

// ✅ Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === VERIFY_TOKEN) {
    console.log("Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Incoming messages
app.post("/webhook", async (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

  const entry = req.body.entry?.[0]?.changes?.[0]?.value;
  if (!entry) return res.sendStatus(200);

  if (entry.messages) {
    const msg = entry.messages[0];
    const from = msg.from;
    const text = msg.text?.body?.toLowerCase();

    console.log(`📩 Message from ${from}: ${text}`);

    if (text?.startsWith("order")) {
      const orderText = text.replace("order", "").trim();

      // multiple items handle (rice 2, sugar 3)
      const items = orderText.split(",").map(i => i.trim().split(" "));
      let total = 0;
      let orderItems = [];

      for (let item of items) {
        if (item.length < 2) continue;
        const [product, qty] = item;
        const quantity = parseInt(qty, 10);

        // fetch product from Supabase
        const { data: productData, error } = await supabase
          .from("products")
          .select("*")
          .ilike("name", `%${product}%`)
          .single();

        if (productData) {
          const price = productData.price * quantity;
          total += price;
          orderItems.push({
            product_id: productData.id,
            quantity,
            price
          });
        }
      }

      // create order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert([{ customer_id: from, status: "pending", total }])
        .select()
        .single();

      if (orderError) {
        console.error("Order creation error:", orderError);
        return res.sendStatus(200);
      }

      // insert items
      for (let item of orderItems) {
        await supabase.from("order_items").insert({
          order_id: order.id,
          product_id: item.product_id,
          quantity: item.quantity,
          price: item.price
        });
      }

      // reply to user
      await fetch(
        `https://graph.facebook.com/v17.0/${entry.metadata.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: {
              body: `✅ Order created!\nID: ${order.id}\nStatus: ${order.status}\nTotal: ${total}`
            }
          })
        }
      );
    }
  }

  res.sendStatus(200);
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
