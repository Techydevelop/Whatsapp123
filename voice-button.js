// 🎤 Custom Voice Recording Button for GHL
// Add this to GHL Agency Settings → Custom Code → Head Code

(function() {
    'use strict';
    
    // Voice recording variables
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    
    // Add voice button to conversation interface
    function addVoiceButton() {
        // Check if button already exists
        if (document.getElementById('custom-voice-btn')) return;
        
        // Wait for conversation interface to load
        const checkInterval = setInterval(() => {
            const messageInput = findMessageInput();
            if (messageInput) {
                clearInterval(checkInterval);
                createVoiceButton(messageInput);
            }
        }, 1000);
        
        // Stop checking after 10 seconds
        setTimeout(() => clearInterval(checkInterval), 10000);
    }
    
    // Find message input area
    function findMessageInput() {
        return document.querySelector('[data-testid="message-input"]') ||
               document.querySelector('.message-input') ||
               document.querySelector('textarea[placeholder*="message"]') ||
               document.querySelector('input[placeholder*="message"]') ||
               document.querySelector('.conversation-input textarea') ||
               document.querySelector('.chat-input textarea');
    }
    
    // Create voice button
    function createVoiceButton(messageInput) {
        const inputContainer = messageInput.parentElement || messageInput.closest('.input-container') || messageInput.closest('.message-input-container');
        
        if (!inputContainer) return;
        
        // Create voice button
        const voiceBtn = document.createElement('button');
        voiceBtn.id = 'custom-voice-btn';
        voiceBtn.innerHTML = '🎤 Voice';
        voiceBtn.className = 'custom-voice-button';
        voiceBtn.style.cssText = `
            background: linear-gradient(135deg, #25D366, #128C7E);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 25px;
            margin: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(37, 211, 102, 0.3);
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        `;
        
        // Add hover effects
        voiceBtn.addEventListener('mouseenter', () => {
            voiceBtn.style.transform = 'translateY(-2px)';
            voiceBtn.style.boxShadow = '0 4px 12px rgba(37, 211, 102, 0.4)';
        });
        
        voiceBtn.addEventListener('mouseleave', () => {
            voiceBtn.style.transform = 'translateY(0)';
            voiceBtn.style.boxShadow = '0 2px 8px rgba(37, 211, 102, 0.3)';
        });
        
        // Add click event
        voiceBtn.addEventListener('click', toggleVoiceRecording);
        
        // Insert button before message input
        inputContainer.insertBefore(voiceBtn, messageInput);
        
        console.log('🎤 Voice button added to conversation interface');
    }
    
    // Toggle voice recording
    function toggleVoiceRecording() {
        if (isRecording) {
            stopVoiceRecording();
        } else {
            startVoiceRecording();
        }
    }
    
    // Start voice recording
    function startVoiceRecording() {
        navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            } 
        })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            audioChunks = [];
            
            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                sendVoiceMessage(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start(1000); // Collect data every second
            isRecording = true;
            
            // Update button UI
            updateButtonUI(true);
            
            // Auto-stop after 60 seconds
            setTimeout(() => {
                if (isRecording) {
                    stopVoiceRecording();
                }
            }, 60000);
            
            console.log('🎤 Voice recording started');
            
        })
        .catch(err => {
            console.error('❌ Error accessing microphone:', err);
            showNotification('Microphone access denied. Please allow microphone access.', 'error');
        });
    }
    
    // Stop voice recording
    function stopVoiceRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            isRecording = false;
            updateButtonUI(false);
            console.log('🎤 Voice recording stopped');
        }
    }
    
    // Update button UI
    function updateButtonUI(recording) {
        const btn = document.getElementById('custom-voice-btn');
        if (!btn) return;
        
        if (recording) {
            btn.innerHTML = '🔴 Recording...';
            btn.style.background = 'linear-gradient(135deg, #ff4444, #cc0000)';
            btn.style.animation = 'pulse 1s infinite';
        } else {
            btn.innerHTML = '🎤 Voice';
            btn.style.background = 'linear-gradient(135deg, #25D366, #128C7E)';
            btn.style.animation = 'none';
        }
    }
    
    // Send voice message
    async function sendVoiceMessage(audioBlob) {
        try {
            // Get current contact and location info
            const contactId = getCurrentContactId();
            const locationId = getCurrentLocationId();
            
            if (!contactId || !locationId) {
                showNotification('Unable to get contact information', 'error');
                return;
            }
            
            // Show sending status
            showNotification('Sending voice message...', 'info');
            
            // Create form data
            const formData = new FormData();
            formData.append('audio', audioBlob, 'voice-message.webm');
            formData.append('contactId', contactId);
            formData.append('locationId', locationId);
            formData.append('type', 'voice');
            
            // Send to backend
            const response = await fetch('/api/send-voice-message', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                showNotification('Voice message sent successfully! 🎤', 'success');
                // Refresh conversation after 2 seconds
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            } else {
                throw new Error(result.error || 'Failed to send voice message');
            }
            
        } catch (error) {
            console.error('❌ Error sending voice message:', error);
            showNotification('Failed to send voice message: ' + error.message, 'error');
        }
    }
    
    // Get current contact ID
    function getCurrentContactId() {
        // Try multiple methods to get contact ID
        const url = window.location.href;
        
        // Method 1: From URL
        const urlMatch = url.match(/contact\/([a-zA-Z0-9_-]+)/);
        if (urlMatch) return urlMatch[1];
        
        // Method 2: From page data
        if (window.GHL_CONTACT_ID) return window.GHL_CONTACT_ID;
        
        // Method 3: From DOM elements
        const contactElement = document.querySelector('[data-contact-id]');
        if (contactElement) return contactElement.getAttribute('data-contact-id');
        
        // Method 4: From global variables
        if (window.contactId) return window.contactId;
        
        console.warn('⚠️ Could not find contact ID');
        return null;
    }
    
    // Get current location ID
    function getCurrentLocationId() {
        // Try multiple methods to get location ID
        if (window.GHL_LOCATION_ID) return window.GHL_LOCATION_ID;
        if (window.locationId) return window.locationId;
        
        // Try to extract from page data
        const locationElement = document.querySelector('[data-location-id]');
        if (locationElement) return locationElement.getAttribute('data-location-id');
        
        console.warn('⚠️ Could not find location ID');
        return null;
    }
    
    // Show notification
    function showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelector('.voice-notification');
        if (existing) existing.remove();
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = 'voice-notification';
        notification.textContent = message;
        
        const colors = {
            success: '#25D366',
            error: '#ff4444',
            info: '#007bff'
        };
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }
    
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addVoiceButton);
    } else {
        addVoiceButton();
    }
    
    // Also initialize when navigating (for SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(addVoiceButton, 2000);
        }
    }).observe(document, { subtree: true, childList: true });
    
    console.log('🎤 Voice recording system initialized');
    
})();
