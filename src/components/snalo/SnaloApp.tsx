import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft, Bell, Bike, Check, ChevronRight, CreditCard, Eye, EyeOff, Heart, HelpCircle, Home,
  Download, Lock, LogOut, Mail, MapPin, Menu, Minus, Package, Phone, Plus, Receipt, Search,
  Settings, ShoppingCart, Tag, Trash2, Truck, User, Wallet, Banknote, Gift, CheckCircle2, Store,
} from "lucide-react";
import rider from "@/assets/rider.png";
import basket from "@/assets/basket.png";
import appleImg from "@/assets/foods/apple.png";
import bananaImg from "@/assets/foods/banana.png";
import potatoImg from "@/assets/foods/potato.png";
import carrotImg from "@/assets/foods/carrot.png";
import milkImg from "@/assets/foods/milk.png";
import cheeseImg from "@/assets/foods/cheese.png";
import chipsImg from "@/assets/foods/chips.png";
import grapesImg from "@/assets/foods/grapes.png";
import { getSupabaseProducts, getSupabaseCategories, getSupabaseStores } from "@/lib/supabase";

type Screen = "splash" | "welcome" | "login" | "home" | "products" | "cart" | "checkout" | "tracking" | "profile" | "notifications";
type Product = { id: string; name: string; unit: string; price: number; img: string; cat: string };

type WhatsAppContext = {
  isWhatsApp: boolean;
  phone: string;
  name: string;
  address: string;
  botPhone: string;
  ref: string;
  initialScreen?: Screen;
  initialCart?: Record<string, number>;
};

type OrderItem = {
  id: string;
  name: string;
  unit: string;
  price: number;
  quantity: number;
};

type OrderData = {
  orderId: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  address: string;
  ref: string;
  createdAt: string;
};

const PRODUCTS: Product[] = [
  { id: "apple", name: "Fresh Apples", unit: "1 Kg", price: 25, img: appleImg, cat: "Fruits" },
  { id: "banana", name: "Bananas", unit: "1 Kg", price: 18, img: bananaImg, cat: "Fruits" },
  { id: "potato", name: "Potatoes", unit: "1 Kg", price: 12, img: potatoImg, cat: "Vegetables" },
  { id: "carrot", name: "Carrots", unit: "500 g", price: 10, img: carrotImg, cat: "Vegetables" },
  { id: "milk", name: "Fresh Milk", unit: "2 L", price: 32, img: milkImg, cat: "Dairy" },
  { id: "cheese", name: "Cheddar", unit: "400 g", price: 55, img: cheeseImg, cat: "Dairy" },
  { id: "chips", name: "Potato Chips", unit: "125 g", price: 20, img: chipsImg, cat: "Snacks" },
  { id: "grapes", name: "Red Grapes", unit: "500 g", price: 35, img: grapesImg, cat: "Fruits" },
];
const CATS = [{ n: "Groceries", e: "🛒" }, { n: "Fruits", e: "🍓" }, { n: "Vegetables", e: "🥦" }, { n: "Dairy", e: "🥛" }];
const SHOPS = ["Pick n Pay", "Shoprite", "Checkers", "Spar"];

const DEFAULT_BOT_PHONE = "27718765434";

function normalizeBotPhone(val?: string | null): string {
  if (!val) return DEFAULT_BOT_PHONE;
  const digits = val.replace(/[^0-9]/g, "");
  // Map Meta Phone Number ID to actual phone number
  if (digits === "1320939644434475" || digits === "122093671472491331") {
    return DEFAULT_BOT_PHONE;
  }
  return digits || DEFAULT_BOT_PHONE;
}

function getWhatsAppContext(): WhatsAppContext {
  if (typeof window === "undefined") {
    return {
      isWhatsApp: false,
      phone: "",
      name: "John Smith",
      address: "12 Main Street, Johannesburg, SA",
      botPhone: DEFAULT_BOT_PHONE,
      ref: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent || "";
  const referrer = document.referrer || "";
  const isWaUa = /WhatsApp/i.test(ua);
  const isWaReferrer = /whatsapp/i.test(referrer);
  const hasWaParam =
    params.get("source") === "whatsapp" ||
    params.get("mode") === "whatsapp" ||
    params.get("wa") === "1" ||
    params.get("wa") === "true" ||
    params.has("wa_id") ||
    params.has("phone") ||
    params.has("bot");

  const isWhatsApp = isWaUa || isWaReferrer || hasWaParam;
  const phone = params.get("phone") || params.get("wa_id") || "";
  const rawName = params.get("name");
  const name = rawName || (phone ? `WhatsApp User (${phone.slice(-4)})` : "John Smith");
  const address = params.get("address") || "12 Main Street, Johannesburg, SA";
  const rawBot = params.get("bot") || params.get("business_phone");
  const botPhone = normalizeBotPhone(rawBot);
  const ref = params.get("ref") || params.get("session_id") || "";

  const targetScreen = params.get("screen") as Screen | null;
  const initialScreen = targetScreen && ["home", "products", "cart", "checkout", "tracking", "profile"].includes(targetScreen)
    ? targetScreen
    : undefined;

  let initialCart: Record<string, number> | undefined;
  const itemsParam = params.get("items");
  if (itemsParam) {
    initialCart = {};
    const pairs = itemsParam.split(",");
    for (const pair of pairs) {
      const [id, qtyStr] = pair.split(":");
      const qty = parseInt(qtyStr, 10);
      if (id && !isNaN(qty) && qty > 0) {
        initialCart[id.trim()] = qty;
      }
    }
  }

  return {
    isWhatsApp,
    phone,
    name,
    address,
    botPhone,
    ref,
    initialScreen,
    initialCart,
  };
}

function buildWhatsAppOrderMessage(order: OrderData | null, wa: WhatsAppContext): string {
  const id = order?.orderId || "SN1024";
  const customerName = order?.customerName || wa.name || "Customer";
  const phone = order?.customerPhone || wa.phone;
  const address = order?.address || wa.address;
  const total = order?.total ?? 85;
  const payment =
    order?.paymentMethod === "cod"
      ? "Cash On Delivery"
      : order?.paymentMethod === "wa"
      ? "Confirm & Pay via WhatsApp"
      : "Card";

  const lines = [
    `🛒 *New Snalo Order #${id}*`,
    `━━━━━━━━━━━━━━━━━━`,
    `👤 *Customer:* ${customerName}${phone ? ` (${phone})` : ""}`,
    `📍 *Delivery Address:* ${address}`,
    ``,
    `*Items Ordered:*`,
  ];

  if (order?.items && order.items.length > 0) {
    order.items.forEach((item) => {
      lines.push(`• ${item.name} (${item.unit}) x${item.quantity} — R ${item.price * item.quantity}`);
    });
  } else {
    lines.push(`• Fresh Grocery Order`);
  }

  lines.push(``);
  lines.push(`💵 *Total Amount:* R ${total}`);
  lines.push(`💳 *Payment Method:* ${payment}`);
  if (wa.ref) {
    lines.push(`🔖 *Bot Ref:* ${wa.ref}`);
  }
  lines.push(`⏱ *Delivery Time:* 15–20 Mins`);
  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`Please confirm my order and start delivery! 🚀`);

  return lines.join("\n");
}

function openWhatsAppMessage(phone: string, text: string) {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const encoded = encodeURIComponent(text);
  const waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
  if (typeof window !== "undefined") {
    const win = window.open(waUrl, "_blank");
    if (!win) {
      window.location.href = waUrl;
    }
  }
}

export default function SnaloApp() {
  const [waContext] = useState<WhatsAppContext>(() => getWhatsAppContext());
  const [screen, setScreen] = useState<Screen>(() => {
    const ctx = getWhatsAppContext();
    if (ctx.isWhatsApp) {
      return ctx.initialScreen || "home";
    }
    return "splash";
  });
  const [cart, setCart] = useState<Record<string, number>>(() => {
    const ctx = getWhatsAppContext();
    if (ctx.initialCart && Object.keys(ctx.initialCart).length > 0) {
      return ctx.initialCart;
    }
    return { apple: 1, banana: 2, potato: 1 };
  });
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [categories, setCategories] = useState<{ n: string; e: string }[]>(CATS);
  const [stores, setStores] = useState<string[]>(SHOPS);

  useEffect(() => {
    // Fetch live products from Supabase
    getSupabaseProducts().then((liveProducts) => {
      if (liveProducts && liveProducts.length > 0) {
        setProducts(
          liveProducts.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
            price: Number(p.price),
            img: p.image_url,
            cat: p.category,
          }))
        );
      }
    });

    // Fetch live categories from Supabase
    getSupabaseCategories().then((liveCats) => {
      if (liveCats && liveCats.length > 0) {
        setCategories(liveCats.map((c) => ({ n: c.name, e: c.emoji })));
      }
    });

    // Fetch live stores from Supabase
    getSupabaseStores().then((liveStores) => {
      if (liveStores && liveStores.length > 0) {
        setStores(liveStores.map((s) => s.name));
      }
    });
  }, []);

  const [customer, setCustomer] = useState(() => ({
    name: waContext.name,
    phone: waContext.phone,
    address: waContext.address,
  }));
  const [lastOrder, setLastOrder] = useState<OrderData | null>(null);
  const [drawer, setDrawer] = useState(false);
  const go = (s: Screen) => { setDrawer(false); setScreen(s); };
  const add = (id: string, d = 1) =>
    setCart((c) => { const q = (c[id] ?? 0) + d; const n = { ...c }; if (q <= 0) delete n[id]; else n[id] = q; return n; });
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = Object.entries(cart).reduce(
    (s, [id, q]) => s + ((products.find((p) => p.id === id)?.price ?? PRODUCTS.find((p) => p.id === id)?.price ?? 0) * q),
    0
  );

  useEffect(() => {
    if (waContext.isWhatsApp) return;
    if (screen !== "splash") return;
    const t = setTimeout(() => setScreen("welcome"), 1800);
    return () => clearTimeout(t);
  }, [screen, waContext.isWhatsApp]);

  // Handle postMessage communication from host chatbot webview
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "SNALO_SET_USER") {
        setCustomer((prev) => ({
          name: e.data.name || prev.name,
          phone: e.data.phone || prev.phone,
          address: e.data.address || prev.address,
        }));
      }
      if (e.data.type === "SNALO_NAVIGATE" && e.data.screen) {
        go(e.data.screen);
      }
      if (e.data.type === "SNALO_ADD_TO_CART" && e.data.id) {
        add(e.data.id, e.data.quantity || 1);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const tabbed = ["home", "profile"].includes(screen);
  let body: ReactNode;
  switch (screen) {
    case "splash": body = <Splash />; break;
    case "welcome": body = <Welcome go={go} isWhatsApp={waContext.isWhatsApp} />; break;
    case "login": body = <Login go={go} isWhatsApp={waContext.isWhatsApp} />; break;
    case "home": body = <HomeScreen go={go} add={add} cart={cart} count={count} openDrawer={() => setDrawer(true)} waContext={waContext} customer={customer} products={products} categories={categories} stores={stores} />; break;
    case "products": body = <Products go={go} add={add} cart={cart} count={count} products={products} categories={categories} />; break;
    case "cart": body = <Cart go={go} add={add} cart={cart} subtotal={subtotal} products={products} />; break;
    case "checkout": body = <Checkout go={go} subtotal={subtotal} cart={cart} clear={() => setCart({})} waContext={waContext} customer={customer} setCustomer={setCustomer} setLastOrder={setLastOrder} products={products} />; break;
    case "tracking": body = <Tracking go={go} waContext={waContext} lastOrder={lastOrder} />; break;
    case "profile": body = <Profile go={go} customer={customer} waContext={waContext} />; break;
    case "notifications": body = <Notifications go={go} />; break;
  }

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center bg-background sm:bg-muted/30 p-0 sm:p-4 md:p-6 overflow-hidden select-none">
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-background sm:h-[844px] sm:max-h-[92vh] sm:rounded-[2.5rem] sm:border-[8px] sm:border-foreground/90 sm:shadow-phone">
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar overscroll-contain">{body}</div>
        {tabbed && <TabBar screen={screen} go={go} count={count} />}
        {drawer && <Drawer go={go} close={() => setDrawer(false)} waContext={waContext} />}
      </div>
    </div>
  );
}

/* ---------- shared ---------- */
function WhatsAppIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.03c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.55-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.24-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29z" />
    </svg>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Global prompt capture so the event is NEVER missed during early load/splash screen
declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

let globalPrompt: BeforeInstallPromptEvent | null =
  typeof window !== "undefined" ? window.__pwaInstallPrompt ?? null : null;
const promptListeners = new Set<(e: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
  if (window.__pwaInstallPrompt) {
    globalPrompt = window.__pwaInstallPrompt;
  }
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    globalPrompt = e as BeforeInstallPromptEvent;
    window.__pwaInstallPrompt = globalPrompt;
    promptListeners.forEach((cb) => cb(globalPrompt));
  });

  window.addEventListener("appinstalled", () => {
    globalPrompt = null;
    window.__pwaInstallPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => globalPrompt || (typeof window !== "undefined" ? window.__pwaInstallPrompt ?? null : null)
  );
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [installed, setInstalled] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });

  useEffect(() => {
    // If prompt was captured early
    if (typeof window !== "undefined" && window.__pwaInstallPrompt && !deferred) {
      setDeferred(window.__pwaInstallPrompt);
    }

    const onPrompt = (p: BeforeInstallPromptEvent | null) => setDeferred(p);
    promptListeners.add(onPrompt);

    const checkStandalone = () => {
      if (
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
      ) {
        setInstalled(true);
      }
    };
    window.addEventListener("appinstalled", checkStandalone);
    return () => {
      promptListeners.delete(onPrompt);
      window.removeEventListener("appinstalled", checkStandalone);
    };
  }, [deferred]);

  const install = async () => {
    const prompt =
      deferred ||
      globalPrompt ||
      (typeof window !== "undefined" ? window.__pwaInstallPrompt ?? null : null);

    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        globalPrompt = null;
        if (typeof window !== "undefined") {
          window.__pwaInstallPrompt = null;
        }
        setDeferred(null);
        setInstalled(true);
      }
    } else {
      const isIos =
        typeof navigator !== "undefined" &&
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as unknown as { MSStream?: unknown }).MSStream;
      if (isIos) {
        setShowIosSheet(true);
      }
    }
  };

  return { install, installed, showIosSheet, closeIosSheet: () => setShowIosSheet(false) };
}

function InstallButton({ isWhatsApp = false }: { isWhatsApp?: boolean }) {
  const { install, installed, showIosSheet, closeIosSheet } = usePwaInstall();
  if (installed || isWhatsApp) return null;

  return (
    <>
      <button
        onClick={install}
        className="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] z-20 flex items-center gap-1.5 rounded-full bg-foreground/90 backdrop-blur px-3.5 py-2 text-xs font-semibold text-background shadow-lg transition active:scale-95"
      >
        <Download className="h-3.5 w-3.5" /> Install app
      </button>

      {showIosSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={closeIosSheet}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-card p-5 text-card-foreground shadow-2xl animate-in slide-in-from-bottom"
          >
            <div className="flex items-center gap-3">
              <Logo className="h-12 w-12 rounded-2xl" />
              <div>
                <h3 className="font-bold text-base">Install Snalo App</h3>
                <p className="text-xs text-muted-foreground">Add to home screen for full app experience</p>
              </div>
            </div>
            <div className="my-4 space-y-2.5 rounded-2xl bg-muted/60 p-3.5 text-xs text-foreground">
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-bold text-[10px]">
                  1
                </span>
                <span>
                  Tap the <strong className="font-semibold">Share</strong> button in your browser
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-bold text-[10px]">
                  2
                </span>
                <span>
                  Choose <strong className="font-semibold">Add to Home Screen</strong>
                </span>
              </div>
            </div>
            <button
              onClick={closeIosSheet}
              className="w-full rounded-2xl bg-primary py-3 font-semibold text-sm text-primary-foreground transition active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Header({ title, sub, back, right }: { title: string; sub?: string; back: () => void; right?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 px-5 pb-3 pt-[max(env(safe-area-inset-top),1.25rem)] backdrop-blur">
      <button onClick={back} aria-label="Back" className="rounded-full p-2 hover:bg-muted active:scale-90 transition"><ArrowLeft className="h-5 w-5" /></button>
      <div className="flex-1 min-w-0">
        {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
        <h1 className="text-lg font-bold truncate leading-tight">{title}</h1>
      </div>
      {right}
    </div>
  );
}
function CartBtn({ count, go }: { count: number; go: (s: Screen) => void }) {
  return (
    <button onClick={() => go("cart")} aria-label="Cart" className="relative rounded-full p-2 hover:bg-muted">
      <ShoppingCart className="h-5 w-5" />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count}</span>}
    </button>
  );
}
function PrimaryBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-semibold text-primary-foreground shadow-card transition hover:brightness-110 active:scale-[0.98]">{children}</button>;
}
function Logo({ className = "" }: { className?: string }) {
  return <div className={`grid place-items-center rounded-3xl bg-background text-primary shadow-card ${className}`}><Bike className="h-1/2 w-1/2" /></div>;
}
function ProductCard({ p, onAdd }: { p: Product; onAdd: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-card">
      <div className="grid h-24 place-items-center">
        <img
          src={p.img}
          alt={p.name}
          loading="lazy"
          className="h-24 w-full object-contain"
          onError={(e) => {
            const fallback = PRODUCTS.find((x) => x.id === p.id)?.img;
            if (fallback && e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback;
            }
          }}
        />
      </div>
      <p className="mt-1 text-sm font-semibold">{p.name}</p>
      <p className="text-xs text-muted-foreground">{p.unit}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-bold">R {p.price}</span>
        <button onClick={onAdd} aria-label={`Add ${p.name}`} className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ---------- screens ---------- */
function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-primary text-primary-foreground select-none px-6 text-center">
      <Logo className="h-24 w-24" />
      <h1 className="text-2xl font-bold tracking-tight">Snalo Fast Delivery</h1>
      <p className="text-sm opacity-85">Fast Grocery Delivery</p>
      <div className="mt-8 h-7 w-7 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
    </div>
  );
}

function Welcome({ go, isWhatsApp }: { go: (s: Screen) => void; isWhatsApp?: boolean }) {
  return (
    <div className="relative flex h-full flex-col bg-primary text-primary-foreground overflow-hidden">
      <div className="absolute -right-16 top-24 h-56 w-56 rounded-full bg-warning/60 pointer-events-none" />
      <InstallButton isWhatsApp={isWhatsApp} />
      <div className="relative px-6 pt-[max(env(safe-area-inset-top),2.5rem)] text-center">
        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight">Snalo</h1>
        <p className="mt-1 text-xs sm:text-sm font-semibold tracking-[0.3em]">FAST DELIVERY</p>
        <p className="mt-3 text-base sm:text-lg opacity-95">Groceries, Foods & More<br />Delivered Fast to Your Door</p>
      </div>
      <div className="relative my-auto flex flex-1 items-center justify-center py-2 min-h-0">
        <img src={rider} alt="Snalo delivery rider" width={1024} height={1024} className="h-auto max-h-[30vh] w-auto max-w-[240px] sm:max-w-[280px] object-contain animate-ride" />
      </div>
      <div className="mt-auto rounded-t-[2rem] bg-background px-6 pb-[max(env(safe-area-inset-bottom),1.75rem)] pt-6 text-center text-foreground shadow-lg">
        <div className="mb-4 flex justify-center gap-1.5"><span className="h-1.5 w-6 rounded-full bg-primary" /><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" /><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" /></div>
        <PrimaryBtn onClick={() => go("login")}>Get Started <ChevronRight className="h-5 w-5" /></PrimaryBtn>
        <p className="mt-3.5 text-sm text-muted-foreground">Already have an account? <button onClick={() => go("login")} className="font-semibold text-primary">Login</button></p>
      </div>
    </div>
  );
}

function Login({ go, isWhatsApp }: { go: (s: Screen) => void; isWhatsApp?: boolean }) {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("johnsmith@gmail.com");
  const [pw, setPw] = useState("password");
  return (
    <div className="flex h-full flex-col px-6 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),1.5rem)] overflow-y-auto no-scrollbar">
      <InstallButton isWhatsApp={isWhatsApp} />
      <div className="mx-auto mt-4 grid h-16 w-16 place-items-center rounded-2xl bg-accent text-primary shadow-sm"><Bike className="h-8 w-8" /></div>
      <h1 className="mt-5 text-center text-2xl font-bold">Welcome Back</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">Login to continue your delivery journey</p>
      <form onSubmit={(e) => { e.preventDefault(); go("home"); }} className="mt-6 space-y-3">
        <label className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3.5">
          <Mail className="h-5 w-5 text-primary shrink-0" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email Address" className="flex-1 bg-transparent text-sm outline-none" />
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3.5">
          <Lock className="h-5 w-5 text-primary shrink-0" />
          <input value={pw} onChange={(e) => setPw(e.target.value)} type={show ? "text" : "password"} placeholder="Password" className="flex-1 bg-transparent text-sm outline-none" />
          <button type="button" onClick={() => setShow(!show)} aria-label="Toggle password" className="p-1"><Eye className="h-5 w-5 text-muted-foreground" /></button>
        </label>
        <p className="text-right text-xs font-semibold text-primary">Forgot Password?</p>
        <div className="pt-2"><PrimaryBtn>Login</PrimaryBtn></div>
      </form>
      <p className="mt-auto pt-6 text-center text-sm text-muted-foreground">Don't have an account? <button onClick={() => go("home")} className="font-semibold text-primary">Sign Up</button></p>
    </div>
  );
}

type ShopProps = {
  go: (s: Screen) => void;
  add: (id: string) => void;
  cart: Record<string, number>;
  count: number;
  products?: Product[];
  categories?: { n: string; e: string }[];
  stores?: string[];
};

function HomeScreen({
  go,
  add,
  count,
  openDrawer,
  waContext,
  customer,
  products = PRODUCTS,
  categories = CATS,
  stores = SHOPS,
}: ShopProps & {
  openDrawer: () => void;
  waContext: WhatsAppContext;
  customer: { name: string; phone: string; address: string };
}) {
  return (
    <div className="px-5 pb-6 pt-[max(env(safe-area-inset-top),1.25rem)]">
      {waContext.isWhatsApp && (
        <div className="mb-3 flex items-center justify-between rounded-2xl bg-emerald-500/15 border border-emerald-500/25 px-3.5 py-2 text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2 font-semibold">
            <WhatsAppIcon className="h-4 w-4 text-emerald-600 fill-current" />
            <span>WhatsApp Order Mode</span>
          </div>
          <span className="font-semibold text-[11px] opacity-90 truncate max-w-[150px]">
            {customer.name || (customer.phone ? `+${customer.phone}` : "Chatbot Connected")}
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={openDrawer} aria-label="Menu" className="rounded-full p-2 hover:bg-muted active:scale-90 transition"><Menu className="h-6 w-6" /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Deliver to</p>
          <p className="flex items-center gap-1 font-bold text-sm truncate"><MapPin className="h-4 w-4 text-primary shrink-0" />{customer.address}</p>
        </div>
        <button onClick={() => go("notifications")} aria-label="Notifications" className="relative rounded-full p-2 hover:bg-muted active:scale-90 transition">
          <Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </button>
        <CartBtn count={count} go={go} />
      </div>
      <button onClick={() => go("products")} className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground active:scale-[0.99] transition"><Search className="h-4 w-4 text-primary" />Search groceries...</button>

      <div className="relative mt-4 overflow-hidden rounded-3xl bg-promo p-5 text-primary-foreground">
        <h2 className="max-w-[62%] text-lg sm:text-xl font-extrabold leading-tight">FAST DELIVERY AT YOUR DOORSTEP</h2>
        <p className="mt-1 text-xs opacity-90">Groceries, Foods & More</p>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => go("products")} className="rounded-full bg-background px-4 py-1.5 text-xs font-semibold text-primary active:scale-95 transition">Order Now →</button>
          <a
            href={`https://wa.me/${waContext.botPhone}?text=Hi`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="grid h-8 w-8 place-items-center rounded-full bg-[#25D366] text-white shadow-card transition active:scale-90 hover:brightness-105"
          >
            <WhatsAppIcon className="h-4 w-4 fill-current" />
          </a>
        </div>
        <img src={basket} alt="" width={1024} height={1024} className="absolute -bottom-3 -right-4 w-36 sm:w-40 pointer-events-none" />
      </div>

      <Section title="Categories" onAll={() => go("products")} />
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
        {categories.map((c) => (
          <button key={c.n} onClick={() => go("products")} className="flex min-w-[76px] flex-1 flex-col items-center gap-1.5 rounded-2xl bg-card py-3 px-2 shadow-card transition active:scale-95">
            <span className="text-2xl">{c.e}</span><span className="text-[11px] font-semibold whitespace-nowrap">{c.n}</span>
          </button>
        ))}
      </div>

      <Section title="Best Selling" onAll={() => go("products")} />
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {products.slice(0, 3).map((p) => (
          <div key={p.id} className="rounded-2xl bg-card p-2.5 shadow-card flex flex-col justify-between">
            <div className="grid place-items-center">
              <img
                src={p.img}
                alt={p.name}
                loading="lazy"
                className="h-16 w-full object-contain"
                onError={(e) => {
                  const fallback = PRODUCTS.find((x) => x.id === p.id)?.img;
                  if (fallback && e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback;
                  }
                }}
              />
            </div>
            <p className="mt-1 truncate text-xs font-semibold">{p.name}</p>
            <p className="text-[10px] text-muted-foreground">{p.unit}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold">R {p.price}</span>
              <button onClick={() => add(p.id)} aria-label={`Add ${p.name}`} className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90 transition"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-accent p-3">
        <Truck className="h-6 w-6 text-primary shrink-0" />
        <div className="flex-1"><p className="text-sm font-bold text-primary">FREE DELIVERY</p><p className="text-xs text-muted-foreground">On orders above R150</p></div>
        <button onClick={() => go("products")} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95 transition">Shop Now</button>
      </div>

      <Section title="Popular Shops" />
      <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
        {stores.map((s) => (
          <button key={s} onClick={() => go("products")} className="flex min-w-[88px] flex-1 flex-col items-center gap-1.5 rounded-2xl bg-card p-3 shadow-card transition hover:brightness-95 active:scale-95 shrink-0">
            <Store className="h-6 w-6 text-primary" /><span className="text-[11px] font-semibold whitespace-nowrap">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
function Section({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between">
      <h3 className="font-bold">{title}</h3>
      {onAll && <button onClick={onAll} className="text-xs font-semibold text-primary">View all</button>}
    </div>
  );
}

function Products({ go, add, count, products = PRODUCTS, categories = CATS }: ShopProps) {
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const catNames = ["All", ...Array.from(new Set(categories.map((c) => c.n)))];
  const list = products.filter((p) => (cat === "All" || p.cat.toLowerCase() === cat.toLowerCase()) && p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="pb-6">
      <Header title="Products" sub="Snalo Fast Delivery" back={() => go("home")} right={<CartBtn count={count} go={go} />} />
      <div className="px-5">
        <label className="flex items-center gap-3 rounded-2xl bg-muted px-4 py-3"><Search className="h-4 w-4 text-primary" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groceries..." className="flex-1 bg-transparent text-sm outline-none" /></label>
        <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
          {catNames.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition ${cat === c ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>{c}</button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {list.map((p) => <ProductCard key={p.id} p={p} onAdd={() => add(p.id)} />)}
        </div>
        {list.length === 0 && <p className="mt-10 text-center text-sm text-muted-foreground">No products found.</p>}
      </div>
    </div>
  );
}

function Cart({
  go,
  add,
  cart,
  subtotal,
  products = PRODUCTS,
}: {
  go: (s: Screen) => void;
  add: (id: string, d?: number) => void;
  cart: Record<string, number>;
  subtotal: number;
  products?: Product[];
}) {
  const items = Object.entries(cart);
  const fee = subtotal > 0 ? 15 : 0;
  return (
    <div className="flex min-h-full flex-col pb-6">
      <Header title="My Cart" sub="Snalo Fast Delivery" back={() => go("home")} />
      <div className="flex-1 space-y-3 px-5">
        {items.length === 0 && (
          <div className="mt-16 text-center"><ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground" /><p className="mt-3 font-semibold">Your cart is empty</p>
            <button onClick={() => go("products")} className="mt-3 text-sm font-semibold text-primary">Start shopping →</button></div>
        )}
        {items.map(([id, q]) => {
          const p = products.find((x) => x.id === id) || PRODUCTS.find((x) => x.id === id)!;
          return (
            <div key={id} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-muted">
                <img
                  src={p.img}
                  alt={p.name}
                  loading="lazy"
                  className="h-14 w-14 object-contain"
                  onError={(e) => {
                    const fallback = PRODUCTS.find((x) => x.id === p.id)?.img;
                    if (fallback && e.currentTarget.src !== fallback) {
                      e.currentTarget.src = fallback;
                    }
                  }}
                />
              </div>
              <div className="flex-1"><p className="font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.unit}</p><p className="mt-1 font-bold text-primary">R {p.price}</p></div>
              <div className="flex flex-col items-center gap-1">
                <button onClick={() => add(id, 1)} aria-label="Increase" className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></button>
                <span className="text-sm font-semibold">{q}</span>
                <button onClick={() => add(id, -1)} aria-label="Decrease" className="grid h-7 w-7 place-items-center rounded-lg bg-muted"><Minus className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="mx-5 mt-4 rounded-2xl bg-card p-4 shadow-card">
          <Row l="Subtotal" r={`R ${subtotal}`} /><Row l="Delivery Fee" r={`R ${fee}`} />
          <div className="my-3 border-t" />
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-primary">R {subtotal + fee}</span></div>
          <div className="mt-4"><PrimaryBtn onClick={() => go("checkout")}>Proceed to Checkout <ChevronRight className="h-5 w-5" /></PrimaryBtn></div>
          <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success" />Safe and secure checkout</p>
        </div>
      )}
    </div>
  );
}
function Row({ l, r }: { l: string; r: string }) {
  return <div className="flex justify-between py-1 text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium">{r}</span></div>;
}

function Checkout({
  go,
  subtotal,
  cart,
  clear,
  waContext,
  customer,
  setCustomer,
  setLastOrder,
  products = PRODUCTS,
}: {
  go: (s: Screen) => void;
  subtotal: number;
  cart: Record<string, number>;
  clear: () => void;
  waContext: WhatsAppContext;
  customer: { name: string; phone: string; address: string };
  setCustomer: React.Dispatch<React.SetStateAction<{ name: string; phone: string; address: string }>>;
  setLastOrder: (o: OrderData) => void;
  products?: Product[];
}) {
  const [pay, setPay] = useState(waContext.isWhatsApp ? "wa" : "card");
  const [promo, setPromo] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [tempAddress, setTempAddress] = useState(customer.address);
  const fee = promo || subtotal >= 150 ? 0 : 15;

  const methods = [
    { id: "wa", t: "Confirm & Pay via WhatsApp", s: "Send full order directly to WhatsApp bot", I: WhatsAppIcon },
    { id: "cod", t: "Cash On Delivery", s: "Pay in cash when your order arrives", I: Banknote },
    { id: "card", t: "Credit / Debit Card", s: "Pay securely using your card", I: CreditCard },
    { id: "wallet", t: "Wallet", s: "Pay using your wallet balance", I: Wallet },
  ];

  const handlePlaceOrder = (sendToWhatsApp = false) => {
    const orderId = `SN-WA${Math.floor(1000 + Math.random() * 9000)}`;
    const itemsList: OrderItem[] = Object.entries(cart).map(([id, q]) => {
      const p = products.find((x) => x.id === id) || PRODUCTS.find((x) => x.id === id);
      return {
        id,
        name: p?.name || id,
        unit: p?.unit || "",
        price: p?.price || 0,
        quantity: q,
      };
    });

    const total = subtotal + fee + 5;
    const orderData: OrderData = {
      orderId,
      items: itemsList,
      subtotal,
      deliveryFee: fee,
      serviceFee: 5,
      total,
      paymentMethod: pay,
      customerName: customer.name,
      customerPhone: customer.phone,
      address: customer.address,
      ref: waContext.ref,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setLastOrder(orderData);

    // 1. Dispatch postMessage for WebView container / iframe integrations
    if (typeof window !== "undefined") {
      try {
        window.parent.postMessage(
          {
            type: "SNALO_ORDER_PLACED",
            source: "snalo-webview",
            order: orderData,
          },
          "*"
        );
      } catch (e) {}

      // Save order to backend Supabase database
      fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      }).catch((e) => console.error("Order sync error", e));
    }

    // 2. Open WhatsApp if requested or if WhatsApp pay selected
    if (sendToWhatsApp || pay === "wa") {
      const msg = buildWhatsAppOrderMessage(orderData, waContext);
      openWhatsAppMessage(waContext.botPhone, msg);
    }

    clear();
    go("tracking");
  };

  return (
    <div className="pb-6">
      <Header title="Checkout" sub="Snalo Fast Delivery" back={() => go("cart")} />
      <div className="px-5">
        {waContext.isWhatsApp && (
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-emerald-500/15 border border-emerald-500/25 p-3 text-xs text-emerald-800 dark:text-emerald-300">
            <div className="flex items-center gap-2 font-semibold">
              <WhatsAppIcon className="h-4 w-4 text-emerald-600 fill-current" />
              <span>Ordering via WhatsApp Chatbot</span>
            </div>
            <span className="font-semibold text-[11px] opacity-80 truncate max-w-[140px]">{customer.name}</span>
          </div>
        )}

        <h3 className="mb-2 font-bold">Delivery Address</h3>
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
              <MapPin className="h-5 w-5" />
            </div>
            {editingAddress ? (
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={tempAddress}
                  onChange={(e) => setTempAddress(e.target.value)}
                  placeholder="Enter your street address"
                  className="w-full rounded-xl bg-muted px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomer((prev) => ({ ...prev, address: tempAddress }));
                      setEditingAddress(false);
                    }}
                    className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAddress(false)}
                    className="rounded-lg bg-muted px-3 py-1 text-xs font-medium text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0" onClick={() => setEditingAddress(true)}>
                <p className="font-semibold text-sm">Delivery Location</p>
                <p className="text-xs text-muted-foreground break-words">{customer.address}</p>
              </div>
            )}
            {!editingAddress && (
              <button
                onClick={() => setEditingAddress(true)}
                className="text-xs font-semibold text-primary shrink-0"
              >
                Change
              </button>
            )}
          </div>
        </div>

        <h3 className="mb-2 mt-5 font-bold">Payment Method</h3>
        <div className="space-y-2">
          {methods.map(({ id, t, s, I }) => (
            <button
              key={id}
              onClick={() => setPay(id)}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-card p-3.5 text-left transition ${
                pay === id ? "border-primary" : "border-transparent shadow-card"
              }`}
            >
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-primary">
                <I className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{t}</p>
                <p className="text-xs text-muted-foreground truncate">{s}</p>
              </div>
              <span
                className={`grid h-5 w-5 place-items-center rounded-full border-2 ${
                  pay === id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40"
                }`}
              >
                {pay === id && <Check className="h-3 w-3" />}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-warning/15 p-3 text-sm">
          <Tag className="h-4 w-4 text-warning" />
          <span className="flex-1">Free delivery on orders above R150</span>
          <button onClick={() => setPromo(true)} className="font-semibold text-primary">
            {promo ? "Applied" : "Apply"}
          </button>
        </div>

        <h3 className="mb-2 mt-5 font-bold">Order Summary</h3>
        <div className="rounded-2xl bg-card p-4 shadow-card">
          <Row l="Subtotal" r={`R ${subtotal}`} />
          <Row l="Delivery Fee" r={`R ${fee}`} />
          <Row l="Service Fee" r="R 5" />
          <div className="my-2 border-t" />
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary">R {subtotal + fee + 5}</span>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {waContext.isWhatsApp || pay === "wa" ? (
            <button
              onClick={() => handlePlaceOrder(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] hover:bg-[#20ba5a] py-4 font-bold text-white shadow-card transition active:scale-[0.98]"
            >
              <WhatsAppIcon className="h-5 w-5 fill-current" />
              Send Order to WhatsApp Bot
            </button>
          ) : (
            <PrimaryBtn onClick={() => handlePlaceOrder(false)}>
              Place Order <ChevronRight className="h-5 w-5" />
            </PrimaryBtn>
          )}

          {waContext.isWhatsApp && (
            <button
              onClick={() => handlePlaceOrder(false)}
              className="w-full rounded-2xl border border-input bg-card py-3 text-xs font-semibold text-foreground hover:bg-muted active:scale-[0.98] transition"
            >
              Place Order & Track In-App Only
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Tracking({
  go,
  waContext,
  lastOrder,
}: {
  go: (s: Screen) => void;
  waContext: WhatsAppContext;
  lastOrder: OrderData | null;
}) {
  const [step, setStep] = useState(2);
  useEffect(() => {
    const t = setTimeout(() => setStep(3), 8000);
    return () => clearTimeout(t);
  }, []);
  const steps = [["Placed", "10:10 AM"], ["Preparing", "10:20 AM"], ["On Way", "10:30 AM"], ["Delivered", ""]];
  const orderId = lastOrder?.orderId || "SN1024";

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-[260px] w-full bg-muted overflow-hidden">
        <svg viewBox="0 0 390 500" className="absolute inset-0 h-full w-full bg-muted" preserveAspectRatio="xMidYMid slice">
          {[60, 140, 230, 320].map((x) => <rect key={x} x={x} y="0" width="14" height="500" className="fill-background" />)}
          {[80, 190, 300, 410].map((y) => <rect key={y} x="0" y={y} width="390" height="14" className="fill-background" />)}
          <rect x="160" y="210" width="60" height="70" rx="6" className="fill-success/20" />
          <path d="M250 0 Q280 120 360 160 T390 300" className="fill-none stroke-chart-3/30" strokeWidth="18" />
          <path d="M90 110 Q150 200 200 250 T290 390" className="fill-none stroke-primary" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div className="absolute left-[18%] top-[25%] grid h-10 w-10 place-items-center rounded-full bg-warning text-primary-foreground shadow-card"><Store className="h-5 w-5" /></div>
        <div className={`absolute grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-card ring-4 ring-primary/25 transition-all duration-[7000ms] ${step === 3 ? "left-[68%] top-[55%]" : "left-[46%] top-[38%]"}`}><Bike className="h-6 w-6" /></div>
        <div className="absolute left-[72%] top-[57%] grid h-10 w-10 place-items-center rounded-full bg-success text-primary-foreground shadow-card"><Home className="h-5 w-5" /></div>
        <button onClick={() => go("home")} aria-label="Back" className="absolute left-4 top-[max(env(safe-area-inset-top),1.25rem)] grid h-10 w-10 place-items-center rounded-full bg-background shadow-card active:scale-90 transition"><ArrowLeft className="h-5 w-5" /></button>
      </div>

      <div className="rounded-t-[2rem] bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] shadow-phone shrink-0">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-success/15 px-3 py-1 text-[10px] font-bold text-success">● LIVE TRACKING</span>
          <span className="font-mono text-xs font-semibold text-muted-foreground">Order #{orderId}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-primary shrink-0"><Bike className="h-6 w-6" /></div>
          <div><p className="font-bold">{step === 3 ? "Order Delivered!" : "Order On The Way"}</p><p className="text-xs text-muted-foreground">{step === 3 ? "Enjoy your groceries" : <>Arriving in <span className="font-semibold text-primary">15 mins</span></>}</p></div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-muted p-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground shrink-0"><User className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">John Rider</p><p className="text-xs text-muted-foreground">Delivery Partner</p></div>
          <a href={`tel:+${waContext.botPhone}`} aria-label="Call rider" className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90 transition"><Phone className="h-4 w-4" /></a>
          <a href={`https://wa.me/${waContext.botPhone}?text=Hi%2C%20I%27m%20asking%20about%20my%20Snalo%20order%20%23${orderId}`} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="grid h-9 w-9 place-items-center rounded-full bg-success text-primary-foreground active:scale-90 transition"><WhatsAppIcon className="h-4 w-4" /></a>
        </div>
        <div className="mt-5 flex justify-between">
          {steps.map(([l, t], i) => (
            <div key={l} className="flex flex-1 flex-col items-center">
              <div className="relative flex w-full justify-center">
                {i > 0 && <div className={`absolute right-1/2 top-3 h-0.5 w-full ${i <= step ? "bg-primary" : "bg-muted"}`} />}
                <span className={`relative grid h-6 w-6 place-items-center rounded-full ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i <= step && <Check className="h-3.5 w-3.5" />}</span>
              </div>
              <p className="mt-1 text-[11px] font-semibold">{l}</p><p className="text-[10px] text-muted-foreground">{i <= step ? t || "Now" : ""}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          <a
            href={`https://wa.me/${waContext.botPhone}?text=${encodeURIComponent(
              `Hi! I am tracking my Snalo order #${orderId}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] hover:bg-[#20ba5a] py-3.5 text-sm font-bold text-white shadow-card transition active:scale-[0.98]"
          >
            <WhatsAppIcon className="h-5 w-5 fill-current" />
            Chat with WhatsApp Bot
          </a>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                try {
                  window.close();
                } catch (e) {}
              }
              go("home");
            }}
            className="w-full py-2 text-center text-xs font-semibold text-muted-foreground hover:text-foreground active:scale-95 transition"
          >
            {waContext.isWhatsApp ? "Back to Store (or Close WebView)" : "Return to Store"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Profile({
  go,
  customer,
  waContext,
}: {
  go: (s: Screen) => void;
  customer: { name: string; phone: string; address: string };
  waContext: WhatsAppContext;
}) {
  const items = [
    { t: "Saved Addresses", I: MapPin },
    { t: "Payment Methods", I: CreditCard },
    { t: "Help & Support", I: HelpCircle },
    { t: "Settings", I: Settings },
  ];
  return (
    <div className="px-5 pb-6 pt-[max(env(safe-area-inset-top),2rem)]">
      <h1 className="text-center text-lg font-bold">Profile</h1>
      <div className="mx-auto mt-6 grid h-24 w-24 place-items-center rounded-full bg-primary text-primary-foreground ring-8 ring-accent"><User className="h-12 w-12" /></div>
      <p className="mt-4 text-center text-xl font-bold">{customer.name}</p>
      <p className="text-center text-sm text-muted-foreground">
        {customer.phone ? `WhatsApp: +${customer.phone}` : "johnsmith@gmail.com"}
      </p>
      {waContext.isWhatsApp && (
        <div className="mx-auto mt-2.5 flex items-center justify-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <WhatsAppIcon className="h-3.5 w-3.5 fill-current" />
          <span>Connected via WhatsApp Chatbot</span>
        </div>
      )}
      <div className="mt-6 space-y-2">
        {items.map(({ t, I }) => <ListRow key={t} t={t} I={I} />)}
        <ListRow t="Logout" I={LogOut} onClick={() => go("login")} />
      </div>
    </div>
  );
}

function ListRow({ t, I, onClick }: { t: string; I: typeof User; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 shadow-card active:scale-[0.98] transition">
      <I className="h-5 w-5 text-primary" /><span className="flex-1 text-left text-sm font-medium">{t}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function Drawer({
  go,
  close,
  waContext,
}: {
  go: (s: Screen) => void;
  close: () => void;
  waContext: WhatsAppContext;
}) {
  const items: { t: string; I: typeof User; s?: Screen; action?: () => void }[] = [
    { t: "My Profile", I: User, s: "profile" },
    { t: "My Orders", I: Package, s: "tracking" },
    { t: "Saved Addresses", I: MapPin },
    { t: "Favorites", I: Heart },
    {
      t: "Chat on WhatsApp",
      I: WhatsAppIcon,
      action: () => openWhatsAppMessage(waContext.botPhone, "Hi Snalo! I want to chat about delivery."),
    },
    { t: "Settings", I: Settings },
    { t: "Logout", I: LogOut, s: "login" },
  ];
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-foreground/50 backdrop-blur-sm animate-in fade-in" onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="space-y-1 rounded-t-[2rem] bg-background p-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] animate-in slide-in-from-bottom">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
        {items.map(({ t, I, s, action }) => (
          <button
            key={t}
            onClick={() => {
              if (action) {
                action();
                close();
              } else if (s) {
                go(s);
              } else {
                close();
              }
            }}
            className="flex w-full items-center gap-3 rounded-xl p-3 hover:bg-muted active:scale-[0.98] transition"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-primary"><I className="h-4 w-4" /></span>
            <span className="flex-1 text-left text-sm font-medium">{t}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

const NOTIFS = [
  { day: "Today", t: "Your order is on the way", s: "Estimated arrival in 15 mins", time: "4:15 PM", I: Bike, k: "Orders", c: "bg-warning/15 text-warning" },
  { day: "Today", t: "Free delivery available", s: "On orders above R150", time: "2:30 PM", I: Tag, k: "Offers", c: "bg-accent text-primary" },
  { day: "Today", t: "Order delivered", s: "Your order #SN1024 was delivered successfully.", time: "12:45 PM", I: CheckCircle2, k: "Orders", c: "bg-success/15 text-success" },
  { day: "Yesterday", t: "Order confirmed", s: "Your order #SN1024 has been confirmed.", time: "8:20 PM", I: Receipt, k: "Orders", c: "bg-warning/15 text-warning" },
  { day: "Yesterday", t: "Weekend special offer!", s: "Get 20% off on all fruits & vegetables.", time: "6:10 PM", I: Gift, k: "Offers", c: "bg-accent text-primary" },
  { day: "Yesterday", t: "New app update", s: "Faster checkout is now live.", time: "9:00 AM", I: Bell, k: "Updates", c: "bg-muted text-foreground" },
];
function Notifications({ go }: { go: (s: Screen) => void }) {
  const [tab, setTab] = useState("All");
  const [list, setList] = useState(NOTIFS);
  const shown = list.filter((n) => tab === "All" || n.k === tab);
  return (
    <div className="pb-6">
      <Header title="Notifications" back={() => go("home")} right={<button onClick={() => setList([])} aria-label="Clear all" className="p-2"><Trash2 className="h-5 w-5" /></button>} />
      <div className="px-5">
        <div className="flex gap-2">
          {["All", "Orders", "Offers", "Updates"].map((c) => (
            <button key={c} onClick={() => setTab(c)} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${tab === c ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{c}</button>
          ))}
        </div>
        {shown.length === 0 && <p className="mt-16 text-center text-sm text-muted-foreground">You're all caught up.</p>}
        {["Today", "Yesterday"].map((d) => {
          const g = shown.filter((n) => n.day === d);
          if (!g.length) return null;
          return (
            <div key={d}>
              <p className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">{d}</p>
              <div className="space-y-2">
                {g.map(({ t, s, time, I, c }) => (
                  <div key={t} className="flex gap-3 rounded-2xl bg-card p-3 shadow-card">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${c}`}><I className="h-5 w-5" /></span>
                    <div className="flex-1"><p className="text-sm font-semibold">{t}</p><p className="text-xs text-muted-foreground">{s}</p></div>
                    <div className="flex flex-col items-end gap-2"><span className="text-[10px] text-muted-foreground">{time}</span><span className="h-2 w-2 rounded-full bg-primary" /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TabBar({ screen, go, count }: { screen: Screen; go: (s: Screen) => void; count: number }) {
  const tabs: { t: string; I: typeof User; s: Screen }[] = [
    { t: "Home", I: Home, s: "home" }, { t: "Orders", I: Receipt, s: "tracking" },
    { t: "Cart", I: ShoppingCart, s: "cart" }, { t: "Profile", I: User, s: "profile" },
  ];
  return (
    <nav className="flex justify-around border-t bg-background/95 px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
      {tabs.map(({ t, I, s }) => {
        const active = screen === s;
        return (
          <button key={t} onClick={() => go(s)} className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition active:scale-95 ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <I className="h-5 w-5" />{active && t}
            {s === "cart" && count > 0 && !active && <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-primary" />}
          </button>
        );
      })}
    </nav>
  );
}
