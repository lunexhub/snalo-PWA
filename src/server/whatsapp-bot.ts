// Snalo WhatsApp Chatbot Engine
// Integrates Meta WhatsApp Business Cloud API, Supabase, and OpenAI (gpt-4o-mini)

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://dcmuughdramlrfqbkqli.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  "";

const META_ACCESS_TOKEN =
  process.env.META_ACCESS_TOKEN ||
  process.env.META_TOKEN ||
  "";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ||
  "";

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN || "snalo_verify_token_2026";

const APP_URL = "https://snalo-pwa.vercel.app";

// Default phone number ID fallback if needed
let lastKnownPhoneNumberId = "122093671472491331";

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Webhook Verification (GET /api/webhook or /api/whatsapp)
  if ((path === "/api/webhook" || path === "/api/whatsapp") && request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[WhatsApp Webhook] Verification successful");
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // 2. Incoming WhatsApp Message Handler (POST /api/webhook or /api/whatsapp)
  if ((path === "/api/webhook" || path === "/api/whatsapp") && request.method === "POST") {
    try {
      const body = await request.json();
      // Await processing in serverless environment before returning response
      await processIncomingWhatsAppPayload(body);
      return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Webhook POST Error]", err);
      return new Response("Bad Request", { status: 400 });
    }
  }

  // 3. Webview Order Placement Handler (POST /api/order)
  if (path === "/api/order" && request.method === "POST") {
    try {
      const order = await request.json();
      const saved = await saveOrderToSupabase(order);

      // If customer phone is present, send WhatsApp confirmation message
      if (order.customerPhone) {
        await sendOrderConfirmationToCustomer(order).catch((e) =>
          console.error("[Order WhatsApp Notification Error]", e)
        );
      }

      return new Response(JSON.stringify({ success: true, order: saved }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Order API Error]", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 4. Health & Bot Status Check (GET /api/bot-status)
  if (path === "/api/bot-status" && request.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "online",
        bot: "Snalo Fast Delivery Bot",
        model: "gpt-4o-mini",
        supabase_connected: !!SUPABASE_KEY,
        meta_connected: !!META_ACCESS_TOKEN,
        webhook_verify_token: VERIFY_TOKEN,
        last_phone_number_id: lastKnownPhoneNumberId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 5. Update Bot Config (POST /api/bot-config)
  if (path === "/api/bot-config" && request.method === "POST") {
    try {
      const data = await request.json();
      if (data.phoneNumberId) {
        lastKnownPhoneNumberId = String(data.phoneNumberId);
        await saveBotConfigKey("phone_number_id", { phone_number_id: data.phoneNumberId });
      }
      return new Response(
        JSON.stringify({ success: true, phoneNumberId: lastKnownPhoneNumberId }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 6. Real Products from Supabase (GET /api/products)
  if (path === "/api/products" && request.method === "GET") {
    try {
      const products = await fetchProductsFromSupabase();
      return new Response(JSON.stringify(products), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not Found", { status: 404 });
}

interface MetaWebhookValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    interactive?: {
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string };
    };
  }>;
}

async function processIncomingWhatsAppPayload(payload: {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: MetaWebhookValue;
      field?: string;
    }>;
  }>;
}) {
  if (!payload.entry || !payload.entry[0]?.changes) return;

  const value = payload.entry[0].changes[0]?.value;
  if (!value || !value.messages || value.messages.length === 0) return;

  const phoneNumberId = value.metadata?.phone_number_id || lastKnownPhoneNumberId;
  if (value.metadata?.phone_number_id) {
    lastKnownPhoneNumberId = value.metadata.phone_number_id;
  }

  const incomingMessage = value.messages[0];
  const from = incomingMessage.from;
  const customerName = value.contacts?.[0]?.profile?.name || "Friend";

  let userText = "";
  let buttonId = "";

  if (incomingMessage.type === "text" && incomingMessage.text?.body) {
    userText = incomingMessage.text.body.trim();
  } else if (incomingMessage.type === "interactive") {
    userText =
      incomingMessage.interactive?.button_reply?.title ||
      incomingMessage.interactive?.list_reply?.title ||
      "";
    buttonId =
      incomingMessage.interactive?.button_reply?.id ||
      incomingMessage.interactive?.list_reply?.id ||
      "";
  }

  if (!userText && !buttonId) return;

  console.log(`[WhatsApp Incoming] From: ${from} (${customerName}) Text: "${userText}" ButtonID: "${buttonId}"`);

  // 1. Record incoming user message in Supabase
  await recordMessageInSupabase(from, customerName, "user", userText || buttonId, phoneNumberId, incomingMessage);

  // 2. Fetch conversation context from Supabase (last 8 messages)
  const history = await fetchConversationHistory(from);

  const lower = userText.toLowerCase().trim();
  const storeLink = `${APP_URL}/?source=whatsapp&phone=${from}&name=${encodeURIComponent(customerName)}`;

  // Flow A: Greeting / Hello / Menu / First Contact -> Send Interactive Reply Buttons
  const isGreeting =
    buttonId === "btn_menu" ||
    /^(hi|hello|hey|howzit|hola|good\s*(morning|afternoon|evening)|start|menu|help me)$/i.test(lower) ||
    (history.length === 0 && lower.length < 25);

  if (isGreeting && buttonId !== "btn_order" && buttonId !== "btn_track" && buttonId !== "btn_help") {
    const greetingText = `Hi ${customerName}! 🛒 Welcome to Snalo Fast Delivery in Johannesburg.\n\nChoose below what you are interested in:`;
    const buttons = [
      { id: "btn_order", title: "Place an order" },
      { id: "btn_track", title: "Track my order" },
      { id: "btn_help", title: "Help" },
    ];

    await sendWhatsAppReplyButtons(phoneNumberId, from, greetingText, buttons);
    await recordMessageInSupabase(from, customerName, "assistant", greetingText, phoneNumberId, { buttons });
    return;
  }

  // Flow B: Place an order (Button tapped or typed)
  const isPlaceOrder =
    buttonId === "btn_order" ||
    lower === "place an order" ||
    lower === "order" ||
    lower === "buy groceries" ||
    lower === "place order" ||
    lower === "shop";

  if (isPlaceOrder) {
    const orderPrompt = `🛒 *Welcome to Snalo Fast Delivery!*

Tap below to open your interactive store in 1 tap — your WhatsApp number is recognized automatically with no login required:

👉 ${storeLink}

⚡ Pick your groceries and we deliver to your door in *15–20 minutes* across Johannesburg!
🎁 *FREE delivery* on orders above R 150!`;

    await sendWhatsAppTextMessage(phoneNumberId, from, orderPrompt);
    await recordMessageInSupabase(from, customerName, "assistant", orderPrompt, phoneNumberId, null);
    return;
  }

  // Flow C: Track my order (Button tapped or typed)
  const isTrack =
    buttonId === "btn_track" ||
    lower === "track my order" ||
    lower === "track order" ||
    lower === "tracking";

  if (isTrack) {
    const recent = await fetchRecentOrderByPhone(from);
    let trackMessage = "";

    if (recent) {
      trackMessage = `📦 *Your Recent Snalo Order #${recent.id}*
━━━━━━━━━━━━━━━━━━
📊 *Status:* ${String(recent.status || "On The Way").toUpperCase()}
💵 *Total:* R ${recent.total || 0} (${recent.payment_method || "COD"})
📍 *Address:* ${recent.delivery_address || "Johannesburg"}
⏱ *Delivery Speed:* 15–20 Mins by John Rider

Live tracking on map:
👉 ${APP_URL}/?screen=tracking&order=${recent.id}

Have another order number? Just reply with it (e.g. *SN-1024*)!`;
    } else {
      trackMessage = `📦 *Track Your Snalo Order*

Please reply with your *Order Number* (e.g., *SN-1024* or your order digits) and I'll find its live delivery status for you right away!`;
    }

    await sendWhatsAppTextMessage(phoneNumberId, from, trackMessage);
    await recordMessageInSupabase(from, customerName, "assistant", trackMessage, phoneNumberId, null);
    return;
  }

  // Flow D: User replied with an order number (e.g. SN-8812, SN-TEST, or 4-digit code)
  const orderRegex = /^(sn[-_]?[a-z0-9]+|\d{4,8})$/i;
  if (orderRegex.test(lower)) {
    const order = await fetchOrderById(userText);
    let replyMsg = "";
    if (order) {
      replyMsg = `📦 *Order #${order.id} Found!*
━━━━━━━━━━━━━━━━━━
📊 *Status:* ${String(order.status || "Placed").toUpperCase()}
💵 *Total:* R ${order.total || 0} (${order.payment_method || "COD"})
📍 *Address:* ${order.delivery_address || "Johannesburg"}
⏱ *Estimated Arrival:* 15–20 Mins

Live GPS map tracking:
👉 ${APP_URL}/?screen=tracking&order=${order.id}`;
    } else {
      replyMsg = `We couldn't find order *#${userText.toUpperCase()}*.

Please check your confirmation message or order digits, or tap below to open the store:
👉 ${storeLink}`;
    }
    await sendWhatsAppTextMessage(phoneNumberId, from, replyMsg);
    await recordMessageInSupabase(from, customerName, "assistant", replyMsg, phoneNumberId, null);
    return;
  }

  // Flow E: Help / Support (Button tapped or typed)
  const isHelp =
    buttonId === "btn_help" ||
    lower === "help" ||
    lower === "support" ||
    lower === "customer care" ||
    lower === "agent";

  if (isHelp) {
    const helpMsg = `Need help or have questions about delivery? Our support team is here for you! 📞

Click below to chat directly with our support team on WhatsApp:
👉 https://wa.me/27821234567?text=${encodeURIComponent(`Hi Snalo Support, I need assistance (Customer Phone: ${from})`)}

Or call us anytime at: *+27 82 123 4567*
🕒 *Customer Support Hours:* 7:00 AM – 10:00 PM`;

    await sendWhatsAppTextMessage(phoneNumberId, from, helpMsg);
    await recordMessageInSupabase(from, customerName, "assistant", helpMsg, phoneNumberId, null);
    return;
  }

  // Flow F: All other questions ("are there any specials?", "how much are bananas and milk?", "do you have cheese?")
  // -> OpenAI gpt-4o-mini generates intelligent contextual response with live Supabase products & specials!
  const replyText = await generateAiReply(userText, customerName, from, history);
  await sendWhatsAppTextMessage(phoneNumberId, from, replyText);
  await recordMessageInSupabase(from, customerName, "assistant", replyText, phoneNumberId, null);
}

async function fetchProductsFromSupabase(): Promise<Array<{
  id: string;
  name: string;
  unit: string;
  price: number;
  category: string;
  image_url: string;
  in_stock: boolean;
}>> {
  const defaultList = [
    { id: "apple", name: "Fresh Apples", unit: "1 Kg", price: 25, category: "Fruits", image_url: "", in_stock: true },
    { id: "banana", name: "Bananas", unit: "1 Kg", price: 18, category: "Fruits", image_url: "", in_stock: true },
    { id: "potato", name: "Potatoes", unit: "1 Kg", price: 12, category: "Vegetables", image_url: "", in_stock: true },
    { id: "carrot", name: "Carrots", unit: "500 g", price: 10, category: "Vegetables", image_url: "", in_stock: true },
    { id: "milk", name: "Fresh Milk", unit: "2 L", price: 32, category: "Dairy", image_url: "", in_stock: true },
    { id: "cheese", name: "Cheddar", unit: "400 g", price: 55, category: "Dairy", image_url: "", in_stock: true },
    { id: "chips", name: "Potato Chips", unit: "125 g", price: 20, category: "Snacks", image_url: "", in_stock: true },
    { id: "grapes", name: "Red Grapes", unit: "500 g", price: 35, category: "Fruits", image_url: "", in_stock: true },
  ];

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=id.asc`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!res.ok) return defaultList;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : defaultList;
  } catch {
    return defaultList;
  }
}

async function generateAiReply(
  userMessage: string,
  customerName: string,
  customerPhone: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const storeLink = `${APP_URL}/?source=whatsapp&phone=${customerPhone}&name=${encodeURIComponent(customerName)}`;
  const products = await fetchProductsFromSupabase();

  const menuList = products
    .map((p) => `• ${p.name} (${p.unit}): R ${p.price}${p.in_stock ? "" : " (Temporarily Out of Stock)"}`)
    .join("\n");

  const systemPrompt = `You are Snalo, the official ultra-fast AI delivery assistant for Snalo Fast Delivery in Johannesburg, South Africa.

You help customers order groceries, check prices, find fresh foods, and get their orders delivered in 15–20 minutes!

OUR LIVE SUPABASE GROCERY MENU:
${menuList}

CURRENT SPECIALS & PROMOTIONS:
• 20% discount special on all fresh fruits & vegetables this week!
• FREE Delivery on all orders above R 150 (normal delivery is R 15).
• Ultra-fast 15–20 minutes delivery across Johannesburg!

DELIVERY & PAYMENT:
• Delivery Speed: 15–20 minutes
• Delivery Fee: R 15 (FREE delivery on orders over R 150!)
• Payment: Cash on Delivery, WhatsApp Pay, or Card

CUSTOMER DETAILS:
• Name: ${customerName}
• WhatsApp Number: ${customerPhone}
• Interactive Store Link: ${storeLink}

INSTRUCTIONS:
1. Speak in a warm, helpful, energetic South African tone (e.g. use occasional friendly phrases like "Howzit", "Sharp sharp", "No problem at all!").
2. Format cleanly using WhatsApp Markdown (*bold*, bullet points, line breaks).
3. If the user asks about specials, discounts, or deals, tell them about the 20% off fruits & veggies and FREE delivery over R 150!
4. Whenever the user asks to see groceries, wants to buy, or asks how to order, ALWAYS share their personalized 1-tap store link:
   👉 ${storeLink}
5. If the user tells you their order directly (e.g. "I want 2 milk and apples"), calculate the total price including delivery, tell them the total, and provide the store link to confirm delivery address.
6. Keep answers concise, readable on a phone screen, and action-oriented.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 450,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[OpenAI Error]", res.status, errText);
      return `Hi ${customerName}! 🛒 Welcome to Snalo Fast Delivery!

Tap here to browse groceries and order in 1 tap:
👉 ${storeLink}

We deliver in 15–20 minutes across Johannesburg! 🚀`;
    }

    const data = await res.json();
    return (
      data.choices?.[0]?.message?.content ||
      `Howzit ${customerName}! Tap here to choose your groceries: ${storeLink}`
    );
  } catch (err) {
    console.error("[OpenAI Exception]", err);
    return `Hi ${customerName}! 🛒 Tap here to browse and order fresh groceries:
👉 ${storeLink}

Delivered in 15–20 mins! 🚀`;
  }
}

async function sendWhatsAppTextMessage(phoneNumberId: string, to: string, text: string) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: true,
          body: text,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[Meta API Send Error]", res.status, JSON.stringify(data));
    } else {
      console.log(`[WhatsApp Sent] To: ${to} MsgID: ${data.messages?.[0]?.id}`);
    }
    return data;
  } catch (err) {
    console.error("[Meta API Send Exception]", err);
  }
}

async function sendWhatsAppReplyButtons(
  phoneNumberId: string,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: bodyText,
          },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: {
                id: b.id,
                title: b.title.slice(0, 20),
              },
            })),
          },
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[Meta API Send Buttons Error]", res.status, JSON.stringify(data));
      // Fallback: send text message with numbered options if interactive buttons fail
      const fallbackText = `${bodyText}\n\n1️⃣ Place an order\n2️⃣ Track my order\n3️⃣ Help`;
      await sendWhatsAppTextMessage(phoneNumberId, to, fallbackText);
    } else {
      console.log(`[WhatsApp Buttons Sent] To: ${to} MsgID: ${data.messages?.[0]?.id}`);
    }
    return data;
  } catch (err) {
    console.error("[Meta API Send Buttons Exception]", err);
    await sendWhatsAppTextMessage(phoneNumberId, to, bodyText);
  }
}

async function fetchRecentOrderByPhone(phone: string) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?phone=eq.${phone}&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

async function fetchOrderById(orderId: string) {
  try {
    const clean = orderId.toUpperCase().trim();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=ilike.%25${encodeURIComponent(clean)}%25&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch {
    return null;
  }
}

async function sendOrderConfirmationToCustomer(order: {
  orderId?: string;
  customerName?: string;
  customerPhone?: string;
  total?: number;
  items?: Array<{ name: string; quantity: number; price: number }>;
  address?: string;
  paymentMethod?: string;
}) {
  if (!order.customerPhone) return;

  const orderId = order.orderId || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
  const itemsText = (order.items || [])
    .map((item) => `• ${item.name} x${item.quantity}`)
    .join("\n");

  const message = `🎉 *Order Confirmed! #${orderId}*
━━━━━━━━━━━━━━━━━━
Thank you ${order.customerName || "Customer"}! We received your order.

*Items:*
${itemsText || "• Fresh Groceries"}

💵 *Total:* R ${order.total || 0} (${order.paymentMethod || "COD"})
📍 *Address:* ${order.address || "Johannesburg"}
⏱ *Estimated Delivery:* 15–20 Mins by John Rider

Live tracking link:
👉 ${APP_URL}/?screen=tracking&order=${orderId}`;

  await sendWhatsAppTextMessage(lastKnownPhoneNumberId, order.customerPhone, message);
}

async function recordMessageInSupabase(
  phone: string,
  name: string,
  role: "user" | "assistant" | "system",
  content: string,
  phoneNumberId: string,
  rawPayload: unknown
) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        phone,
        name,
        role,
        content,
        phone_number_id: phoneNumberId,
        raw_payload: rawPayload ? rawPayload : null,
      }),
    });
  } catch (err) {
    console.error("[Supabase Message Record Error]", err);
  }
}

async function fetchConversationHistory(
  phone: string
): Promise<Array<{ role: string; content: string }>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_messages?phone=eq.${phone}&order=created_at.desc&limit=8&select=role,content`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ role: string; content: string }>;
    return data.reverse();
  } catch {
    return [];
  }
}

async function saveOrderToSupabase(order: {
  orderId?: string;
  customerPhone?: string;
  customerName?: string;
  address?: string;
  items?: unknown;
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  paymentMethod?: string;
}) {
  try {
    const orderId = order.orderId || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: orderId,
        phone: order.customerPhone || null,
        customer_name: order.customerName || "Customer",
        delivery_address: order.address || "Johannesburg",
        items: order.items || [],
        subtotal: order.subtotal || 0,
        delivery_fee: order.deliveryFee || 0,
        total: order.total || 0,
        payment_method: order.paymentMethod || "COD",
        status: "placed",
      }),
    });
    return await res.json();
  } catch (err) {
    console.error("[Supabase Save Order Error]", err);
    return order;
  }
}

async function saveBotConfigKey(key: string, value: unknown) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/bot_settings`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ key, value }),
    });
  } catch (err) {
    console.error("[Supabase Bot Config Error]", err);
  }
}

