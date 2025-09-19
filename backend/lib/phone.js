/**
 * Phone number normalization utilities
 */

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone number
 * @returns {string} - E.164 formatted number
 */
function normalizeToE164(phone) {
  if (!phone) return '';
  
  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');
  
  // If already starts with country code, return as is
  if (digitsOnly.length >= 10) {
    return '+' + digitsOnly;
  }
  
  // For Pakistani numbers (common case)
  if (digitsOnly.length === 10 && digitsOnly.startsWith('3')) {
    return '+92' + digitsOnly;
  }
  
  // For US numbers
  if (digitsOnly.length === 10) {
    return '+1' + digitsOnly;
  }
  
  // Return as is if already formatted
  return phone.startsWith('+') ? phone : '+' + digitsOnly;
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
  toWhatsAppJID,
  fromWhatsAppJID
};
