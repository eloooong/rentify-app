import { createHash } from "node:crypto";

export const DEMO_MARKER = "rentify-local-demo-v1";

// Namespaces isolate the integration test from the developer's demo data.
export function demoFixtures(namespace = "demo") {
  if (!/^[a-z0-9-]{1,48}$/.test(namespace)) {
    throw new Error("Invalid demo namespace.");
  }
  const id = (name) => {
    const hex = createHash("sha256")
      .update(`${DEMO_MARKER}/${namespace}/${name}`)
      .digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  const samples = [
    [
      "cameras",
      "Demo mirrorless camera",
      85000,
      { brand: "Demo", model: "C1", lens_mount: "Demo mount" },
    ],
    [
      "laptops",
      "Demo creator laptop",
      120000,
      { brand: "Demo", model: "L1", ram_gb: 16, storage_gb: 512 },
    ],
    [
      "drones",
      "Demo compact drone",
      95000,
      { brand: "Demo", model: "D1", battery_cycles: 20 },
    ],
    [
      "vr-headsets",
      "Demo standalone VR headset",
      65000,
      { brand: "Demo", model: "V1", connection: "standalone" },
    ],
    [
      "cameras",
      "Demo private camera draft",
      75000,
      { brand: "Demo", model: "C2" },
    ],
  ];
  return {
    namespace,
    accounts: ["owner", "renter"].map((kind) => ({
      kind,
      email: `rentify-${namespace}-${kind}@example.test`,
      display_name: `Demo ${kind === "owner" ? "Owner" : "Renter"}`,
    })),
    listings: samples.map(([category, title, price, attributes], index) => ({
      id: id(`listing-${index}`),
      photo_id: id(`photo-${index}`),
      category,
      title,
      daily_price_amount: price,
      // Synthetic demo prices/deposits do not establish a business policy.
      deposit_amount: price * 2,
      currency: "PHP",
      condition: "Good (synthetic demo)",
      description:
        "LOCAL DEMO ONLY. Fictional equipment and illustrative image; not a real rental offer.",
      pickup_area: "Demo pickup area, Quezon City",
      attributes,
      status: index === samples.length - 1 ? "draft" : "published",
    })),
  };
}
