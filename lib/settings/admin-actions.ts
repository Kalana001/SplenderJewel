'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import { isValidPhoneNumber, normalizePhoneNumber, DEFAULT_STORE_WHATSAPP, DEFAULT_WHATSAPP_TEMPLATES } from '@/lib/config/whatsapp';
import type {
  DeliveryDistrictSetting,
  GlobalDeliveryConfig,
  PaymentSettingsConfig,
  WhatsAppSettingsConfig,
  ShippingLabelPrintConfig,
  GeneralStoreConfig,
} from '@/types/settings';

// =============================================================================
// 1. DELIVERY SETTINGS ACTIONS
// =============================================================================

export async function getAdminDeliverySettings(): Promise<{
  success: boolean;
  districts: DeliveryDistrictSetting[];
  globalConfig: GlobalDeliveryConfig;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // 1. Fetch all 25 districts
    const { data: districtsData, error: districtsError } = await (adminClient.from('delivery_districts') as any)
      .select('*')
      .order('province', { ascending: true })
      .order('name', { ascending: true });

    if (districtsError) {
      return {
        success: false,
        districts: [],
        globalConfig: { freeDeliveryEnabled: false, freeDeliveryThreshold: 10000, defaultDeliveryFee: 400 },
        error: districtsError.message,
      };
    }

    // 2. Fetch global delivery config from store_settings
    const { data: settingsData } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', 'delivery')
      .maybeSingle();

    const rawVal = settingsData?.value || {};
    const globalConfig: GlobalDeliveryConfig = {
      freeDeliveryEnabled: Boolean(rawVal.free_delivery_enabled),
      freeDeliveryThreshold: Number(rawVal.free_delivery_threshold) || 10000,
      defaultDeliveryFee: Number(rawVal.default_delivery_fee) || 400,
    };

    const districts: DeliveryDistrictSetting[] = (districtsData || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      province: row.province,
      deliveryFee: Number(row.delivery_fee),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { success: true, districts, globalConfig };
  } catch (err: any) {
    return {
      success: false,
      districts: [],
      globalConfig: { freeDeliveryEnabled: false, freeDeliveryThreshold: 10000, defaultDeliveryFee: 400 },
      error: err.message || 'Failed to fetch delivery settings.',
    };
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Dedicated server action to update operational delivery availability for a specific district.
 * Does not mutate legacy fee columns or alter postal tier shipping calculations.
 */
export async function updateDistrictAvailability(
  districtId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const trimmedId = districtId?.trim();
    if (!trimmedId || typeof trimmedId !== 'string' || !UUID_REGEX.test(trimmedId)) {
      return { success: false, error: 'Valid district UUID identifier is required.' };
    }
    if (typeof isActive !== 'boolean') {
      return { success: false, error: 'District availability status must be a boolean.' };
    }

    const { error } = await (adminClient.from('delivery_districts') as any)
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trimmedId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/delivery');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update district availability.' };
  }
}

export async function updateDistrictDeliveryFee(
  districtId: string,
  deliveryFee: number,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!districtId) {
      return { success: false, error: 'District ID is required.' };
    }
    if (typeof deliveryFee !== 'number' || isNaN(deliveryFee) || deliveryFee < 0) {
      return { success: false, error: 'Delivery fee must be a non-negative number.' };
    }

    const { error } = await (adminClient.from('delivery_districts') as any)
      .update({
        delivery_fee: deliveryFee,
        is_active: Boolean(isActive),
      })
      .eq('id', districtId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/delivery');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update district delivery fee.' };
  }
}

export async function updateProvinceDeliveryFees(
  province: string,
  deliveryFee: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!province || !province.trim()) {
      return { success: false, error: 'Province name is required.' };
    }
    if (typeof deliveryFee !== 'number' || isNaN(deliveryFee) || deliveryFee < 0) {
      return { success: false, error: 'Delivery fee must be a non-negative number.' };
    }

    const { error } = await (adminClient.from('delivery_districts') as any)
      .update({ delivery_fee: deliveryFee })
      .eq('province', province.trim());

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/delivery');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update province delivery fees.' };
  }
}

export async function updateGlobalDeliverySettings(
  config: GlobalDeliveryConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (typeof config.freeDeliveryThreshold !== 'number' || config.freeDeliveryThreshold < 0) {
      return { success: false, error: 'Free delivery threshold must be a non-negative number.' };
    }
    if (typeof config.defaultDeliveryFee !== 'number' || config.defaultDeliveryFee < 0) {
      return { success: false, error: 'Default delivery fee must be a non-negative number.' };
    }

    const payload = {
      free_delivery_enabled: Boolean(config.freeDeliveryEnabled),
      free_delivery_threshold: config.freeDeliveryThreshold,
      default_delivery_fee: config.defaultDeliveryFee,
    };

    const { error } = await (adminClient.from('store_settings') as any)
      .upsert({
        key: 'delivery',
        value: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/delivery');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update global delivery settings.' };
  }
}

// =============================================================================
// 2. PAYMENT SETTINGS ACTIONS
// =============================================================================

export async function getAdminPaymentSettings(): Promise<{
  success: boolean;
  settings: PaymentSettingsConfig;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', 'payment')
      .maybeSingle();

    if (error) {
      return {
        success: false,
        settings: {
          codEnabled: true,
          bankTransferEnabled: true,
          whatsappNumber: DEFAULT_STORE_WHATSAPP,
          bankTransferInstructions: 'Please contact us on WhatsApp to verify your bank transfer payment.',
          bankName: 'Commercial Bank of Ceylon',
          accountName: 'Splender Jewel (Pvt) Ltd',
          accountNumber: '8001234567',
          branchName: 'Colombo Main Branch',
        },
        error: error.message,
      };
    }

    const val = data?.value || {};
    const settings: PaymentSettingsConfig = {
      codEnabled: val.cod_enabled !== undefined ? Boolean(val.cod_enabled) : true,
      bankTransferEnabled: val.bank_transfer_enabled !== undefined ? Boolean(val.bank_transfer_enabled) : true,
      whatsappNumber: val.whatsapp_number || DEFAULT_STORE_WHATSAPP,
      bankTransferInstructions: val.bank_transfer_instructions || 'Please contact us on WhatsApp to verify your bank transfer payment.',
      bankName: val.bank_name || 'Commercial Bank of Ceylon',
      accountName: val.account_name || 'Splender Jewel (Pvt) Ltd',
      accountNumber: val.account_number || '8001234567',
      branchName: val.branch_name || 'Colombo Main Branch',
    };

    return { success: true, settings };
  } catch (err: any) {
    return {
      success: false,
      settings: {
        codEnabled: true,
        bankTransferEnabled: true,
        whatsappNumber: DEFAULT_STORE_WHATSAPP,
        bankTransferInstructions: '',
        bankName: '',
        accountName: '',
        accountNumber: '',
        branchName: '',
      },
      error: err.message || 'Failed to fetch payment settings.',
    };
  }
}

export async function updateAdminPaymentSettings(
  config: PaymentSettingsConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // Critical validation: Store cannot disable both payment methods simultaneously
    if (!config.codEnabled && !config.bankTransferEnabled) {
      return {
        success: false,
        error: 'At least one payment method (Cash on Delivery or Bank Transfer) must remain enabled.',
      };
    }

    const payload = {
      cod_enabled: Boolean(config.codEnabled),
      bank_transfer_enabled: Boolean(config.bankTransferEnabled),
      whatsapp_number: normalizePhoneNumber(config.whatsappNumber || DEFAULT_STORE_WHATSAPP),
      bank_transfer_instructions: (config.bankTransferInstructions || '').trim(),
      bank_name: (config.bankName || '').trim(),
      account_name: (config.accountName || '').trim(),
      account_number: (config.accountNumber || '').trim(),
      branch_name: (config.branchName || '').trim(),
    };

    const { error } = await (adminClient.from('store_settings') as any)
      .upsert({
        key: 'payment',
        value: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/payments');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update payment settings.' };
  }
}

// =============================================================================
// 3. WHATSAPP SETTINGS ACTIONS
// =============================================================================

export async function getAdminWhatsAppSettings(): Promise<{
  success: boolean;
  settings: WhatsAppSettingsConfig;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    // 1. Fetch general settings (for whatsapp_number)
    const { data: generalData } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', 'general')
      .maybeSingle();

    // 2. Fetch whatsapp templates settings
    const { data: whatsappData } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', 'whatsapp')
      .maybeSingle();

    const genVal = generalData?.value || {};
    const waVal = whatsappData?.value || {};

    const settings: WhatsAppSettingsConfig = {
      whatsappNumber: genVal.whatsapp_number || DEFAULT_STORE_WHATSAPP,
      bankTransferMessageTemplate: waVal.bank_transfer_template || DEFAULT_WHATSAPP_TEMPLATES.bankTransfer,
      productInquiryTemplate: waVal.product_inquiry_template || DEFAULT_WHATSAPP_TEMPLATES.productInquiry,
      generalSupportTemplate: waVal.general_support_template || DEFAULT_WHATSAPP_TEMPLATES.generalSupport,
    };

    return { success: true, settings };
  } catch (err: any) {
    return {
      success: false,
      settings: {
        whatsappNumber: DEFAULT_STORE_WHATSAPP,
        bankTransferMessageTemplate: DEFAULT_WHATSAPP_TEMPLATES.bankTransfer,
        productInquiryTemplate: DEFAULT_WHATSAPP_TEMPLATES.productInquiry,
        generalSupportTemplate: DEFAULT_WHATSAPP_TEMPLATES.generalSupport,
      },
      error: err.message || 'Failed to fetch WhatsApp settings.',
    };
  }
}

export async function updateAdminWhatsAppSettings(
  config: WhatsAppSettingsConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!isValidPhoneNumber(config.whatsappNumber)) {
      return {
        success: false,
        error: 'Please enter a valid international WhatsApp phone number (e.g. +94764689907).',
      };
    }

    const normalizedNumber = normalizePhoneNumber(config.whatsappNumber);

    // 1. Update general settings whatsapp_number
    const { data: generalData } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', 'general')
      .maybeSingle();

    const existingGeneral = generalData?.value || {};
    const updatedGeneral = {
      ...existingGeneral,
      whatsapp_number: normalizedNumber,
    };

    const { error: genError } = await (adminClient.from('store_settings') as any)
      .upsert({
        key: 'general',
        value: updatedGeneral,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (genError) {
      return { success: false, error: genError.message };
    }

    // 2. Update whatsapp template settings
    const waPayload = {
      bank_transfer_template: (config.bankTransferMessageTemplate || DEFAULT_WHATSAPP_TEMPLATES.bankTransfer).trim(),
      product_inquiry_template: (config.productInquiryTemplate || DEFAULT_WHATSAPP_TEMPLATES.productInquiry).trim(),
      general_support_template: (config.generalSupportTemplate || DEFAULT_WHATSAPP_TEMPLATES.generalSupport).trim(),
    };

    const { error: waError } = await (adminClient.from('store_settings') as any)
      .upsert({
        key: 'whatsapp',
        value: waPayload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (waError) {
      return { success: false, error: waError.message };
    }

    revalidatePath('/admin/settings/whatsapp');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update WhatsApp settings.' };
  }
}

// =============================================================================
// 4. GENERAL STORE SETTINGS ACTIONS
// =============================================================================

export async function getAdminGeneralStoreSettings(): Promise<{
  success: boolean;
  settings: GeneralStoreConfig;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('store_settings') as any)
      .select('value')
      .eq('key', 'general')
      .maybeSingle();

    if (error) {
      return {
        success: false,
        settings: {
          storeName: 'Splender Jewel',
          tagline: 'Timeless Elegance & Modern Luxury Jewelry',
          logoUrl: '/images/logo.png',
          currency: 'LKR',
          currencySymbol: 'Rs.',
          contactEmail: 'concierge@splenderjewel.com',
          whatsappNumber: DEFAULT_STORE_WHATSAPP,
          announcementBannerEnabled: false,
          announcementBannerText: 'Islandwide delivery in Sri Lanka | Cash on Delivery Available',
        },
        error: error.message,
      };
    }

    const val = data?.value || {};
    const settings: GeneralStoreConfig = {
      storeName: val.store_name || 'Splender Jewel',
      tagline: val.tagline || 'Timeless Elegance & Modern Luxury Jewelry',
      logoUrl: val.logo_url || '/images/logo.png',
      currency: val.currency || 'LKR',
      currencySymbol: val.currency_symbol || 'Rs.',
      contactEmail: val.contact_email || 'concierge@splenderjewel.com',
      whatsappNumber: val.whatsapp_number || DEFAULT_STORE_WHATSAPP,
      announcementBannerEnabled: Boolean(val.announcement_banner_enabled),
      announcementBannerText: val.announcement_banner_text || 'Islandwide delivery in Sri Lanka | Cash on Delivery Available',
    };

    return { success: true, settings };
  } catch (err: any) {
    return {
      success: false,
      settings: {
        storeName: 'Splender Jewel',
        tagline: 'Timeless Elegance & Modern Luxury Jewelry',
        logoUrl: '/images/logo.png',
        currency: 'LKR',
        currencySymbol: 'Rs.',
        contactEmail: 'concierge@splenderjewel.com',
        whatsappNumber: DEFAULT_STORE_WHATSAPP,
        announcementBannerEnabled: false,
        announcementBannerText: '',
      },
      error: err.message || 'Failed to fetch general store settings.',
    };
  }
}

export async function updateAdminGeneralStoreSettings(
  config: GeneralStoreConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    if (!config.storeName || !config.storeName.trim()) {
      return { success: false, error: 'Store brand name is required.' };
    }

    const payload = {
      store_name: config.storeName.trim(),
      tagline: (config.tagline || '').trim(),
      logo_url: config.logoUrl ? config.logoUrl.trim() : '/images/logo.png',
      currency: config.currency || 'LKR',
      currency_symbol: config.currencySymbol || 'Rs.',
      contact_email: (config.contactEmail || '').trim(),
      whatsapp_number: normalizePhoneNumber(config.whatsappNumber || DEFAULT_STORE_WHATSAPP),
      announcement_banner_enabled: Boolean(config.announcementBannerEnabled),
      announcement_banner_text: (config.announcementBannerText || '').trim(),
    };

    const { error } = await (adminClient.from('store_settings') as any)
      .upsert({
        key: 'general',
        value: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/store');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update general store settings.' };
  }
}

// =============================================================================
// 5. PACKAGE PRINT TEMPLATE ACTIONS
// =============================================================================

export async function getAdminPrintTemplateConfig(): Promise<{
  success: boolean;
  config: ShippingLabelPrintConfig;
  error?: string;
}> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('print_templates') as any)
      .select('*')
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        config: {
          storeName: 'Splender Jewel',
          storePhone: '+94 76 468 9907',
          returnAddress: 'Splender Jewel Boutique, Colombo, Sri Lanka',
          showStoreLogo: true,
          fontSize: 'standard',
          paperSize: 'thermal_4x6',
          includeOrderDate: true,
          includeItemSummary: true,
          footerNotice: 'Fragile Fine Jewelry — Handle With Utmost Care',
        },
        error: error.message,
      };
    }

    const raw = data?.template_config || {};
    const config: ShippingLabelPrintConfig = {
      storeName: raw.store_name || 'Splender Jewel',
      storePhone: raw.store_phone || '+94 76 468 9907',
      returnAddress: raw.return_address || 'Splender Jewel Boutique, Colombo, Sri Lanka',
      showStoreLogo: raw.show_store_logo !== undefined ? Boolean(raw.show_store_logo) : true,
      fontSize: raw.font_size || 'standard',
      paperSize: raw.paper_size || 'thermal_4x6',
      includeOrderDate: raw.include_order_date !== undefined ? Boolean(raw.include_order_date) : true,
      includeItemSummary: raw.include_item_summary !== undefined ? Boolean(raw.include_item_summary) : true,
      footerNotice: raw.footer_notice || 'Fragile Fine Jewelry — Handle With Utmost Care',
    };

    return { success: true, config };
  } catch (err: any) {
    return {
      success: false,
      config: {
        storeName: 'Splender Jewel',
        storePhone: '+94 76 468 9907',
        returnAddress: 'Splender Jewel Boutique, Colombo, Sri Lanka',
        showStoreLogo: true,
        fontSize: 'standard',
        paperSize: 'thermal_4x6',
        includeOrderDate: true,
        includeItemSummary: true,
        footerNotice: 'Fragile Fine Jewelry — Handle With Utmost Care',
      },
      error: err.message || 'Failed to fetch print template settings.',
    };
  }
}

export async function updateAdminPrintTemplateConfig(
  config: ShippingLabelPrintConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdminAuth();
    const adminClient = createAdminClient();

    const payload = {
      store_name: config.storeName.trim(),
      store_phone: config.storePhone.trim(),
      return_address: config.returnAddress.trim(),
      show_store_logo: Boolean(config.showStoreLogo),
      font_size: config.fontSize,
      paper_size: config.paperSize,
      include_order_date: Boolean(config.includeOrderDate),
      include_item_summary: Boolean(config.includeItemSummary),
      footer_notice: config.footerNotice.trim(),
    };

    // Upsert default Shipping Package Label template
    const { error } = await (adminClient.from('print_templates') as any)
      .upsert({
        name: 'Shipping Package Label',
        is_default: true,
        template_config: payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'name' });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/settings/print-template');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update print template settings.' };
  }
}
