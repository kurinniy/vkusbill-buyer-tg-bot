export interface HistoricalOrderItemView {
  name: string;
  quantity: number;
}

export interface HistoricalOrderView {
  id: string;
  source: 'TELEGRAM' | 'CSV_IMPORT';
  shareBasketUrl: string | null;
  itemCount: number;
  finalizedAt: Date | null;
  finalizedBy: string | null;
  items: HistoricalOrderItemView[];
}
