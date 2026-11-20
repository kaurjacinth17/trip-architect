// ISO 3166 country code → ISO 4217 currency (facts, not provider data). Unknown countries ask the user.
export const COUNTRY_CURRENCY: Record<string, string> = {
  IN: 'INR', NP: 'NPR', BT: 'BTN', LK: 'LKR', MV: 'MVR', BD: 'BDT', PK: 'PKR', MM: 'MMK',
  AE: 'AED', SA: 'SAR', QA: 'QAR', OM: 'OMR', BH: 'BHD', KW: 'KWD', JO: 'JOD', IL: 'ILS', TR: 'TRY', EG: 'EGP', MA: 'MAD',
  TH: 'THB', SG: 'SGD', MY: 'MYR', ID: 'IDR', VN: 'VND', KH: 'KHR', LA: 'LAK', PH: 'PHP',
  JP: 'JPY', KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD', MO: 'MOP',
  GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', GR: 'EUR',
  FI: 'EUR', LU: 'EUR', SI: 'EUR', SK: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR',
  CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK', CZ: 'CZK', HU: 'HUF', PL: 'PLN', RO: 'RON', BG: 'BGN',
  GE: 'GEL', AZ: 'AZN', AM: 'AMD', KZ: 'KZT', UZ: 'UZS', RU: 'RUB',
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', PE: 'PEN', CO: 'COP',
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', ZA: 'ZAR', KE: 'KES', TZ: 'TZS', MU: 'MUR', SC: 'SCR',
};
/** Currencies Frankfurter (ECB reference rates) can convert. Others are recorded but can't be auto-converted. */
export const FX_SUPPORTED = ['INR', 'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR'];
