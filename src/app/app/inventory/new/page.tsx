import { redirect } from "next/navigation";

/** Legacy URL — Add Product now starts with Item vs Dish chooser. */
export default function LegacyNewProductPage() {
  redirect("/app/products/new");
}
