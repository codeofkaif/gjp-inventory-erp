/**
 * businessConfig.ts
 * Master Business & Firm Profile Configuration
 */

export interface BusinessConfig {
  name: string;
  shortName: string;
  proprietor: string;
  addressLine: string;
  city: string;
  pincode: string;
  state: string;
  fullAddress: string;
  mobile: string;
  formattedMobile: string;
  tagline: string;
}

export const BUSINESS_CONFIG: BusinessConfig = {
  name: "GJP DRYFRUITS & SPICES",
  shortName: "GJP",
  proprietor: "QAMRUDDIN SIDDIQUI",
  addressLine: "WARD NO 13 PATEL NAGAR, N.P.P.",
  city: "MAHARAJGANJ",
  pincode: "273303",
  state: "Uttar Pradesh (09)",
  fullAddress: "WARD NO 13 PATEL NAGAR, N.P.P., MAHARAJGANJ - 273303 (U.P.)",
  mobile: "6391128148",
  formattedMobile: "+91 63911 28148",
  tagline: "Wholesale & Retail: Premium Dates, Dry Fruits, Seeds & Authentic Spices",
};
