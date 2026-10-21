import "dotenv/config";

import bcrypt from "bcryptjs";

import { prisma } from "../src/lib/db";
import {
  AREA_BOTH,
  CATEGORY_AREAS,
  LINE_SOURCE,
  PHOTO_STATUS,
  ROLES,
  STOCK_AREAS,
  STOCK_TAKE_STATUS,
} from "../src/lib/constants";

/**
 * Stand-in shelf photography for the seeded history. Real uploads land in
 * /public/uploads, but demo data has no files on disk so it points at remote
 * images instead.
 */
const SHELF_PHOTOS = [
  "https://images.unsplash.com/photo-1584225064785-c62a8b43d148?auto=format&fit=crop&w=1200&q=70",
  "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=70",
  "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1200&q=70",
  "https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=1200&q=70",
];

const DEMO_PASSWORD = "tribe1234";

type ItemSeed = {
  sku: string;
  name: string;
  brand?: string;
  unit: string;
  packSize?: string;
  referencePrice: number;
  parLevel: number;
  lowStockThreshold: number;
  aliases?: string;
};

const CATALOGUE: Record<string, ItemSeed[]> = {
  "Coffee & Tea": [
    { sku: "COF-001", name: "Espresso Beans 1kg", brand: "Tribe House Blend", unit: "bag", packSize: "1 kg", referencePrice: 18.5, parLevel: 12, lowStockThreshold: 4, aliases: "house blend,coffee beans,espresso beans" },
    { sku: "COF-002", name: "Decaf Beans 1kg", brand: "Tribe", unit: "bag", packSize: "1 kg", referencePrice: 19.9, parLevel: 4, lowStockThreshold: 1, aliases: "decaf,decaffeinated beans" },
    { sku: "COF-003", name: "Matcha Powder 250g", brand: "Kyoto Green", unit: "tin", packSize: "250 g", referencePrice: 24, parLevel: 3, lowStockThreshold: 1, aliases: "matcha,green tea powder" },
    { sku: "TEA-001", name: "English Breakfast Tea", brand: "Leaf & Co", unit: "box", packSize: "100 bags", referencePrice: 8.4, parLevel: 6, lowStockThreshold: 2, aliases: "breakfast tea,black tea" },
    { sku: "TEA-002", name: "Peppermint Tea", brand: "Leaf & Co", unit: "box", packSize: "100 bags", referencePrice: 8.9, parLevel: 4, lowStockThreshold: 1, aliases: "mint tea,peppermint" },
    { sku: "COF-004", name: "Chai Concentrate 1L", brand: "Spice Route", unit: "bottle", packSize: "1 L", referencePrice: 11.75, parLevel: 6, lowStockThreshold: 2, aliases: "chai,chai syrup" },
  ],
  "Dairy & Alternatives": [
    { sku: "DAI-001", name: "Whole Milk 1L", brand: "Benna", unit: "bottle", packSize: "1 L", referencePrice: 1.35, parLevel: 60, lowStockThreshold: 18, aliases: "milk,full fat milk,whole milk" },
    { sku: "DAI-002", name: "Oat Milk Barista 1L", brand: "Oatly", unit: "carton", packSize: "1 L", referencePrice: 2.15, parLevel: 48, lowStockThreshold: 12, aliases: "oat milk,oatly,barista oat" },
    { sku: "DAI-003", name: "Almond Milk 1L", brand: "Alpro", unit: "carton", packSize: "1 L", referencePrice: 2.05, parLevel: 24, lowStockThreshold: 6, aliases: "almond milk,alpro almond" },
    { sku: "DAI-004", name: "Coconut Milk 1L", brand: "Alpro", unit: "carton", packSize: "1 L", referencePrice: 2.25, parLevel: 12, lowStockThreshold: 4, aliases: "coconut milk" },
    { sku: "DAI-005", name: "Greek Yoghurt 5kg", brand: "Fage", unit: "tub", packSize: "5 kg", referencePrice: 21.4, parLevel: 6, lowStockThreshold: 2, aliases: "yoghurt,greek yogurt,fage" },
    { sku: "DAI-006", name: "Butter Unsalted 500g", brand: "Kerrygold", unit: "block", packSize: "500 g", referencePrice: 4.65, parLevel: 20, lowStockThreshold: 6, aliases: "butter,unsalted butter" },
    { sku: "DAI-007", name: "Cheddar Mature 2kg", brand: "Cathedral City", unit: "block", packSize: "2 kg", referencePrice: 18.9, parLevel: 8, lowStockThreshold: 2, aliases: "cheddar,cheese" },
    { sku: "DAI-008", name: "Halloumi 250g", brand: "Petrou", unit: "pack", packSize: "250 g", referencePrice: 3.4, parLevel: 24, lowStockThreshold: 8, aliases: "halloumi,grilling cheese" },
    { sku: "DAI-009", name: "Free Range Eggs", brand: "Malta Farm", unit: "tray", packSize: "30 eggs", referencePrice: 6.8, parLevel: 24, lowStockThreshold: 8, aliases: "eggs,free range eggs,egg tray" },
    { sku: "DAI-010", name: "Vegan Cream Cheese 1kg", brand: "Violife", unit: "tub", packSize: "1 kg", referencePrice: 9.5, parLevel: 6, lowStockThreshold: 2, aliases: "vegan cheese,violife,cream cheese" },
  ],
  "Bakery": [
    { sku: "BAK-001", name: "Sourdough Loaf", brand: "Tribe Bakery", unit: "loaf", referencePrice: 3.2, parLevel: 40, lowStockThreshold: 12, aliases: "sourdough,bread,loaf" },
    { sku: "BAK-002", name: "Brioche Bun", brand: "Tribe Bakery", unit: "unit", referencePrice: 0.75, parLevel: 120, lowStockThreshold: 40, aliases: "brioche,burger bun,bun" },
    { sku: "BAK-003", name: "Croissant Butter", brand: "Tribe Bakery", unit: "unit", referencePrice: 1.1, parLevel: 80, lowStockThreshold: 24, aliases: "croissant,butter croissant" },
    { sku: "BAK-004", name: "Gluten Free Bread", brand: "Schar", unit: "loaf", referencePrice: 4.1, parLevel: 12, lowStockThreshold: 4, aliases: "gluten free bread,gf bread" },
    { sku: "BAK-005", name: "Banana Bread Slice", brand: "Tribe Bakery", unit: "slice", referencePrice: 2.4, parLevel: 30, lowStockThreshold: 8, aliases: "banana bread" },
    { sku: "BAK-006", name: "Bagel Plain", brand: "Tribe Bakery", unit: "unit", referencePrice: 0.9, parLevel: 60, lowStockThreshold: 20, aliases: "bagel,plain bagel" },
  ],
  "Fruit & Veg": [
    { sku: "FRV-001", name: "Avocado", unit: "unit", referencePrice: 1.45, parLevel: 120, lowStockThreshold: 30, aliases: "avocado,avo,hass avocado" },
    { sku: "FRV-002", name: "Bananas", unit: "kg", referencePrice: 1.65, parLevel: 30, lowStockThreshold: 8, aliases: "banana,bananas" },
    { sku: "FRV-003", name: "Blueberries 125g", unit: "punnet", packSize: "125 g", referencePrice: 2.6, parLevel: 36, lowStockThreshold: 10, aliases: "blueberries,berries" },
    { sku: "FRV-004", name: "Strawberries 250g", unit: "punnet", packSize: "250 g", referencePrice: 2.9, parLevel: 30, lowStockThreshold: 8, aliases: "strawberries" },
    { sku: "FRV-005", name: "Cherry Tomatoes 500g", unit: "punnet", packSize: "500 g", referencePrice: 2.2, parLevel: 24, lowStockThreshold: 6, aliases: "cherry tomatoes,tomatoes" },
    { sku: "FRV-006", name: "Baby Spinach 1kg", unit: "bag", packSize: "1 kg", referencePrice: 5.4, parLevel: 12, lowStockThreshold: 4, aliases: "spinach,baby spinach,greens" },
    { sku: "FRV-007", name: "Lemons", unit: "kg", referencePrice: 2.1, parLevel: 20, lowStockThreshold: 6, aliases: "lemon,lemons" },
    { sku: "FRV-008", name: "Limes", unit: "kg", referencePrice: 3.4, parLevel: 15, lowStockThreshold: 5, aliases: "lime,limes" },
    { sku: "FRV-009", name: "Fresh Mint", unit: "bunch", referencePrice: 0.85, parLevel: 40, lowStockThreshold: 12, aliases: "mint,fresh mint,mint bunch" },
    { sku: "FRV-010", name: "Oranges Juicing", unit: "kg", referencePrice: 1.55, parLevel: 60, lowStockThreshold: 20, aliases: "oranges,juicing oranges,orange" },
  ],
  "Dry Goods": [
    { sku: "DRY-001", name: "Rolled Oats 5kg", brand: "Flahavan's", unit: "bag", packSize: "5 kg", referencePrice: 9.8, parLevel: 8, lowStockThreshold: 2, aliases: "oats,rolled oats,porridge oats" },
    { sku: "DRY-002", name: "Granola House 3kg", brand: "Tribe", unit: "bag", packSize: "3 kg", referencePrice: 16.5, parLevel: 6, lowStockThreshold: 2, aliases: "granola,house granola" },
    { sku: "DRY-003", name: "Maple Syrup 1L", brand: "Clarks", unit: "bottle", packSize: "1 L", referencePrice: 12.9, parLevel: 8, lowStockThreshold: 2, aliases: "maple syrup,syrup" },
    { sku: "DRY-004", name: "Olive Oil Extra Virgin 5L", brand: "Zejtun", unit: "tin", packSize: "5 L", referencePrice: 38.5, parLevel: 6, lowStockThreshold: 2, aliases: "olive oil,evoo" },
    { sku: "DRY-005", name: "Sea Salt Flakes 1kg", brand: "Maldon", unit: "box", packSize: "1 kg", referencePrice: 11.2, parLevel: 4, lowStockThreshold: 1, aliases: "salt,sea salt,maldon" },
    { sku: "DRY-006", name: "Chickpeas Tinned 2.5kg", unit: "tin", packSize: "2.5 kg", referencePrice: 4.3, parLevel: 12, lowStockThreshold: 4, aliases: "chickpeas,garbanzo" },
    { sku: "DRY-007", name: "Peanut Butter 1kg", brand: "Meridian", unit: "tub", packSize: "1 kg", referencePrice: 8.7, parLevel: 8, lowStockThreshold: 2, aliases: "peanut butter,pb" },
    { sku: "DRY-008", name: "Cacao Nibs 1kg", unit: "bag", packSize: "1 kg", referencePrice: 14.2, parLevel: 3, lowStockThreshold: 1, aliases: "cacao nibs,cocoa nibs" },
  ],
  "Spirits": [
    { sku: "SPI-001", name: "Gin London Dry 70cl", brand: "Beefeater", unit: "bottle", packSize: "70 cl", referencePrice: 16.4, parLevel: 12, lowStockThreshold: 3, aliases: "gin,beefeater,london dry" },
    { sku: "SPI-002", name: "Vodka 70cl", brand: "Absolut", unit: "bottle", packSize: "70 cl", referencePrice: 15.8, parLevel: 12, lowStockThreshold: 3, aliases: "vodka,absolut" },
    { sku: "SPI-003", name: "White Rum 70cl", brand: "Bacardi", unit: "bottle", packSize: "70 cl", referencePrice: 15.2, parLevel: 10, lowStockThreshold: 3, aliases: "rum,white rum,bacardi" },
    { sku: "SPI-004", name: "Tequila Blanco 70cl", brand: "Olmeca", unit: "bottle", packSize: "70 cl", referencePrice: 18.9, parLevel: 8, lowStockThreshold: 2, aliases: "tequila,olmeca,blanco" },
    { sku: "SPI-005", name: "Aperol 1L", brand: "Aperol", unit: "bottle", packSize: "1 L", referencePrice: 17.5, parLevel: 14, lowStockThreshold: 4, aliases: "aperol,spritz" },
    { sku: "SPI-006", name: "Espresso Liqueur 70cl", brand: "Kahlua", unit: "bottle", packSize: "70 cl", referencePrice: 19.3, parLevel: 6, lowStockThreshold: 2, aliases: "kahlua,coffee liqueur,espresso liqueur" },
  ],
  "Wine & Beer": [
    { sku: "WIN-001", name: "Prosecco DOC 75cl", brand: "Ca' Bianca", unit: "bottle", packSize: "75 cl", referencePrice: 9.4, parLevel: 36, lowStockThreshold: 12, aliases: "prosecco,sparkling wine" },
    { sku: "WIN-002", name: "House White 75cl", brand: "Marsovin", unit: "bottle", packSize: "75 cl", referencePrice: 7.2, parLevel: 30, lowStockThreshold: 10, aliases: "white wine,house white" },
    { sku: "WIN-003", name: "House Red 75cl", brand: "Marsovin", unit: "bottle", packSize: "75 cl", referencePrice: 7.2, parLevel: 24, lowStockThreshold: 8, aliases: "red wine,house red" },
    { sku: "WIN-004", name: "Rose Provence 75cl", brand: "Cote des Roses", unit: "bottle", packSize: "75 cl", referencePrice: 11.8, parLevel: 18, lowStockThreshold: 6, aliases: "rose,rose wine,provence" },
    { sku: "BEE-001", name: "Cisk Lager 33cl", brand: "Cisk", unit: "bottle", packSize: "33 cl", referencePrice: 1.1, parLevel: 144, lowStockThreshold: 48, aliases: "cisk,lager,beer" },
    { sku: "BEE-002", name: "Craft IPA 33cl", brand: "Lord Chambray", unit: "bottle", packSize: "33 cl", referencePrice: 2.3, parLevel: 72, lowStockThreshold: 24, aliases: "ipa,craft beer,lord chambray" },
    { sku: "BEE-003", name: "Alcohol Free Lager 33cl", brand: "Heineken 0.0", unit: "bottle", packSize: "33 cl", referencePrice: 1.25, parLevel: 48, lowStockThreshold: 12, aliases: "heineken 0.0,alcohol free beer,non alcoholic beer" },
  ],
  "Soft Drinks": [
    { sku: "SOF-001", name: "Kinnie 25cl", brand: "Kinnie", unit: "bottle", packSize: "25 cl", referencePrice: 0.85, parLevel: 96, lowStockThreshold: 30, aliases: "kinnie" },
    { sku: "SOF-002", name: "Coca-Cola 33cl", brand: "Coca-Cola", unit: "can", packSize: "33 cl", referencePrice: 0.72, parLevel: 120, lowStockThreshold: 36, aliases: "coke,coca cola,cola" },
    { sku: "SOF-003", name: "Sparkling Water 75cl", brand: "San Pellegrino", unit: "bottle", packSize: "75 cl", referencePrice: 1.15, parLevel: 72, lowStockThreshold: 24, aliases: "sparkling water,pellegrino,fizzy water" },
    { sku: "SOF-004", name: "Still Water 75cl", brand: "Kristal", unit: "bottle", packSize: "75 cl", referencePrice: 0.68, parLevel: 96, lowStockThreshold: 30, aliases: "still water,water,mineral water" },
    { sku: "SOF-005", name: "Tonic Water 20cl", brand: "Schweppes", unit: "bottle", packSize: "20 cl", referencePrice: 0.78, parLevel: 96, lowStockThreshold: 24, aliases: "tonic,tonic water,schweppes" },
    { sku: "SOF-006", name: "Kombucha Ginger 33cl", brand: "Remedy", unit: "bottle", packSize: "33 cl", referencePrice: 2.4, parLevel: 36, lowStockThreshold: 12, aliases: "kombucha,remedy kombucha" },
  ],
  "Packaging": [
    { sku: "PAC-001", name: "Takeaway Cup 12oz", unit: "sleeve", packSize: "50 cups", referencePrice: 6.4, parLevel: 20, lowStockThreshold: 6, aliases: "takeaway cup,coffee cup,paper cup" },
    { sku: "PAC-002", name: "Cup Lid 12oz", unit: "sleeve", packSize: "50 lids", referencePrice: 3.8, parLevel: 20, lowStockThreshold: 6, aliases: "cup lid,lids" },
    { sku: "PAC-003", name: "Kraft Food Box", unit: "pack", packSize: "100 boxes", referencePrice: 14.5, parLevel: 12, lowStockThreshold: 4, aliases: "food box,kraft box,takeaway box" },
    { sku: "PAC-004", name: "Paper Straw", unit: "box", packSize: "500 straws", referencePrice: 7.9, parLevel: 8, lowStockThreshold: 2, aliases: "straw,paper straws" },
    { sku: "PAC-005", name: "Napkins Recycled", unit: "pack", packSize: "1000 napkins", referencePrice: 9.2, parLevel: 10, lowStockThreshold: 3, aliases: "napkins,serviettes" },
  ],
  "Merch": [
    { sku: "MER-001", name: "TRiBE Tee Sand", unit: "unit", packSize: "M", referencePrice: 12, parLevel: 20, lowStockThreshold: 5, aliases: "t shirt,tee,tribe tee" },
    { sku: "MER-002", name: "TRiBE Tote Bag", unit: "unit", referencePrice: 8.5, parLevel: 25, lowStockThreshold: 6, aliases: "tote,tote bag,bag" },
    { sku: "MER-003", name: "TRiBE Keep Cup", unit: "unit", referencePrice: 14, parLevel: 18, lowStockThreshold: 4, aliases: "keep cup,reusable cup,travel mug" },
    { sku: "MER-004", name: "TRiBE Cap", unit: "unit", referencePrice: 11, parLevel: 15, lowStockThreshold: 4, aliases: "cap,hat,baseball cap" },
  ],
};

// Mirrors the five real TRiBE outlets listed on tribemalta.com.
const OUTLETS = [
  {
    name: "TRiBE Valletta",
    slug: "valletta",
    address: "84, South Street, Valletta",
    city: "Valletta",
    phone: "+356 2713 4638",
    adminName: "Sara Borg",
    adminEmail: "valletta@tribemalta.com",
    /** Multiplier applied to par levels to create a distinct stock profile. */
    fill: 0.82,
    priceDrift: 1,
  },
  {
    name: "TRiBE Balluta",
    slug: "balluta",
    address: "Balluta Buildings, Shop 5, Pjazza Balluta, St Julian's",
    city: "St Julian's",
    phone: "+356 2713 4638",
    adminName: "Marta Vella",
    adminEmail: "balluta@tribemalta.com",
    fill: 0.64,
    priceDrift: 1.04,
  },
  {
    name: "TRiBE Mercury Tower",
    slug: "mercury-tower",
    address: "Mercury Tower, St Julian's",
    city: "St Julian's",
    phone: "+356 2713 4638",
    adminName: "Luke Camilleri",
    adminEmail: "mercury@tribemalta.com",
    fill: 0.45,
    priceDrift: 1.08,
  },
  {
    name: "TRiBE Naxxar",
    slug: "naxxar",
    address: "Behind the main church, 9A Parish Street, Naxxar",
    city: "Naxxar",
    phone: "+356 2713 4638",
    adminName: "Andre Zammit",
    adminEmail: "naxxar@tribemalta.com",
    fill: 0.93,
    priceDrift: 0.97,
  },
  {
    name: "TRiBE San Gwann",
    slug: "san-gwann",
    address: "Corner with Triq in-Narcis, Felic Borg, San Gwann",
    city: "San Gwann",
    phone: "+356 2713 4638",
    adminName: "Elena Muscat",
    adminEmail: "sangwann@tribemalta.com",
    fill: 0.71,
    priceDrift: 1.02,
  },
];

/** Deterministic generator so repeated seeds produce identical demo data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20260826);

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

async function main() {
  console.log("Clearing existing data…");
  await prisma.activityLog.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.transferLine.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.wastage.deleteMany();
  await prisma.deliveryLine.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.photoDetection.deleteMany();
  await prisma.stockTakeLine.deleteMany();
  await prisma.stockPhoto.deleteMany();
  await prisma.stockTake.deleteMany();
  await prisma.outletStock.deleteMany();
  await prisma.dishIngredient.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.dish.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.outlet.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  console.log("Creating outlets and users…");
  const outlets = [];
  for (const outletSeed of OUTLETS) {
    const outlet = await prisma.outlet.create({
      data: {
        name: outletSeed.name,
        slug: outletSeed.slug,
        address: outletSeed.address,
        city: outletSeed.city,
        phone: outletSeed.phone,
      },
    });

    await prisma.user.create({
      data: {
        email: outletSeed.adminEmail,
        name: outletSeed.adminName,
        passwordHash,
        role: ROLES.OUTLET_ADMIN,
        outletId: outlet.id,
      },
    });

    outlets.push({ ...outletSeed, id: outlet.id });
  }

  await prisma.user.create({
    data: {
      email: "super@tribemalta.com",
      name: "Nadine Grech",
      passwordHash,
      role: ROLES.SUPER_ADMIN,
    },
  });

  await prisma.user.create({
    data: {
      email: "ops@tribemalta.com",
      name: "Group Operations",
      passwordHash,
      role: ROLES.SUPER_ADMIN,
    },
  });

  console.log("Creating global inventory…");
  const items = [];
  let sortOrder = 0;

  for (const [categoryName, categoryItems] of Object.entries(CATALOGUE)) {
    const category = await prisma.category.create({
      data: {
        name: categoryName,
        sortOrder: sortOrder++,
        area: CATEGORY_AREAS[categoryName] ?? AREA_BOTH,
      },
    });

    for (const itemSeed of categoryItems) {
      const item = await prisma.inventoryItem.create({
        data: {
          sku: itemSeed.sku,
          name: itemSeed.name,
          brand: itemSeed.brand ?? null,
          categoryId: category.id,
          unit: itemSeed.unit,
          packSize: itemSeed.packSize ?? null,
          referencePrice: itemSeed.referencePrice,
          parLevel: itemSeed.parLevel,
          lowStockThreshold: itemSeed.lowStockThreshold,
          supplierPackQty: Math.max(1, Math.round(itemSeed.parLevel * 0.25)),
          aliases: itemSeed.aliases ?? "",
        },
      });

      items.push({ ...itemSeed, id: item.id });
    }
  }

  console.log("Creating outlet stock positions…");
  const now = Date.now();

  for (const outlet of outlets) {
    for (const item of items) {
      // Skip a few items per outlet so "not stocked here" is a real state.
      if (random() < 0.06) continue;

      const spread = 0.55 + random() * 0.9;
      const quantity = Math.max(
        0,
        Math.round(item.parLevel * outlet.fill * spread),
      );

      await prisma.outletStock.create({
        data: {
          outletId: outlet.id,
          itemId: item.id,
          quantity,
          unitPrice: round2(
            item.referencePrice * outlet.priceDrift * (0.98 + random() * 0.06),
          ),
          lastCountedAt: new Date(
            now - Math.floor(random() * 12 + 1) * 86_400_000,
          ),
        },
      });
    }
  }

  console.log("Creating stock take history…");
  let sequence = 1;

  for (const outlet of outlets) {
    const admin = await prisma.user.findUnique({
      where: { email: outlet.adminEmail },
    });
    if (!admin) continue;

    const sessions = 2 + Math.floor(random() * 2);

    for (let index = 0; index < sessions; index++) {
      const daysAgo = 3 + index * 7 + Math.floor(random() * 3);
      const createdAt = new Date(now - daysAgo * 86_400_000);

      const stockTake = await prisma.stockTake.create({
        data: {
          reference: `ST-2026-${String(sequence++).padStart(4, "0")}`,
          outletId: outlet.id,
          userId: admin.id,
          status: STOCK_TAKE_STATUS.SUBMITTED,
          area: index % 2 === 0 ? STOCK_AREAS.BAR : STOCK_AREAS.KITCHEN,
          note: index === 0 ? "Weekly count" : "Mid-week spot check",
          createdAt,
          submittedAt: new Date(createdAt.getTime() + 40 * 60_000),
        },
      });

      const lineCount = 6 + Math.floor(random() * 8);
      const chosen = new Set<string>();
      const aiLineIds: string[] = [];

      for (let line = 0; line < lineCount; line++) {
        const item = items[Math.floor(random() * items.length)];
        if (chosen.has(item.id)) continue;
        chosen.add(item.id);

        const stock = await prisma.outletStock.findUnique({
          where: { outletId_itemId: { outletId: outlet.id, itemId: item.id } },
        });
        if (!stock) continue;

        const previousQty = Math.round(stock.quantity * (1 + random() * 0.3));
        const isAi = random() > 0.25;

        const created = await prisma.stockTakeLine.create({
          data: {
            stockTakeId: stockTake.id,
            itemId: item.id,
            countedQty: stock.quantity,
            previousQty,
            unitPrice: stock.unitPrice,
            previousPrice: round2(stock.unitPrice * (0.96 + random() * 0.06)),
            source: isAi ? LINE_SOURCE.AI : LINE_SOURCE.MANUAL,
            confidence: isAi ? round2(0.68 + random() * 0.3) : null,
            aiLabel: isAi
              ? `${item.brand ? `${item.brand} ` : ""}${item.name}`
              : null,
            createdAt,
          },
        });

        if (isAi) aiLineIds.push(created.id);
      }

      // AI-counted lines only exist because someone photographed a shelf, so
      // the history needs the matching photo to stay coherent.
      if (aiLineIds.length > 0) {
        const photo = await prisma.stockPhoto.create({
          data: {
            stockTakeId: stockTake.id,
            fileName: `${outlet.slug}-shelf-${index + 1}.jpg`,
            url: SHELF_PHOTOS[sequence % SHELF_PHOTOS.length],
            status: PHOTO_STATUS.ANALYZED,
            provider: "simulated",
            detectedCount: aiLineIds.length,
            createdAt,
            analyzedAt: new Date(createdAt.getTime() + 90_000),
          },
        });

        await prisma.stockTakeLine.updateMany({
          where: { id: { in: aiLineIds } },
          data: { photoId: photo.id },
        });
      }
    }
  }

  console.log("Creating an open draft to review…");
  {
    const outlet = outlets[0];
    const admin = await prisma.user.findUnique({
      where: { email: outlet.adminEmail },
    });

    if (admin) {
      const createdAt = new Date(now - 40 * 60_000);
      const draft = await prisma.stockTake.create({
        data: {
          reference: `ST-2026-${String(sequence++).padStart(4, "0")}`,
          outletId: outlet.id,
          userId: admin.id,
          status: STOCK_TAKE_STATUS.DRAFT,
          area: STOCK_AREAS.BAR,
          note: "Bar shelf recount",
          createdAt,
        },
      });

      const photo = await prisma.stockPhoto.create({
        data: {
          stockTakeId: draft.id,
          fileName: `${outlet.slug}-bar-shelf.jpg`,
          url: SHELF_PHOTOS[1],
          status: PHOTO_STATUS.ANALYZED,
          provider: "simulated",
          detectedCount: 4,
          createdAt,
          analyzedAt: new Date(createdAt.getTime() + 60_000),
        },
      });

      const spiritStock = await prisma.outletStock.findMany({
        where: { outletId: outlet.id, item: { sku: { startsWith: "SPI-" } } },
        include: { item: true },
        take: 3,
      });

      for (const stock of spiritStock) {
        const line = await prisma.stockTakeLine.create({
          data: {
            stockTakeId: draft.id,
            itemId: stock.itemId,
            photoId: photo.id,
            countedQty: Math.max(1, Math.round(stock.quantity * 0.85)),
            previousQty: stock.quantity,
            unitPrice: stock.unitPrice,
            previousPrice: stock.unitPrice,
            source: LINE_SOURCE.AI,
            confidence: round2(0.74 + random() * 0.2),
            aiLabel: `${stock.item.brand ? `${stock.item.brand} ` : ""}${stock.item.name}`,
            createdAt,
          },
        });

        await prisma.photoDetection.create({
          data: {
            photoId: photo.id,
            stockTakeId: draft.id,
            label: stock.item.name,
            quantity: line.countedQty,
            unitPrice: stock.unitPrice,
            unit: stock.item.unit,
            confidence: line.confidence ?? 0.8,
            sku: stock.item.sku,
            status: "MATCHED",
            matchedItemId: stock.itemId,
            matchReason: "Matched on name and SKU",
            createdAt,
          },
        });
      }

      // One label the model could not place, so the resolver has real work.
      await prisma.photoDetection.create({
        data: {
          photoId: photo.id,
          stockTakeId: draft.id,
          label: "Amaro della Casa 70cl",
          quantity: 2,
          unitPrice: 21.5,
          unit: "bottle",
          confidence: 0.52,
          status: "UNMATCHED",
          matchReason: "No catalogue item above the match threshold",
          createdAt,
        },
      });
    }
  }

  console.log("Creating price history…");
  for (const item of items.slice(0, 24)) {
    let price = item.referencePrice * 0.9;

    for (let step = 0; step < 3; step++) {
      const next = round2(price * (1 + (random() - 0.35) * 0.1));
      await prisma.priceHistory.create({
        data: {
          itemId: item.id,
          price: next,
          previousPrice: round2(price),
          source: "SEED",
          createdAt: new Date(now - (90 - step * 30) * 86_400_000),
        },
      });
      price = next;
    }
  }

  const counts = {
    outlets: await prisma.outlet.count(),
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    items: await prisma.inventoryItem.count(),
    stockRows: await prisma.outletStock.count(),
    stockTakes: await prisma.stockTake.count(),
    lines: await prisma.stockTakeLine.count(),
    photos: await prisma.stockPhoto.count(),
    detections: await prisma.photoDetection.count(),
  };

  console.log("\nSeed complete:", counts);
  console.log(`\nAll demo accounts use the password: ${DEMO_PASSWORD}`);
  console.log("  super@tribemalta.com   → Super admin (all outlets)");
  for (const outlet of OUTLETS) {
    console.log(`  ${outlet.adminEmail.padEnd(22)} → ${outlet.name}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
