export interface DeliveryDistrictSetting {
  id: string;
  name: string;
  province: string;
  deliveryFee: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalDeliveryConfig {
  freeDeliveryEnabled: boolean;
  freeDeliveryThreshold: number;
  defaultDeliveryFee: number;
}

export interface PaymentSettingsConfig {
  codEnabled: boolean;
  bankTransferEnabled: boolean;
  whatsappNumber: string;
  bankTransferInstructions: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchName: string;
}

export interface WhatsAppSettingsConfig {
  whatsappNumber: string;
  bankTransferMessageTemplate: string;
  productInquiryTemplate: string;
  generalSupportTemplate: string;
}

export interface ShippingLabelPrintConfig {
  storeName: string;
  storePhone: string;
  returnAddress: string;
  showStoreLogo: boolean;
  fontSize: 'compact' | 'standard' | 'large';
  paperSize: 'thermal_4x6' | 'a4_standard';
  includeOrderDate: boolean;
  includeItemSummary: boolean; // Item count only, NEVER purchase cost or profit
  footerNotice: string;
}

export interface GeneralStoreConfig {
  storeName: string;
  tagline: string;
  logoUrl?: string;
  currency: string;
  currencySymbol: string;
  contactEmail: string;
  whatsappNumber: string;
  announcementBannerEnabled: boolean;
  announcementBannerText: string;
}
