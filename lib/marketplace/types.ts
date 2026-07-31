export type View = "home" | "tracking" | "messages" | "profile" | "dashboard";

export type Category =
  | "Tout"
  | "Commerçants"
  | "Prêt-à-porter"
  | "Électronique"
  | "Alimentaire";

export type ProductCategory = Exclude<Category, "Tout" | "Commerçants">;

export type Product = {
  id: number;
  name: string;
  category: ProductCategory;
  price: number;
  oldPrice?: number;
  image: string;
  merchant: string;
  rating: number;
  reviews: number;
  badge?: string;
};

export type MarketplaceCategory = {
  name: Exclude<Category, "Tout">;
  description: string;
  image: string;
  tone: "sun" | "clay" | "sage" | "green";
};

export type MerchantPreview = {
  name: string;
  category: string;
  rating: string;
  reviews: string;
  initials: string;
  color: string;
};

export type FaqItem = {
  question: string;
  answer: string;
};

export type DeliveryMode = "standard" | "express" | "scheduled";

export type DeliveryOption = {
  id: DeliveryMode;
  title: string;
  description: string;
  promise: string;
  fee: number;
  icon: "truck" | "express" | "calendar";
};
