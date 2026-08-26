/**
 * Copy and content for the public TRiBE site.
 *
 * Locations, opening hours and menu items follow the real tribemalta.com
 * listings. Photography is hot-linked from Unsplash for the demo; swap the
 * `image` fields for your own assets.
 */

export const CONTACT = {
  phone: "+356 2713 4638",
  phoneHref: "tel:+35627134638",
  email: "joinus@tribemalta.com",
  instagram: "https://www.instagram.com/tribemalta/",
};

export type Location = {
  slug: string;
  name: string;
  address: string;
  hours: string;
  image: string;
};

export const LOCATIONS: Location[] = [
  {
    slug: "balluta",
    name: "Balluta",
    address: "Balluta Buildings, Shop 5, Pjazza Balluta, St Julian's",
    hours: "Monday – Sunday: 08:00 – 18:00",
    image:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=70",
  },
  {
    slug: "mercury-tower",
    name: "Mercury Tower",
    address: "Mercury Tower, St Julian's",
    hours: "Monday – Sunday: 10:00 – 21:00",
    image:
      "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=70",
  },
  {
    slug: "naxxar",
    name: "Naxxar",
    address: "Behind the main church, 9A Parish Street, Naxxar",
    hours: "Monday – Sunday: 07:30 – 19:00",
    image:
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=70",
  },
  {
    slug: "san-gwann",
    name: "San Gwann",
    address: "Corner with Triq in-Narcis, Felic Borg, San Gwann",
    hours: "Monday – Sunday: 07:00 – 16:00",
    image:
      "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=900&q=70",
  },
  {
    slug: "valletta",
    name: "Valletta",
    address: "84, South Street, Valletta",
    hours: "Monday – Sunday: 07:00 – 21:00",
    image:
      "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=70",
  },
];

export type Diet = "G" | "D" | "N" | "V" | "VG";

export const DIET_LABELS: Record<Diet, string> = {
  G: "Contains gluten",
  D: "Contains dairy",
  N: "Contains nuts",
  V: "Vegetarian",
  VG: "Vegan",
};

export type Dish = {
  name: string;
  description: string;
  diets: Diet[];
  tags?: string[];
  price: string;
  image: string;
};

export const DISHES: Dish[] = [
  {
    name: "Chunky Monkey",
    description:
      "2 stack fluffy pancakes, banana, peanut butter, dulce de leche, crushed peanuts",
    diets: ["G", "D", "N"],
    price: "€12.50",
    image:
      "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=1000&q=70",
  },
  {
    name: "Double Bacon Cheese",
    description:
      "Double 110g beef patties, crispy bacon, bacon jam, cheddar cheese, tangy burger sauce, TRiBE brioche bun, house spiced fries",
    diets: ["G", "D"],
    price: "€16.90",
    image:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=70",
  },
  {
    name: "Sweetchick!",
    description:
      "Breaded chicken breast, fried hen's egg, bacon jam, slaw, dill pickled cucumber, honey mustard, brioche bun",
    diets: ["G", "D"],
    tags: ["Signature", "Favorite"],
    price: "€15.50",
    image:
      "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1000&q=70",
  },
  {
    name: "Steak & Shine",
    description:
      "Beef flank tagliata, chimichurri, caramelised & crispy onions, slaw, fried hen's egg, TRiBE sourdough slice",
    diets: ["G", "D"],
    price: "€18.90",
    image:
      "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=1000&q=70",
  },
  {
    name: "Green Goddess Toast",
    description:
      "Smashed avocado, heritage tomato, cucumber ribbons, everything-bagel seasoning, TRiBE sourdough",
    diets: ["G", "VG"],
    tags: ["Vegan"],
    price: "€11.90",
    image:
      "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=1000&q=70",
  },
  {
    name: "Berry Bowl",
    description:
      "House granola, coconut yoghurt, blueberries, strawberries, cacao nibs, maple drizzle",
    diets: ["N", "VG"],
    price: "€10.50",
    image:
      "https://images.unsplash.com/photo-1590301157890-4810ed352733?auto=format&fit=crop&w=1000&q=70",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  outlet: string;
  when: string;
  stars: number;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "The cafe has a very comfortable atmosphere, enhanced by the presence of friendly and welcoming staff. They always make you feel part of the tribe.",
    name: "Evren Gorsen",
    outlet: "San Gwann",
    when: "2 years ago",
    stars: 5,
  },
  {
    quote:
      "The most friendly service! Food and cake menu is brilliant. I loved what I ordered — very unique and quirky cafe. The coffee is spot on too.",
    name: "Ryan Jordan",
    outlet: "Naxxar",
    when: "3 weeks ago",
    stars: 5,
  },
  {
    quote:
      "Warm hospitality, great vibes. They have even lactose free options for coffee. Food is not only delicious but beautifully plated.",
    name: "Marija Said",
    outlet: "Naxxar",
    when: "8 months ago",
    stars: 5,
  },
  {
    quote:
      "Came for brunch and stayed until the afternoon. Every plate that came out looked better than the last. Our new Sunday spot.",
    name: "Daniel Attard",
    outlet: "Balluta",
    when: "1 month ago",
    stars: 5,
  },
];

export const MERCH = [
  {
    name: "TRiBE Tee",
    price: "€24.00",
    image:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=70",
  },
  {
    name: "TRiBE Tote Bag",
    price: "€16.00",
    image:
      "https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=800&q=70",
  },
  {
    name: "TRiBE Keep Cup",
    price: "€22.00",
    image:
      "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=70",
  },
  {
    name: "TRiBE Cap",
    price: "€19.00",
    image:
      "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=70",
  },
];

export const GALLERY = [
  "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=700&q=70",
  "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=700&q=70",
  "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=700&q=70",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=700&q=70",
  "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=700&q=70",
  "https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&w=700&q=70",
];

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/our-story", label: "Our story" },
  { href: "/locations", label: "Locations" },
  { href: "/menu", label: "Menu" },
  { href: "/events", label: "Events" },
  { href: "/shop", label: "Shop" },
];
