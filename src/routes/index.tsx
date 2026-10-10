import { createFileRoute } from "@tanstack/react-router";
import SnaloApp from "@/components/snalo/SnaloApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Snalo Fast Delivery — Grocery Delivery Demo" },
      { name: "description", content: "Interactive demo of Snalo, a fast grocery delivery app." },
      { property: "og:title", content: "Snalo Fast Delivery — Grocery Delivery Demo" },
      { property: "og:description", content: "Browse groceries, fill your cart, check out and track your order live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SnaloApp,
});
