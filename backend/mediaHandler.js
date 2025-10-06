const axios = require('axios');
const FormData = require('form-data');
const mime = require('mime-types');

// Helper function for media message text
function getMediaMessageText(messageType) {
  const messages = {
    'image': '🖼️ Image received',
    'voice': '🎵 Voice note received',
    'audio': '🎵 Audio file received',
    'video': '🎥 Video received',
    'document': '📄 Document received'
  };
  return messages[messageType] || '📎 Media received';
}

/**
 * Downloads media from WhatsApp encrypted URL
 * @param {string} mediaUrl - WhatsApp encrypted media URL
 * @returns {Promise<Buffer>} - Media file buffer
 */
async function downloadWhatsAppMedia(mediaUrl) {
  try {
    console.log('📥 Downloading media from WhatsApp...');
    
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'WhatsApp/2.0',
        'Accept': '*/*'
      },
      timeout: 30000 // 30 second timeout
    });
    
    console.log(`✅ Downloaded ${response.data.byteLength} bytes`);
    return Buffer.from(response.data);
    
  } catch (error) {
    console.error('❌ Failed to download WhatsApp media:', error.message);
    throw new Error(`WhatsApp media download failed: ${error.message}`);
  }
}

/**
 * Uploads media to GHL
 * @param {Buffer} mediaBuffer - Media file buffer
 * @param {string} messageType - Type: 'image', 'voice', 'video', 'document'
 * @param {string} contactId - GHL contact ID
 * @param {string} accessToken - GHL access token
 * @returns {Promise<string>} - GHL media URL
 */
async function uploadMediaToGHL(mediaBuffer, messageType, contactId, accessToken) {
  try {
    console.log(`📤 Uploading ${messageType} to GHL...`);
    
    // Determine file extension and content type
    const fileMap = {
      'image': { ext: 'jpg', mime: 'image/jpeg' },
      'voice': { ext: 'ogg', mime: 'audio/ogg' },
      'audio': { ext: 'mp3', mime: 'audio/mpeg' },
      'video': { ext: 'mp4', mime: 'video/mp4' },
      'document': { ext: 'pdf', mime: 'application/pdf' }
    };
    
    const fileInfo = fileMap[messageType] || { ext: 'bin', mime: 'application/octet-stream' };
    const filename = `whatsapp_${messageType}_${Date.now()}.${fileInfo.ext}`;
    
    // Try direct multipart upload to conversations endpoint
    const formData = new FormData();
    formData.append('file', mediaBuffer, {
      filename: filename,
      contentType: fileInfo.mime
    });
    formData.append('type', 'WhatsApp');
    formData.append('contactId', contactId);
    formData.append('message', getMediaMessageText(messageType));
    formData.append('direction', 'inbound');
    formData.append('status', 'delivered');
    formData.append('altId', `wa_${Date.now()}`);
    
    console.log('📤 Uploading media directly to conversations endpoint...');
    const response = await axios.post(
      'https://services.leadconnectorhq.com/conversations/messages',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
      }
    );
    
    console.log('📊 Media upload response:', response.status, response.data);
    
    console.log('✅ Media uploaded to GHL:', response.data);
    return response.data;
    
  } catch (error) {
    console.error('❌ GHL media upload failed:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Headers:', error.response?.headers);
    console.error('Message:', error.message);
    throw new Error(`GHL upload failed: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Process WhatsApp media and upload to GHL
 * @param {string} mediaUrl - WhatsApp media URL
 * @param {string} messageType - Message type
 * @param {string} contactId - GHL contact ID
 * @param {string} accessToken - GHL access token
 * @returns {Promise<string>} - GHL media URL
 */
async function processWhatsAppMedia(mediaUrl, messageType, contactId, accessToken) {
  try {
    // Step 1: Download from WhatsApp
    const mediaBuffer = await downloadWhatsAppMedia(mediaUrl);
    
    // Step 2: Upload to GHL
    const ghlMediaUrl = await uploadMediaToGHL(
      mediaBuffer, 
      messageType, 
      contactId, 
      accessToken
    );
    
    return ghlMediaUrl;
    
  } catch (error) {
    console.error('❌ Media processing failed:', error.message);
    throw error;
  }
}

module.exports = {
  downloadWhatsAppMedia,
  uploadMediaToGHL,
  processWhatsAppMedia
};
