export interface HomepageSection {
  id: string;
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  displayOrder: number;
  isEnabled: boolean;
  configData: Record<string, any>;
  updatedAt: string;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  linkUrl: string | null;
  buttonText: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBannerInput {
  title: string;
  subtitle?: string | null;
  imageUrl: string;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  buttonText?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateBannerInput {
  title?: string;
  subtitle?: string | null;
  imageUrl?: string;
  mobileImageUrl?: string | null;
  linkUrl?: string | null;
  buttonText?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export interface ContentPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

export interface UpdateContentPageInput {
  title: string;
  content: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export interface StoreGeneralSettings {
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
