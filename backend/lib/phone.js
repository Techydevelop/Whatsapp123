/**
 * Phone number normalization utilities
 * Supports international phone numbers from all countries
 */

/**
 * Normalize phone number to E.164 format WITHOUT + (for Baileys)
 * @param {string} phone - Raw phone number (can have +, spaces, dashes, etc.)
 * @param {string} defaultCountryCode - Optional default country code (e.g., 'PK', 'US')
 * @returns {string} - E.164 formatted number WITHOUT + (e.g., 923148998041)
 */
function normalizeToE164WithoutPlus(phone, defaultCountryCode = null) {
  if (!phone) throw new Error('Phone number is required');
  
  // Remove all non-digit characters except keep + for detection
  let cleaned = phone.trim();
  
  // If starts with +, it's already in international format
  if (cleaned.startsWith('+')) {
    // Remove + and return digits only
    return cleaned.replace(/[^\d]/g, '');
  }
  
  // Remove all non-digits
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  // Common country codes detection (most common worldwide)
  const countryCodes = {
    // 1 digit country codes
    '1': ['US', 'CA'], // USA, Canada
    // 2 digit country codes
    '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR', '34': 'ES',
    '36': 'HU', '39': 'IT', '40': 'RO', '41': 'CH', '43': 'AT', '44': 'GB', '45': 'DK',
    '46': 'SE', '47': 'NO', '48': 'PL', '49': 'DE', '51': 'PE', '52': 'MX', '53': 'CU',
    '54': 'AR', '55': 'BR', '56': 'CL', '57': 'CO', '58': 'VE', '60': 'MY', '61': 'AU',
    '62': 'ID', '63': 'PH', '64': 'NZ', '65': 'SG', '66': 'TH', '81': 'JP', '82': 'KR',
    '84': 'VN', '86': 'CN', '90': 'TR', '91': 'IN', '92': 'PK', '93': 'AF', '94': 'LK',
    '95': 'MM', '98': 'IR', '212': 'MA', '213': 'DZ', '216': 'TN', '218': 'LY',
    '220': 'GM', '221': 'SN', '222': 'MR', '223': 'ML', '224': 'GN', '225': 'CI',
    '226': 'BF', '227': 'NE', '228': 'TG', '229': 'BJ', '230': 'MU', '231': 'LR',
    '232': 'SL', '233': 'GH', '234': 'NG', '235': 'TD', '236': 'CF', '237': 'CM',
    '238': 'CV', '239': 'ST', '240': 'GQ', '241': 'GA', '242': 'CG', '243': 'CD',
    '244': 'AO', '245': 'GW', '246': 'IO', '247': 'AC', '248': 'SC', '249': 'SD',
    '250': 'RW', '251': 'ET', '252': 'SO', '253': 'DJ', '254': 'KE', '255': 'TZ',
    '256': 'UG', '257': 'BI', '258': 'MZ', '260': 'ZM', '261': 'MG', '262': 'RE',
    '263': 'ZW', '264': 'NA', '265': 'MW', '266': 'LS', '267': 'BW', '268': 'SZ',
    '269': 'KM', '290': 'SH', '291': 'ER', '297': 'AW', '298': 'FO', '299': 'GL',
    '350': 'GI', '351': 'PT', '352': 'LU', '353': 'IE', '354': 'IS', '355': 'AL',
    '356': 'MT', '357': 'CY', '358': 'FI', '359': 'BG', '370': 'LT', '371': 'LV',
    '372': 'EE', '373': 'MD', '374': 'AM', '375': 'BY', '376': 'AD', '377': 'MC',
    '378': 'SM', '380': 'UA', '381': 'RS', '382': 'ME', '383': 'XK', '385': 'HR',
    '386': 'SI', '387': 'BA', '389': 'MK', '420': 'CZ', '421': 'SK', '423': 'LI',
    '500': 'FK', '501': 'BZ', '502': 'GT', '503': 'SV', '504': 'HN', '505': 'NI',
    '506': 'CR', '507': 'PA', '508': 'PM', '509': 'HT', '590': 'BL', '591': 'BO',
    '592': 'GY', '593': 'EC', '594': 'GF', '595': 'PY', '596': 'MQ', '597': 'SR',
    '598': 'UY', '599': 'CW', '670': 'TL', '672': 'NF', '673': 'BN', '674': 'NR',
    '675': 'PG', '676': 'TO', '677': 'SB', '678': 'VU', '679': 'FJ', '680': 'PW',
    '681': 'WF', '682': 'CK', '683': 'NU', '685': 'WS', '686': 'KI', '687': 'NC',
    '688': 'TV', '689': 'PF', '690': 'TK', '691': 'FM', '692': 'MH', '850': 'KP',
    '852': 'HK', '853': 'MO', '855': 'KH', '856': 'LA', '880': 'BD', '886': 'TW',
    '960': 'MV', '961': 'LB', '962': 'JO', '963': 'SY', '964': 'IQ', '965': 'KW',
    '966': 'SA', '967': 'YE', '968': 'OM', '970': 'PS', '971': 'AE', '972': 'IL',
    '973': 'BH', '974': 'QA', '975': 'BT', '976': 'MN', '977': 'NP', '992': 'TJ',
    '993': 'TM', '994': 'AZ', '995': 'GE', '996': 'KG', '998': 'UZ'
  };
  
  // Try to detect country code from digits
  // Start with longest codes first (3 digits, then 2, then 1)
  const threeDigitCodes = ['212', '213', '216', '218', '220', '221', '222', '223', '224', '225',
    '226', '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238',
    '239', '240', '241', '242', '243', '244', '245', '246', '247', '248', '249', '250', '251',
    '252', '253', '254', '255', '256', '257', '258', '260', '261', '262', '263', '264', '265',
    '266', '267', '268', '269'];
  
  if (digitsOnly.length >= 13) {
    // Check 3-digit country codes
    for (const code of threeDigitCodes) {
      if (digitsOnly.startsWith(code)) {
        console.log(`🌍 Detected country code ${code} (${countryCodes[code]})`);
        return digitsOnly; // Already has country code
      }
    }
  }
  
  // Check 2-digit country codes
  if (digitsOnly.length >= 12) {
    const twoDigitCode = digitsOnly.substring(0, 2);
    if (countryCodes[twoDigitCode]) {
      console.log(`🌍 Detected country code ${twoDigitCode} (${countryCodes[twoDigitCode]})`);
      return digitsOnly; // Already has country code
    }
  }
  
  // Check 1-digit country code (US/Canada)
  if (digitsOnly.length >= 11 && digitsOnly.startsWith('1')) {
    console.log(`🌍 Detected country code 1 (US/CA)`);
    return digitsOnly; // Already has country code
  }
  
  // If no country code detected and we have a default country code
  if (defaultCountryCode) {
    const defaultCodes = {
      'PK': '92', 'US': '1', 'CA': '1', 'GB': '44', 'IN': '91', 'BD': '880',
      'AE': '971', 'SA': '966', 'EG': '20', 'ZA': '27', 'NG': '234', 'KE': '254'
    };
    const code = defaultCodes[defaultCountryCode.toUpperCase()];
    if (code) {
      console.log(`🌍 Using default country code ${code} for ${defaultCountryCode}`);
      return code + digitsOnly;
    }
  }
  
  // If number is 10 digits, try common patterns
  if (digitsOnly.length === 10) {
    // Pakistani numbers often start with 3
    if (digitsOnly.startsWith('3')) {
      console.log(`🌍 Assuming Pakistani number, adding country code 92`);
      return '92' + digitsOnly;
    }
    // Many other countries have 10-digit local numbers
    // Default to US/Canada (most common)
    console.log(`🌍 Assuming US/Canadian number, adding country code 1`);
    return '1' + digitsOnly;
  }
  
  // If number is 11 digits and starts with 1, it's likely US/Canada
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return digitsOnly; // Already formatted
  }
  
  // Validate final length (E.164: 10-15 digits)
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new Error(`Invalid phone number length: ${digitsOnly.length} digits. Must be 10-15 digits.`);
  }
  
  // If we reach here, assume it already has country code
  console.log(`🌍 Using number as-is (assuming country code included): ${digitsOnly}`);
  return digitsOnly;
}

/**
 * Normalize phone number to E.164 format WITH +
 * @param {string} phone - Raw phone number
 * @param {string} defaultCountryCode - Optional default country code
 * @returns {string} - E.164 formatted number WITH + (e.g., +923148998041)
 */
function normalizeToE164(phone, defaultCountryCode = null) {
  const withoutPlus = normalizeToE164WithoutPlus(phone, defaultCountryCode);
  return '+' + withoutPlus;
}

/**
 * Convert E.164 number to WhatsApp JID
 * @param {string} e164Number - E.164 formatted number
 * @returns {string} - WhatsApp JID
 */
function toWhatsAppJID(e164Number) {
  const normalized = normalizeToE164(e164Number);
  const digitsOnly = normalized.replace(/\D/g, '');
  return `${digitsOnly}@c.us`;
}

/**
 * Extract phone number from WhatsApp JID
 * @param {string} jid - WhatsApp JID
 * @returns {string} - Phone number
 */
function fromWhatsAppJID(jid) {
  if (!jid || !jid.includes('@c.us')) return '';
  return jid.replace('@c.us', '');
}

module.exports = {
  normalizeToE164,
  normalizeToE164WithoutPlus, // For Baileys pairing code (needs format without +)
  toWhatsAppJID,
  fromWhatsAppJID
};
