/**
 * Canonical List of Sri Lanka's 25 Administrative Districts
 * Used for address validation, checkout selection, and district-based delivery pricing.
 */
export const SRI_LANKA_DISTRICTS = [
  'Ampara',
  'Anuradhapura',
  'Badulla',
  'Batticaloa',
  'Colombo',
  'Galle',
  'Gampaha',
  'Hambantota',
  'Jaffna',
  'Kalutara',
  'Kandy',
  'Kegalle',
  'Kilinochchi',
  'Kurunegala',
  'Mannar',
  'Matale',
  'Matara',
  'Monaragala',
  'Mullaitivu',
  'Nuwara Eliya',
  'Polonnaruwa',
  'Puttalam',
  'Ratnapura',
  'Trincomalee',
  'Vavuniya',
] as const;

export type SriLankaDistrict = (typeof SRI_LANKA_DISTRICTS)[number];

export function isValidDistrict(district: string): district is SriLankaDistrict {
  return SRI_LANKA_DISTRICTS.includes(district as SriLankaDistrict);
}

/**
 * Returns canonical estimated delivery fee by district (LKR).
 * Defaulting to 350 for Western Province (Colombo, Gampaha, Kalutara) and 450 islandwide.
 */
export function getEstimatedDeliveryFee(district?: string | null): number {
  if (!district) return 350;
  const westernDistricts = ['Colombo', 'Gampaha', 'Kalutara'];
  return westernDistricts.includes(district) ? 350 : 450;
}

