import 'dotenv/config';
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(bodyParser.json());

// ✅ Environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Debug logs
console.log("🔑 Supabase URL:", supabaseUrl ? "Loaded" : "❌ Missing");
console.log("🔑 Supabase Key:", supabaseKey ? "Loaded" : "❌ Missing");

if (!supabaseKey) {
  throw new Error("supabaseKey is required.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ✅ WhatsApp send function
async function sendMessage(to, message) {
  try {
    const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: message },
      }),
    });
    const data = await res.json();
    console.log("✅ WhatsApp response:", JSON.stringify(data));
  } catch (err) {
    console.error("❌ Error sending WhatsApp message:", err);
  }
}

// ✅ Order creation
async function handleOrder(phone, text) {
  try {
    const parts = text.split(" ");
    parts.shift(); // remove 'order'

    let items = [];
    for (let i = 0; i < parts.length; i += 2) {
      const productName = parts[i];
      const qty = parseInt(parts[i + 1]);

      const { data: product, error: productError } = await supabase
        .from("products")
        .select("*")
        .ilike("name", productName)
        .single();

      if (productError || !product) {
        console.log("⚠️ Product not found:", productName);
        continue;
      }

      items.push({
        product_id: product.id,
        quantity: qty,
        price: product.price,
      });
    }

    if (items.length === 0) {
      await sendMessage(phone, "⚠️ No valid products found in your order.");
      return;
    }

    const total = items.reduce((sum, it) => sum + it.price * it.quantity, 0);

    // create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([{ customer_phone: phone, status: "pending", total }])
      .select()
      .single();

    if (orderError) {
      console.error("❌ Order creation error:", orderError);
      await sendMessage(phone, "Failed to create order.");
      return;
    }

    // insert items
    const orderItems = items.map((it) => ({
      order_id: order.id,
      product_id: it.product_id,
      quantity: it.quantity,
      price: it.price,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("❌ Order items insert error:", itemsError);
    }

    const productList = items
      .map((it) => `${it.quantity}x ${it.product_id}`)
      .join(", ");

    await sendMessage(
      phone,
      `✅ Order created!\nID: ${order.id}\nStatus: ${order.status}\nTotal: ${total}\nItems: ${productList}`
    );
  } catch (err) {
    console.error("❌ handleOrder error:", err);
    await sendMessage(phone, "Error processing order.");
  }
}

// ✅ Order status check
async function handleStatus(phone, text) {
  try {
    const parts = text.split(" ");
    const orderId = parts[1];

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, total, order_items(product_id, quantity, price)")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      await sendMessage(phone, "⚠️ Order not found with that ID.");
      return;
    }

    let itemsText = "none";
    if (order.order_items && order.order_items.length > 0) {
      itemsText = order.order_items
        .map((it) => `${it.quantity}x ${it.product_id}`)
        .join(", ");
    }

    await sendMessage(
      phone,
      `📦 Order Status\nID: ${order.id}\nStatus: ${order.status}\nTotal: ${order.total}\nItems: ${itemsText}`
    );
  } catch (err) {
    console.error("❌ handleStatus error:", err);
    await sendMessage(phone, "Error checking order status.");
  }
}

// ✅ Webhook verify
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Webhook receive
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("📩 Incoming webhook:", JSON.stringify(body, null, 2));

  if (body.object === "whatsapp_business_account") {
    const changes = body.entry?.[0]?.changes?.[0]?.value;
    const message = changes?.messages?.[0];
    if (message && message.type === "text") {
      const text = message.text.body.toLowerCase();
      const from = message.from;
      console.log(`📩 Message from ${from}: ${text}`);

      if (text.startsWith("order")) {
        await handleOrder(from, text);
      } else if (text.startsWith("status")) {
        await handleStatus(from, text);
      } else {
        await sendMessage(from, "🤖 Send 'order rice 2' or 'status <id>'.");
      }
    }
  }

  res.sendStatus(200);
});

// ✅ Root
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running!");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
