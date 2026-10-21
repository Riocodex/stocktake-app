export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Take: { id: string };
  NewTake: undefined;
  Product: { id: string };
  AddProduct: undefined;
  NewItem: undefined;
  /** @deprecated use AddProduct / NewItem */
  NewProduct: undefined;
  Dishes: undefined;
  CostAlerts: undefined;
  Dish: { id: string };
  DishRecipe: { id: string };
  NewDish: undefined;
  EditDish: { id: string };
  Delivery: undefined;
  Ordering: undefined;
  OrderApprovals: undefined;
  Invoices: undefined;
  InvoiceDetail: { id: string };
  InvoiceReceive: { id: string };
  Wastage: undefined;
  RecordWastage: undefined;
  Transfers: undefined;
  NewTransfer: undefined;
  Transfer: { id: string };
  StockHistory: undefined;
  Outlets: undefined;
  Team: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Takes: undefined;
  Inventory: { lowOnly?: boolean } | undefined;
  More: undefined;
};
