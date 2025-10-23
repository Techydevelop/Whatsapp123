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
 * @param {string} locationId - GHL location ID
 * @returns {Promise<string>} - GHL media URL
 */
async function uploadMediaToGHL(mediaBuffer, messageType, contactId, accessToken, locationId) {
  try {
    console.log(`📤 Uploading ${messageType} to GHL for location: ${locationId}...`);
    
    // Determine file extension and content type
    const fileMap = {
      'image': { ext: 'jpg', mime: 'image/jpeg' },
      'voice': { ext: 'ogg', mime: 'audio/ogg; codecs=opus' },
      'audio': { ext: 'mp3', mime: 'audio/mpeg' },
      'video': { ext: 'mp4', mime: 'video/mp4' },
      'document': { ext: 'pdf', mime: 'application/pdf' }
    };
    
    const fileInfo = fileMap[messageType] || { ext: 'bin', mime: 'application/octet-stream' };
    const filename = `whatsapp_${messageType}_${Date.now()}.${fileInfo.ext}`;
    
    // Upload media to GHL media library with correct endpoint
    const mediaFormData = new FormData();
    mediaFormData.append('file', mediaBuffer, {
      filename: filename,
      contentType: fileInfo.mime
    });
    mediaFormData.append('fileType', messageType);
    
    console.log('📤 Uploading media to GHL media library...');
    
    // Try media upload endpoint (requires medias.write scope)
    // If fails, will use direct URL method as fallback
    const mediaResponse = await axios.post(
      `https://services.leadconnectorhq.com/medias/upload-file`,
      mediaFormData,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'locationId': locationId,
          ...mediaFormData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000
      }
    ).catch(err => {
      console.warn('⚠️ Media upload endpoint failed, using conversations API fallback');
      throw err; // Will trigger fallback in server.js
    });
    
    console.log('✅ Media uploaded to library:', mediaResponse.data);
    
    // Get the uploaded file URL
    const uploadedFileUrl = mediaResponse.data?.fileUrl || mediaResponse.data?.url;
    
    if (!uploadedFileUrl) {
      throw new Error('No file URL returned from GHL media upload');
    }
    
    // Now create conversation message with media attachment
    const messagePayload = {
      type: "WhatsApp",
      contactId: contactId,
      message: getMediaMessageText(messageType),
      direction: "inbound",
      status: "delivered",
      altId: `wa_${Date.now()}`,
      attachments: [uploadedFileUrl] // GHL expects array of URLs
    };
    
    console.log('📤 Creating conversation message with media...');
    const response = await axios.post(
      'https://services.leadconnectorhq.com/conversations/messages',
      messagePayload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28',
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('📊 Media upload response:', response.status, response.data);
    
    console.log('✅ Media uploaded to GHL:', response.data);
    
    // Return the uploaded file URL, not the conversation response
    return {
      ...response.data,
      url: uploadedFileUrl  // Add the actual media URL to the response
    };
    
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
 * @param {string} locationId - GHL location ID
 * @returns {Promise<string>} - GHL media URL
 */
async function processWhatsAppMedia(mediaUrl, messageType, contactId, accessToken, locationId) {
  try {
    // Step 1: Download from WhatsApp
    const mediaBuffer = await downloadWhatsAppMedia(mediaUrl);
    
    // Step 2: Upload to GHL
    const ghlMediaUrl = await uploadMediaToGHL(
      mediaBuffer, 
      messageType, 
      contactId, 
      accessToken,
      locationId
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
