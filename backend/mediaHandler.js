const FormData = require('form-data');
const axios = require('axios');

/**
 * Upload media to GHL Media Library
 * @param {Buffer} mediaBuffer - The media file buffer
 * @param {string} messageType - Type of media (image, video, audio, etc.)
 * @param {string} contactId - GHL contact ID
 * @param {string} accessToken - GHL access token
 * @param {string} locationId - GHL location ID
 * @returns {Promise<Object>} - GHL upload response
 */
async function uploadMediaToGHL(mediaBuffer, messageType, contactId, accessToken, locationId) {
  try {
    console.log(`📤 Uploading ${messageType} to GHL Media Library...`);
    console.log(`📊 Buffer size: ${mediaBuffer.length} bytes`);
    console.log(`📍 Location ID: ${locationId}`);
    console.log(`👤 Contact ID: ${contactId}`);

    // Determine file extension and mime type based on message type
    let fileExtension = 'bin';
    let mimeType = 'application/octet-stream';
    
    switch (messageType) {
      case 'image':
        fileExtension = 'jpg';
        mimeType = 'image/jpeg';
        break;
      case 'video':
        fileExtension = 'mp4';
        mimeType = 'video/mp4';
        break;
      case 'voice':
      case 'audio':
        fileExtension = 'ogg';
        mimeType = 'audio/ogg';
        break;
      case 'document':
        fileExtension = 'pdf';
        mimeType = 'application/pdf';
        break;
      case 'sticker':
        fileExtension = 'webp';
        mimeType = 'image/webp';
        break;
    }

    const fileName = `whatsapp_${messageType}_${Date.now()}.${fileExtension}`;

    // Create FormData
    const formData = new FormData();
    formData.append('file', mediaBuffer, {
      filename: fileName,
      contentType: mimeType
    });
    formData.append('name', fileName);
    formData.append('hosted', 'false'); // Upload to GHL, not external hosting

    // Upload to GHL Media Library
    const uploadUrl = `https://services.leadconnectorhq.com/medias/upload-file`;
    
    console.log(`🔗 Upload URL: ${uploadUrl}`);
    console.log(`📄 File name: ${fileName}`);
    console.log(`📝 MIME type: ${mimeType}`);

    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log(`✅ Media uploaded successfully to GHL`);
    console.log(`📊 Response:`, response.data);

    return {
      success: true,
      mediaUrl: response.data.fileUrl || response.data.url,
      mediaId: response.data.id,
      fileName: fileName,
      data: response.data
    };

  } catch (error) {
    console.error(`❌ Error uploading media to GHL:`, error.message);
    
    if (error.response) {
      console.error(`📊 GHL Error Response:`, {
        status: error.response.status,
        data: error.response.data
      });
    }

    throw new Error(`Failed to upload media to GHL: ${error.message}`);
  }
}

/**
 * Process WhatsApp media message
 * This function can be used for additional media processing if needed
 * @param {Object} message - WhatsApp message object
 * @returns {Promise<Object>} - Processed media info
 */
async function processWhatsAppMedia(message) {
  try {
    console.log(`🔄 Processing WhatsApp media...`);
    
    // Extract media info from message
    const mediaInfo = {
      type: null,
      url: null,
      caption: null
    };

    if (message.imageMessage) {
      mediaInfo.type = 'image';
      mediaInfo.url = message.imageMessage.url || message.imageMessage.directPath;
      mediaInfo.caption = message.imageMessage.caption;
    } else if (message.videoMessage) {
      mediaInfo.type = 'video';
      mediaInfo.url = message.videoMessage.url || message.videoMessage.directPath;
      mediaInfo.caption = message.videoMessage.caption;
    } else if (message.audioMessage) {
      mediaInfo.type = 'audio';
      mediaInfo.url = message.audioMessage.url || message.audioMessage.directPath;
    } else if (message.documentMessage) {
      mediaInfo.type = 'document';
      mediaInfo.url = message.documentMessage.url || message.documentMessage.directPath;
      mediaInfo.caption = message.documentMessage.fileName;
    } else if (message.stickerMessage) {
      mediaInfo.type = 'sticker';
      mediaInfo.url = message.stickerMessage.url || message.stickerMessage.directPath;
    }

    console.log(`✅ Media processed:`, mediaInfo);
    return mediaInfo;

  } catch (error) {
    console.error(`❌ Error processing WhatsApp media:`, error);
    throw error;
  }
}

module.exports = {
  uploadMediaToGHL,
  processWhatsAppMedia
};

