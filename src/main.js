import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import * as Tone from 'tone';
import { ModelLoader } from './modelLoader';
import ElevenLabsService from './services/elevenLabsService';
import PhonemeLipSyncService from './services/phonemeLipSyncService';
import AudioManager from './services/audioManager';
import { GoogleGenerativeAI } from '@google/generative-ai';

class ChatbotSystem {
    constructor() {
        this.facialAnimation = new FacialAnimationSystem(this);
        this.ttsService = new ElevenLabsService();
        this.initSpeechRecognition();
        this.setupChatInterface();
        this.isRecording = false;
        this.processingResponse = false;
        this.microphonePermissionChecked = false;
        
        // Make chatbot system available globally for VR interaction
        window.chatbotSystem = this;
    }

    initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            console.error('Speech recognition not supported in this browser');
            this.addMessageToChat('ai', 'Speech recognition is not supported in this browser. Please try using Chrome or Edge.');
            this.showFallbackExplanation();
            this.offerTextInputAlternative();
            return;
        }

        // Check for microphone permissions first
        this.checkMicrophonePermission();
        
        // Track network status with more aggressive checking
        this.isOnline = navigator.onLine;
        this.networkErrorCount = 0;
        
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.networkErrorCount = 0;
            this.addMessageToChat('ai', 'Network connection restored. Speech recognition is now available.');
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            if (this.isRecording) {
                this.stopRecording();
                this.addMessageToChat('ai', 'Network connection lost. Speech recognition paused.');
                this.offerTextInputAlternative();
            }
        });

        // Test network connectivity to speech servers
        this.testNetworkConnectivity();

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        // Configure for better reliability
        this.recognition.maxAlternatives = 3;

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.addMessageToChat('user', transcript);
            if (event.results[0].isFinal) {
                this.generateResponse(transcript);
            }
        };

        this.recognition.onend = () => {
            if (this.isRecording && !this.processingResponse) {
                // Check if we're online before restarting
                if (this.isOnline && this.networkErrorCount < 3) {
                    // Add small delay before restarting to avoid rapid restarts
                    setTimeout(() => {
                        try {
                            this.recognition.start();
                            console.log('Speech recognition restarted');
                        } catch (error) {
                            console.error('Error restarting speech recognition:', error);
                            this.updateRecordingUI(false);
                            this.isRecording = false;
                            this.offerTextInputAlternative();
                        }
                    }, 300);
                } else {
                    console.log('Not restarting speech recognition due to network issues');
                    this.updateRecordingUI(false);
                    this.isRecording = false;
                    if (this.networkErrorCount >= 3) {
                        this.addMessageToChat('ai', 'Speech recognition has been disabled due to repeated network errors.');
                        this.showFallbackExplanation();
                        this.offerTextInputAlternative();
                    }
                }
            } else {
                this.updateRecordingUI(false);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Handle specific error types
            switch (event.error) {
                case 'not-allowed':
                case 'permission-denied':
                    this.addMessageToChat('ai', 'Microphone access was denied. Please allow microphone access to use speech recognition.');
                    this.updateRecordingUI(false);
                    this.offerTextInputAlternative();
                    break;
                case 'no-speech':
                    this.addMessageToChat('ai', 'No speech was detected. Please try speaking again.');
                    break;
                case 'network':
                    this.networkErrorCount++;
                    // Check actual network connectivity
                    if (!navigator.onLine) {
                        this.addMessageToChat('ai', 'Your device appears to be offline. Please check your internet connection.');
                    } else {
                        if (this.networkErrorCount === 1) {
                            this.addMessageToChat('ai', 'Network error connecting to speech recognition service. Trying once more...');
                        } else {
                            this.showNetworkErrorExplanation();
                            this.isOnline = false; // Disable further attempts
                            this.stopRecording();
                        }
                        
                        // Always offer text input on network errors
                        this.offerTextInputAlternative();
                    }
                    break;
                case 'aborted':
                    console.log('Speech recognition aborted');
                    break;
                default:
                    this.addMessageToChat('ai', 'An error occurred with speech recognition. Please try again or use text input.');
                    this.offerTextInputAlternative();
            }
            
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                this.updateRecordingUI(false);
                if (this.isRecording && event.error === 'network' && this.networkErrorCount >= 2) {
                    this.isRecording = false;
                }
            }
        };
    }

    setupChatInterface() {
        this.recordButton = document.getElementById('recordButton');
        this.recordingStatus = document.getElementById('recording-status');
        this.chatMessages = document.getElementById('chat-messages');
        this.currentMessage = null;

        this.recordButton.addEventListener('click', () => {
            if (!this.isRecording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
        });
        
        // Add a welcome message
        this.addWelcomeMessage();
        
        // Initialize text input alternative immediately
        this.offerTextInputAlternative();
        
        // Test network connectivity to see if speech recognition is likely to work
        this.testNetworkConnectivity().then(result => {
            if (this.networkErrorCount > 0) {
                this.addMessageToChat('ai', 'Speech recognition might not work due to network connectivity issues. You can use text input as an alternative.');
            }
        });
    }

    addWelcomeMessage() {
        // Add a welcome message to guide the user
        const welcomeMessages = [
            "Hi there! You can either click the 'Start Recording' button to speak, or use the text input below.",
            "Welcome! I'm ready to listen. You can speak using the recording button or type in the text box below.",
            "Hello! To begin our conversation, either use the microphone button or just type your message below."
        ];
        
        const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        this.addMessageToChat('ai', randomMessage);
    }

    async startRecording() {
        if (this.processingResponse) return;

        try {
            // Check if we're online
            if (!navigator.onLine) {
                this.addMessageToChat('ai', 'Your device appears to be offline. Speech recognition requires an internet connection.');
                this.offerTextInputAlternative();
                return;
            }
            
            // Reset network error count on new recording attempt
            this.networkErrorCount = 0;
            
            // Check microphone permissions before starting recording
            const hasPermission = await this.checkMicrophonePermission();
            if (!hasPermission) {
                console.error('Microphone permission not granted, cannot start recording');
                this.addMessageToChat('ai', 'Please allow microphone access to use speech recognition.');
                this.offerTextInputAlternative();
                return;
            }

            this.isRecording = true;
            this.updateRecordingUI(true);
            
            // Create a new message container for this recording session
            this.currentMessage = document.createElement('div');
            this.currentMessage.classList.add('message', 'user-message');
            this.currentMessage.textContent = '';
            this.chatMessages.appendChild(this.currentMessage);
            
            // Start speech recognition with error handling and timeout
            try {
                await this.testNetworkConnectivity();
                this.recognition.start();
                console.log('Speech recognition started');
                
                // Set a timeout to detect if recognition doesn't start properly
                this.recognitionTimeout = setTimeout(() => {
                    if (this.isRecording) {
                        console.log('Speech recognition timeout - may not have started properly');
                        try {
                            this.recognition.stop();
                        } catch (e) {
                            // Ignore errors when stopping
                        }
                        this.addMessageToChat('ai', 'Speech recognition is taking too long to connect. This might be due to network issues.');
                        this.offerTextInputAlternative();
                        this.updateRecordingUI(false);
                        this.isRecording = false;
                    }
                }, 5000); // 5 second timeout
            } catch (error) {
                console.error('Error starting speech recognition:', error);
                this.addMessageToChat('ai', 'Could not start speech recognition. Please use text input instead.');
                this.updateRecordingUI(false);
                this.isRecording = false;
                this.offerTextInputAlternative();
            }
        } catch (error) {
            console.error('Error in startRecording:', error);
            this.addMessageToChat('ai', 'An error occurred. Please try text input instead.');
            this.updateRecordingUI(false);
            this.offerTextInputAlternative();
        }
    }

    stopRecording() {
        this.isRecording = false;
        
        // Clear any pending timeout
        if (this.recognitionTimeout) {
            clearTimeout(this.recognitionTimeout);
            this.recognitionTimeout = null;
        }
        
        try {
            this.recognition.stop();
        } catch (error) {
            console.error('Error stopping recognition:', error);
        }
        
        this.updateRecordingUI(false);
        this.currentMessage = null;
    }

    updateRecordingUI(isRecording) {
        this.recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
        this.recordButton.classList.toggle('recording', isRecording);
        
        // Update the recording status text with more informative messages
        if (isRecording) {
            this.recordingStatus.textContent = 'Listening... Speak now';
            this.recordingStatus.style.color = '#4CAF50'; // Green to indicate active
            
            // Add pulsing animation to the status text
            this.recordingStatus.style.animation = 'pulse 1.5s infinite';
        } else {
            this.recordingStatus.textContent = 'Click to start speaking';
            this.recordingStatus.style.color = ''; // Reset to default
            this.recordingStatus.style.animation = ''; // Remove animation
        }
        
        // Also add a visual recording indicator
        if (!this.recordingIndicator) {
            this.recordingIndicator = document.createElement('div');
            this.recordingIndicator.className = 'recording-indicator';
            
            // Add styles if they don't exist
            if (!document.getElementById('recording-indicator-style')) {
                const style = document.createElement('style');
                style.id = 'recording-indicator-style';
                style.textContent = `
                    .recording-indicator {
                        width: 12px;
                        height: 12px;
                        background-color: #f44336;
                        border-radius: 50%;
                        display: inline-block;
                        margin-right: 8px;
                        vertical-align: middle;
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    }
                    .recording-indicator.active {
                        opacity: 1;
                        animation: pulse 1.5s infinite;
                    }
                    @keyframes pulse {
                        0% { transform: scale(0.95); opacity: 1; }
                        50% { transform: scale(1.1); opacity: 0.8; }
                        100% { transform: scale(0.95); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }
            
            // Insert indicator before status text
            this.recordingStatus.parentNode.insertBefore(this.recordingIndicator, this.recordingStatus);
        }
        
        // Toggle active state
        if (this.recordingIndicator) {
            this.recordingIndicator.classList.toggle('active', isRecording);
        }
    }

    addMessageToChat(sender, text) {
        if (sender === 'user' && this.isRecording && this.currentMessage) {
            // Update the existing message during recording
            this.currentMessage.textContent = text;
        } else {
            // Create a new message for AI responses or when not recording
            const messageDiv = document.createElement('div');
            messageDiv.classList.add('message', `${sender}-message`);
            messageDiv.textContent = text;
            this.chatMessages.appendChild(messageDiv);
        }
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async generateResponse(userInput) {
        this.processingResponse = true;
        this.stopRecording();

        try {
            // Simulate AI response generation
            let response = await this.getAIResponse(userInput);
            
            // Add AI response to chat
            this.addMessageToChat('ai', response);

            // Convert response to speech and animate
            await this.facialAnimation.speakResponse(response);
        } catch (error) {
            console.error('Error generating response:', error);
            this.addMessageToChat('ai', 'I apologize, but I encountered an error. Please try again.');
        } finally {
            this.processingResponse = false;
        }
    }

    async getAIResponse(userInput) {
        try {
            const genAI = new GoogleGenerativeAI('AIzaSyCT43QYBuN8a4dA8Pq6i9wxXmgHPPnO8a0');
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const prompt = `You are a highly skilled, empathetic therapeutic human with expertise in evidence-based approaches including cognitive-behavioral therapy (CBT), mindfulness, and positive psychology. Your purpose is to provide supportive, reflective conversations while maintaining clear professional boundaries.

## Core Guidelines:
- Keep all responses concise, limited to 1-2 sentences maximum
- Practice active listening and validate emotions without judgment
- Use a warm, supportive tone with appropriate pacing
- Respond thoughtfully, reflecting the user's concerns with empathy
- Offer perspective and gentle reframing when appropriate
- Ask open-ended questions that promote self-reflection
- Provide evidence-based coping strategies and practical tools
- Maintain appropriate professional boundaries at all times

## Important Limitations:
- Clearly communicate you are not a licensed mental health professional
- Do not diagnose medical or psychiatric conditions
- Recommend professional help for serious concerns (suicidal thoughts, abuse, self-harm)
- Avoid making promises about outcomes or specific results
- Prioritize user safety above all else

## Session Structure:
1. Begin with a warm greeting and open-ended question about current concerns
2. Practice reflective listening to understand the underlying issues
3. Explore thoughts, feelings, and behaviors related to the situation
4. Collaborate on identifying patterns and potential areas for growth
5. Suggest relevant coping strategies or therapeutic techniques
6. Encourage small, achievable steps toward positive change
7. Close with validation and an invitation for further reflection

## Therapeutic Techniques:
- Cognitive restructuring for identifying and challenging unhelpful thoughts
- Mindfulness practices for grounding and present-moment awareness
- Values clarification to align actions with personal meaning
- Strengths-based approaches that build on existing resources
- Behavioral activation for depression and low motivation
- Emotion regulation strategies for intense feelings
- Problem-solving frameworks for navigating challenges

## Response Format:
- Always respond in just 1-2 concise sentences, even for complex topics
- Focus on the most essential insight or question in each response
- Use brief but impactful language that resonates emotionally
- When suggesting techniques, provide just one clear, actionable step

Always prioritize the user's wellbeing, maintain appropriate boundaries, and encourage professional help when needed. Respond to the following input from a client: "${userInput}"`;

            const result = await model.generateContent(prompt);
            const response = result.response.text();
            
            // Fallback responses in case of API failure
            if (!response) {
                return this.getFallbackResponse(userInput);
            }

            return response;
        } catch (error) {
            console.error('Error generating AI response:', error);
            return this.getFallbackResponse(userInput);
        }
    }

    getFallbackResponse(userInput) {
        const input = userInput.toLowerCase();
        
        // Handle repeated requests to talk
        if (input.includes('please') && (input.includes('talk') || input.includes('speak'))) {
            const conversationStarters = [
                "I'm here to listen and support you. What's on your mind today?",
                "I can hear that you want to talk. What would you like to share with me?",
                "You seem like you want to connect. I'm here for you - what would you like to discuss?"
            ];
            return conversationStarters[Math.floor(Math.random() * conversationStarters.length)];
        }

        // Default responses for when no specific keywords are matched
        const defaultResponses = [
            "I'm here to listen. What's on your mind?",
            "I understand. Would you like to tell me more?",
            "Your thoughts and feelings matter. What would you like to share?"
        ];

        return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
    }

    // Method to check microphone permissions
    async checkMicrophonePermission() {
        try {
            // Check if we already have microphone permission
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            
            if (permissionStatus.state === 'granted') {
                console.log('Microphone permission already granted');
                return true;
            } else if (permissionStatus.state === 'prompt') {
                // We'll need to ask for permission, show a hint to the user
                this.addMessageToChat('ai', 'Please allow microphone access when prompted to use speech recognition.');
            } else if (permissionStatus.state === 'denied') {
                // Permission has been denied, inform the user
                this.addMessageToChat('ai', 'Microphone access is blocked. Please enable it in your browser settings to use speech recognition.');
                return false;
            }
            
            // Add event listener for permission changes
            permissionStatus.onchange = () => {
                if (permissionStatus.state === 'granted') {
                    console.log('Microphone permission granted');
                } else {
                    console.log('Microphone permission not granted:', permissionStatus.state);
                    if (this.isRecording) {
                        this.stopRecording();
                    }
                }
            };
            
            return true;
        } catch (error) {
            console.error('Error checking microphone permission:', error);
            
            // Fallback to requesting permission directly if permissions API not supported
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop all tracks to release the microphone
                stream.getTracks().forEach(track => track.stop());
                console.log('Microphone permission granted through getUserMedia');
                return true;
            } catch (err) {
                console.error('Failed to get microphone permission:', err);
                this.addMessageToChat('ai', 'Microphone access is required for speech recognition.');
                return false;
            }
        }
    }

    // Offer text input as alternative when speech recognition fails
    offerTextInputAlternative() {
        // Create text input alternative if it doesn't exist
        if (!document.getElementById('text-input-alternative')) {
            console.log('Creating text input alternative');
            const chatInputArea = document.getElementById('chat-input-area');
            
            if (!chatInputArea) {
                console.error('Chat input area not found');
                return;
            }
            
            // Create container with improved styling
            const container = document.createElement('div');
            container.id = 'text-input-alternative';
            container.style.display = 'flex';
            container.style.marginTop = '15px';
            container.style.width = '100%';
            container.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
            container.style.borderRadius = '24px';
            container.style.padding = '5px';
            container.style.background = '#f9f9f9';
            
            // Create text input
            const input = document.createElement('input');
            input.id = 'text-input-field';
            input.type = 'text';
            input.placeholder = 'Type your message here...';
            input.style.flex = '1';
            input.style.padding = '12px 16px';
            input.style.borderRadius = '20px';
            input.style.border = '1px solid #ccc';
            input.style.marginRight = '10px';
            input.style.fontSize = '16px';
            input.style.background = 'white';
            
            // Create send button
            const button = document.createElement('button');
            button.textContent = 'Send';
            button.style.padding = '12px 20px';
            button.style.borderRadius = '20px';
            button.style.backgroundColor = '#4CAF50';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.cursor = 'pointer';
            button.style.fontSize = '16px';
            button.style.fontWeight = 'bold';
            
            // Make it more visible
            container.style.animation = 'fadeIn 0.5s';
            const styleEl = document.createElement('style');
            styleEl.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                #text-input-field:focus {
                    outline: none;
                    border-color: #4CAF50;
                    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
                }
                #text-input-alternative button:hover {
                    background-color: #45a049;
                    transform: translateY(-1px);
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                }
                #text-input-alternative button:active {
                    transform: translateY(1px);
                }
            `;
            document.head.appendChild(styleEl);
            
            // Add event listeners
            button.addEventListener('click', () => {
                const text = input.value.trim();
                if (text) {
                    this.addMessageToChat('user', text);
                    this.generateResponse(text);
                    input.value = '';
                }
            });
            
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const text = input.value.trim();
                    if (text) {
                        this.addMessageToChat('user', text);
                        this.generateResponse(text);
                        input.value = '';
                    }
                }
            });
            
            // Add to DOM
            container.appendChild(input);
            container.appendChild(button);
            chatInputArea.appendChild(container);
            
            // Focus the input
            setTimeout(() => input.focus(), 100);
        } else {
            // If it already exists, make sure it's visible and focused
            const input = document.getElementById('text-input-field');
            if (input) {
                input.parentElement.style.display = 'flex';
                setTimeout(() => input.focus(), 100);
            }
        }
    }

    // Add method to test connectivity to speech recognition servers
    async testNetworkConnectivity() {
        // We'll use a simple fetch to google.com as a proxy for checking overall connectivity
        try {
            // Try to fetch with a short timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('https://www.google.com/generate_204', { 
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('Network connectivity test passed');
            this.isOnline = true;
        } catch (error) {
            console.warn('Network connectivity test failed:', error);
            if (error.name === 'AbortError') {
                console.warn('Network request timed out - might have connectivity issues');
            }
            // Don't set offline immediately, but be prepared for issues
            this.networkErrorCount++;
        }
    }

    // Show detailed information about network errors
    showNetworkErrorExplanation() {
        const message = `
            There seems to be an issue with speech recognition.
            
            Common causes:
            - Firewall or security software blocking access
            - VPN or proxy interfering with connections
            - Corporate network restrictions
            - Speech servers may be unavailable
            
            Please use the text input below instead.
        `;
        
        this.addMessageToChat('ai', message.trim().replace(/\n\s+/g, ' ').replace(/\s\s+/g, ' '));
    }
    
    // Show explanation for browser compatibility issues
    showFallbackExplanation() {
        const message = `
            Speech recognition requires:
            - Chrome or Edge browser
            - Microphone permissions
            - Stable internet connection
            - Access to Google's speech servers
            
            You can still chat by typing below.
        `;
        
        this.addMessageToChat('ai', message.trim().replace(/\n\s+/g, ' ').replace(/\s\s+/g, ' '));
    }

    // Add brightness adjustment controls for VR mode
    addVRBrightnessControls() {
        const container = document.getElementById('animation-container');
        
        // Create buttons container
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'vr-brightness-controls';
        controlsContainer.style.position = 'fixed';
        controlsContainer.style.top = '20px';
        controlsContainer.style.right = '20px';
        controlsContainer.style.zIndex = '1000';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.flexDirection = 'column';
        controlsContainer.style.gap = '10px';
        
        // Create brightness increase button
        const increaseBtn = document.createElement('button');
        increaseBtn.textContent = '🔆 Brighter';
        increaseBtn.style.padding = '12px 20px';
        increaseBtn.style.borderRadius = '20px';
        increaseBtn.style.backgroundColor = '#ffcc80';
        increaseBtn.style.color = '#333';
        increaseBtn.style.border = 'none';
        increaseBtn.style.cursor = 'pointer';
        increaseBtn.style.fontWeight = 'bold';
        increaseBtn.style.fontSize = '16px';
        increaseBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        
        // Create brightness decrease button
        const decreaseBtn = document.createElement('button');
        decreaseBtn.textContent = '🔅 Dimmer';
        decreaseBtn.style.padding = '12px 20px';
        decreaseBtn.style.borderRadius = '20px';
        decreaseBtn.style.backgroundColor = '#90caf9';
        decreaseBtn.style.color = '#333';
        decreaseBtn.style.border = 'none';
        decreaseBtn.style.cursor = 'pointer';
        decreaseBtn.style.fontWeight = 'bold';
        decreaseBtn.style.fontSize = '16px';
        decreaseBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        
        // Create reset brightness button
        const resetBtn = document.createElement('button');
        resetBtn.textContent = '↺ Reset';
        resetBtn.style.padding = '12px 20px';
        resetBtn.style.borderRadius = '20px';
        resetBtn.style.backgroundColor = '#a5d6a7';
        resetBtn.style.color = '#333';
        resetBtn.style.border = 'none';
        resetBtn.style.cursor = 'pointer';
        resetBtn.style.fontWeight = 'bold';
        resetBtn.style.fontSize = '16px';
        resetBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        
        // Store current exposure value
        let currentExposure = this.renderer.toneMappingExposure;
        
        // Add event listeners
        increaseBtn.addEventListener('click', () => {
            if (this.vrLights) {
                // Increase spotlight intensity
                this.vrLights[0].intensity += 0.5; // Increase front light
                
                // Increase exposure
                this.renderer.toneMappingExposure += 0.2;
                currentExposure = this.renderer.toneMappingExposure;
                
                console.log('Increased brightness - Exposure:', currentExposure, 'Light intensity:', this.vrLights[0].intensity);
            }
        });
        
        decreaseBtn.addEventListener('click', () => {
            if (this.vrLights) {
                // Decrease spotlight intensity but keep above minimum
                this.vrLights[0].intensity = Math.max(1.0, this.vrLights[0].intensity - 0.5);
                
                // Decrease exposure but keep above minimum
                this.renderer.toneMappingExposure = Math.max(1.0, this.renderer.toneMappingExposure - 0.2);
                currentExposure = this.renderer.toneMappingExposure;
                
                console.log('Decreased brightness - Exposure:', currentExposure, 'Light intensity:', this.vrLights[0].intensity);
            }
        });
        
        resetBtn.addEventListener('click', () => {
            if (this.vrLights) {
                // Reset to duller default values
                this.vrLights[0].intensity = 2.3; // Default front light intensity for duller appearance
                this.renderer.toneMappingExposure = 1.5; // Default VR exposure for duller appearance
                currentExposure = this.renderer.toneMappingExposure;
                
                console.log('Reset brightness to defaults - Exposure:', currentExposure, 'Light intensity:', this.vrLights[0].intensity);
            }
        });
        
        // Add buttons to container
        controlsContainer.appendChild(increaseBtn);
        controlsContainer.appendChild(decreaseBtn);
        controlsContainer.appendChild(resetBtn);
        
        // Add container to the DOM
        container.appendChild(controlsContainer);
        
        // Store reference to remove when exiting VR
        this.brightnessControls = controlsContainer;
        
        // Hide initially if not in VR mode
        if (!this.renderer.xr.isPresenting) {
            controlsContainer.style.display = 'none';
        }
        
        // Update visibility based on VR state
        const updateVisibility = () => {
            if (this.renderer.xr.isPresenting) {
                controlsContainer.style.display = 'flex';
            } else {
                controlsContainer.style.display = 'none';
            }
        };
        
        // Monitor VR session state
        const xrManager = this.renderer.xr;
        if (xrManager) {
            const checkVRState = () => {
                updateVisibility();
                requestAnimationFrame(checkVRState);
            };
            checkVRState();
        }
    }

    // Reset character to original position when exiting VR
    resetCharacterOrientation() {
        // Try to find the character model
        let characterModel = null;
        
        if (this.modelLoader && this.modelLoader.model) {
            characterModel = this.modelLoader.model;
        }
        
        if (!characterModel) {
            this.scene.traverse(node => {
                if (node.userData && node.userData.originalRotation) {
                    characterModel = node;
                }
            });
        }
        
        if (characterModel && characterModel.userData.originalRotation) {
            // Restore original rotation and position
            characterModel.rotation.copy(characterModel.userData.originalRotation);
            characterModel.position.copy(characterModel.userData.originalPosition);
            console.log('Character orientation reset to original');
        }
        
        // Remove VR-specific lights
        if (this.vrLights) {
            this.vrLights.forEach(light => {
                if (light) this.scene.remove(light);
            });
            this.vrLights = null;
            
            // Reset tone mapping to normal value for duller appearance
            this.renderer.toneMappingExposure = 1.3;
            
            console.log('VR-specific lighting removed');
        }
        
        // Clean up VR interaction elements
        if (this.vrCameraHelper) {
            this.scene.remove(this.vrCameraHelper);
        }
        
        if (this.vrButtonGroup) {
            this.scene.remove(this.vrButtonGroup);
        }
        
        // Reset VR recording state
        this.isVRRecording = false;
        
        // Remove brightness controls
        if (this.brightnessControls) {
            this.brightnessControls.remove();
            this.brightnessControls = null;
            console.log('VR brightness controls removed');
        }
    }
}

class FacialAnimationSystem {
    constructor(chatbotInstance) {
        this.chatbotInstance = chatbotInstance;
        
        // Initialize other properties
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.initScene();
        this.audioManager = new AudioManager();
        this.emotionalState = {
            emphasis: 0
        };
        
        // Animation state
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.nextBlinkTime = null;
        this.eyeLookTarget = { x: 0, y: 0 };
        this.currentEyeLook = { x: 0, y: 0 };
        this.eyeMovementTime = null;
        
        // Phoneme-based lip sync
        this.phonemeLipSync = new PhonemeLipSyncService();
        this.currentVisemeTimeline = null;
        this.audioStartTime = 0;
        
        // Animation variables
        this.clock = new THREE.Clock();
        this.modelLoader = new ModelLoader();
        
        // Transition state for smooth lip sync ending
        this.transitionToRestingFace = false;
        this.transitionStartTime = null;
        this.morphStartState = null;
        
        // Bind methods
        this.updateMorphTargets = this.updateMorphTargets.bind(this);
        
        // Initialize audio
        this.audioManager.initialize().then(() => {
            console.log('Audio manager initialized');
            // Get analyzer from audio manager
            this.analyzer = this.audioManager.getAnalyzer();
            this.audioContext = this.audioManager.getAudioContext();
        });
        
        // Load the model
        this.loadFacialModel();
    }

    async loadFacialModel() {
        try {
            const modelLoader = this.modelLoader;
            const model = await modelLoader.loadModel('/assets/models/model_full.glb');
            
            // Keep the model at its original size and position
            // For full body models, adjust Y position to place feet on ground
            model.position.y = 0; // Ensure the model sits at the origin Y
            this.scene.add(model);
            
            // Enhance the material properties for more realistic skin appearance
            this.enhanceModelMaterials(model);
            
            // Add a button to reset the model to its original state
            this.addResetModelButton();
            
            // Find mesh with morph targets but don't apply animations yet
            this.morphTargetMesh = modelLoader.findMorphTargetMesh(model);
            
            if (!this.morphTargetMesh) {
                throw new Error('No mesh with morph targets found in the model');
            }
            
            // Initialize morph targets for lip sync
            this.initializeMorphTargets();
            
            // Skip creating default animation which might affect appearance
            console.log('Using original model animation only');
            
            // Load the room model and position character within it
            this.loadRoomModel(model);
            
            return model;
        } catch (error) {
            console.error('Failed to load facial model:', error);
        }
    }
    
    // Enhance material properties for more realistic skin appearance
    enhanceModelMaterials(model) {
        if (!model) return;
        
        console.log('Enhancing model material properties for better skin appearance');
        
        model.traverse(node => {
            if (node.isMesh && node.material) {
                // Check if this is likely a skin material by examining name or color
                const isSkinMaterial = 
                    (node.material.name && /skin|face|head|body/i.test(node.material.name)) ||
                    (node.material.color && 
                     (node.material.color.r > 0.5 && 
                      node.material.color.g > 0.3 && 
                      node.material.color.g < node.material.color.r));
                
                if (isSkinMaterial) {
                    console.log('Enhancing skin material:', node.material.name || 'unnamed');
                    
                    // Adjust skin tone to be slightly darker and more natural
                    if (node.material.color) {
                        // Create a slightly darker, naturally warm skin tone
                        const color = node.material.color;
                        // Reduce brightness while maintaining warmth
                        color.r = Math.min(0.95, color.r * 1.15); // Less red but still warm
                        color.g = Math.min(0.85, color.g * 1.05); // Less increase in green
                        color.b = Math.min(0.75, color.b * 0.95); // Slightly lower blue for warmth
                    }
                    
                    // Adjust material properties for duller appearance
                    node.material.roughness = 0.85; // Higher roughness for duller, less glossy skin
                    node.material.metalness = 0.08; // Lower metalness for more natural look
                    
                    // Reduce subsurface scattering for less translucent look
                    if (node.material.transmission !== undefined) {
                        node.material.transmission = 0.10; // Reduced translucency for duller appearance
                    }
                    
                    // Reduce specular if available
                    if (node.material.specular !== undefined) {
                        // If the material has a specular component, reduce it
                        if (node.material.specular.isColor) {
                            node.material.specular.multiplyScalar(0.7); // Reduce specular by 30%
                        }
                    }
                    
                    // Other texture adjustments
                    if (node.material.map) {
                        node.material.map.encoding = THREE.SRGBColorSpace;
                    }
                } else if (node.material.name && /cloth|dress|shirt|pant|jacket/i.test(node.material.name)) {
                    // Make clothing materials duller too
                    node.material.roughness = Math.min(1.0, node.material.roughness * 1.2);
                    node.material.metalness = Math.max(0.05, node.material.metalness * 0.8);
                }
                
                // General material improvements
                node.material.side = THREE.FrontSide; // Ensure proper rendering
                node.material.needsUpdate = true;
                
                // Add shadow capabilities
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });
    }

    async loadRoomModel(characterModel) {
        try {
            console.log('Loading room model...');
            const loader = new GLTFLoader();
            
            // Load the room model
            const roomGltf = await new Promise((resolve, reject) => {
                loader.load('/assets/models/room.glb', resolve, undefined, reject);
            });
            
            const roomModel = roomGltf.scene;
            
            // Enable shadows on the room
            roomModel.traverse(node => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    
                    // Improve material quality
                    if (node.material) {
                        node.material.side = THREE.FrontSide;
                        node.material.needsUpdate = true;
                    }
                }
            });
            
            // Add room to scene
            this.scene.add(roomModel);
            console.log('Room model added to scene');
            
            // Get the room's bounding box for measurements
            const roomBounds = new THREE.Box3().setFromObject(roomModel);
            const roomSize = new THREE.Vector3();
            roomBounds.getSize(roomSize);
            const roomCenter = new THREE.Vector3();
            roomBounds.getCenter(roomCenter);
            
            console.log('Room dimensions:', roomSize, 'Center:', roomCenter);
            
            // Get the floor Y position - use the minimum Y of the room bounds
            const floorY = roomBounds.min.y;
            console.log('Floor Y position (from bounds):', floorY);
            
            // Find the floor in the room model for more precise positioning
            let floorMesh = null;
            roomModel.traverse(node => {
                // Look for common floor naming or large horizontal surfaces
                if (node.isMesh && 
                   (node.name.toLowerCase().includes('floor') || 
                    node.name.toLowerCase().includes('ground'))) {
                    floorMesh = node;
                }
            });
            
            // Get character's bounding box to measure its dimensions
            const characterBounds = new THREE.Box3().setFromObject(characterModel);
            const characterSize = new THREE.Vector3();
            characterBounds.getSize(characterSize);
            const characterHeight = characterSize.y;
            
            console.log('Character height:', characterHeight);
            
            // Calculate the position offset needed to place feet on floor
            const feetOffset = characterBounds.min.y - characterModel.position.y;
            console.log('Character feet offset:', feetOffset);
            
            // Position character in the room
            characterModel.position.set(
                roomCenter.x, // Center horizontally
                floorY - feetOffset + 0.85, // Place feet exactly on the floor with small offset to prevent clipping
                roomCenter.z // Center depth-wise
            );
            
            // If the character height is too small compared to the room (less than 60% of room height)
            // scale it up to make it more visible and proportional to the room
            const scaleRatio = roomSize.y / characterHeight;
            
            if (scaleRatio > 3) {
                // Scale up the character to a more visible size
                const newScale = 1.8; // Increase scale more for better visibility
                characterModel.scale.set(newScale, newScale, newScale);
                console.log('Character scaled up by factor of', newScale);
                
                // Recalculate bounding box after scaling
                const newBounds = new THREE.Box3().setFromObject(characterModel);
                const newFeetOffset = newBounds.min.y - characterModel.position.y;
                
                // Adjust position again after scaling to ensure feet are on floor
                characterModel.position.y = floorY - newFeetOffset + 0.85; // Small offset to prevent z-fighting
            }
            
            console.log('Character positioned at:', characterModel.position);
            
            // Make sure character casts shadows
            characterModel.traverse(node => {
                if (node.isMesh) {
                    node.castShadow = true;
                    
                    // Make sure materials render properly
                    if (node.material) {
                        node.material.needsUpdate = true;
                    }
                }
            });
            
            // Make sure the entire character is visible
            // Position camera to show full body
            this.adjustCameraForFullBodyView(characterModel, roomBounds);
            
            // Update room lighting to match the environment
            this.updateLightingForRoom(roomModel);
            
            return roomModel;
        } catch (error) {
            console.error('Failed to load room model:', error);
        }
    }
    
    adjustCameraForFullBodyView(characterModel, roomBounds) {
        // Calculate the character's bounding box
        const characterBounds = new THREE.Box3().setFromObject(characterModel);
        const characterSize = new THREE.Vector3();
        characterBounds.getSize(characterSize);
        const characterCenter = new THREE.Vector3();
        characterBounds.getCenter(characterCenter);
        
        // Position camera to view the full character body
        const distanceToShowFullBody = characterSize.y * 2.0; // Increased for better view
        const heightOffset = characterSize.y * 0.4; // Look at the upper body
        
        // Position camera to look at character from an angle
        this.camera.position.set(
            characterCenter.x + distanceToShowFullBody * 0.7,
            characterCenter.y + heightOffset,
            characterCenter.z + distanceToShowFullBody * 0.7
        );
        
        // Point camera at character's upper body
        const lookAtPoint = new THREE.Vector3(
            characterCenter.x,
            characterCenter.y + (characterSize.y * 0.2), // Look at upper body
            characterCenter.z
        );
        this.camera.lookAt(lookAtPoint);
        
        // Update orbit controls to target the character
        this.controls.target.copy(lookAtPoint);
        
        // Adjust control limits to prevent going through the floor or too far away
        this.controls.minDistance = characterSize.y * 1.0;
        this.controls.maxDistance = characterSize.y * 5.0;
        this.controls.update();
        
        console.log('Camera adjusted for full body view');
    }
    
    updateLightingForRoom(roomModel) {
        // Remove existing lights
        this.scene.children.forEach(child => {
            if (child.isLight && !(child instanceof THREE.AmbientLight)) {
                this.scene.remove(child);
            }
        });
        
        // Create new lighting setup appropriate for indoor scene
        
        // Slightly reduce ambient light for more shadows and depth
        const ambientLight = this.scene.children.find(child => child instanceof THREE.AmbientLight);
        if (ambientLight) {
            ambientLight.intensity = 0.6; // Reduced for more shadows and less shine
            ambientLight.color.set(0xfffaf0); // Keep warm white for natural skin tones
        } else {
            // Create ambient light if not found
            const newAmbient = new THREE.AmbientLight(0xfffaf0, 0.6);
            this.scene.add(newAmbient);
        }
        
        // Create main directional light (window light) with warmer tone but reduced intensity
        const mainLight = new THREE.DirectionalLight(0xfff0e0, 0.9); // Warmer light but slightly reduced intensity
        mainLight.position.set(10, 8, 5);
        mainLight.castShadow = true;
        
        // Better shadow settings
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.bias = -0.0001;
        
        // Adjust shadow camera to cover the room
        const shadowSize = 10;
        mainLight.shadow.camera.left = -shadowSize;
        mainLight.shadow.camera.right = shadowSize;
        mainLight.shadow.camera.top = shadowSize;
        mainLight.shadow.camera.bottom = -shadowSize;
        
        this.scene.add(mainLight);
        
        // Add some soft fill lights for the room with warmer tones but reduced intensity
        const fillLight1 = new THREE.PointLight(0xffe8d9, 0.5); // Warmer color but lower intensity
        fillLight1.position.set(-5, 5, -5);
        fillLight1.decay = 1.7; // Higher decay for less spread
        this.scene.add(fillLight1);
        
        const fillLight2 = new THREE.PointLight(0xffeedd, 0.4); // Warm light, reduced intensity
        fillLight2.position.set(5, 2, -5);
        fillLight2.decay = 1.7; // Higher decay for less spread
        this.scene.add(fillLight2);
        
        // ======= CHARACTER-SPECIFIC LIGHTING - TUNED FOR NATURAL DULLER SKIN =======
        
        // Primary character spotlight - warm tone but reduced intensity for duller appearance
        const characterSpotlight = new THREE.SpotLight(0xffe3c8, 2.0); // Warm light color, reduced intensity
        characterSpotlight.position.set(0, 8, 5);
        characterSpotlight.angle = Math.PI / 5; // Wider angle
        characterSpotlight.penumbra = 0.7; // Softer edges
        characterSpotlight.decay = 0.6; // Slightly higher decay for less intense light
        characterSpotlight.distance = 25; // Maintain distance
        characterSpotlight.target.position.set(0, 1.5, 0); // Aim at character's upper body
        
        characterSpotlight.castShadow = true;
        characterSpotlight.shadow.bias = -0.002; // Adjust shadow bias
        
        this.scene.add(characterSpotlight);
        this.scene.add(characterSpotlight.target);
        
        // Add secondary front light for the character - warm but reduced intensity
        const characterFrontLight = new THREE.SpotLight(0xffdfc4, 1.7); // Warm skin tone light, reduced intensity
        characterFrontLight.position.set(0, 1.8, 8); // Position in front
        characterFrontLight.angle = Math.PI / 7;
        characterFrontLight.penumbra = 0.8; // Softer edges
        characterFrontLight.decay = 0.7; // Higher decay for less spread
        characterFrontLight.distance = 20; // Maintain range
        characterFrontLight.target.position.set(0, 1.5, 0);
        this.scene.add(characterFrontLight);
        this.scene.add(characterFrontLight.target);
        
        // Add fill light from below - reduced intensity
        const characterFillLight = new THREE.PointLight(0xffe0c0, 0.9); // Warm bounce light, reduced intensity
        characterFillLight.position.set(0, 0.8, 4);
        characterFillLight.distance = 10;
        characterFillLight.decay = 1.2; // Higher decay
        this.scene.add(characterFillLight);
        
        // Add a subtle rim light behind character
        const rimLight = new THREE.PointLight(0xfff6e9, 0.6); // Reduced intensity
        rimLight.position.set(0, 1.6, -3); // Behind character
        rimLight.decay = 1.3; // Higher decay
        rimLight.distance = 10;
        this.scene.add(rimLight);
        
        // Enable renderer shadows if they weren't already
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Slightly reduce tone mapping exposure for duller appearance
        this.renderer.toneMappingExposure = 1.3; // Reduced from 1.5
        
        console.log('Room lighting updated for duller, more natural skin appearance');
    }

    initializeMorphTargets() {
        // Get all available morph targets
        this.availableMorphs = Object.keys(this.morphTargetMesh.morphTargetDictionary);
        console.log('All available morph targets:', this.availableMorphs);

        // Group morph targets by type
        this.morphGroups = {
            eyes: this.availableMorphs.filter(name => name.toLowerCase().includes('eye')),
            mouth: this.availableMorphs.filter(name => name.toLowerCase().includes('mouth')),
            brow: this.availableMorphs.filter(name => name.toLowerCase().includes('brow')),
            cheek: this.availableMorphs.filter(name => name.toLowerCase().includes('cheek')),
            nose: this.availableMorphs.filter(name => name.toLowerCase().includes('nose')),
            jaw: this.availableMorphs.filter(name => name.toLowerCase().includes('jaw')),
            viseme: this.availableMorphs.filter(name => name.toLowerCase().includes('viseme')),
            other: this.availableMorphs.filter(name => 
                !name.toLowerCase().match(/(eye|mouth|brow|cheek|nose|jaw|viseme)/))
        };

        console.log('Morph target groups:', this.morphGroups);

        // Initialize all morph target influences to 0
        this.morphTargetMesh.morphTargetInfluences.fill(0);
    }

    initScene() {
        // Three.js setup
        this.scene = new THREE.Scene();
        
        // Calculate aspect ratio based on container size
        const container = document.getElementById('animation-container');
        const aspect = container.clientWidth / container.clientHeight;
        
        // Use a more standard field of view that won't distort the model
        this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: false, // No transparent background when using room
            preserveDrawingBuffer: true 
        });
        
        // Enable VR with specific XR features
        this.renderer.xr.enabled = true;
        
        // Enable shadows and higher quality rendering
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Enable tone mapping and correct color space
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2; // Slightly brighter for indoor scene
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);

        // Create VR Button with mobile VR support
        const createVRButton = () => {
            const button = document.createElement('button');
            button.className = 'vr-button';
            button.textContent = 'ENTER VR MODE';
            
            // Style the button for better mobile visibility
            const style = document.createElement('style');
            style.textContent = `
                .vr-button {
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    padding: 20px 40px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 30px;
                    cursor: pointer;
                    z-index: 999;
                    font-size: 24px;
                    font-weight: bold;
                    box-shadow: 0 6px 12px rgba(0,0,0,0.3);
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    -webkit-tap-highlight-color: transparent;
                    transition: all 0.3s ease;
                    width: 80%;
                    max-width: 300px;
                }
                .vr-button:hover {
                    background: #45a049;
                    transform: translateX(-50%) scale(1.05);
                }
                .vr-button:active {
                    transform: translateX(-50%) scale(0.95);
                }
                @media (max-width: 768px) {
                    .vr-button {
                        bottom: 40px;
                        padding: 24px 40px;
                        font-size: 28px;
                        width: 90%;
                    }
                }
                .vr-button-unavailable {
                    background: #cccccc;
                    color: #666666;
                    cursor: not-allowed;
                }
                .vr-notice {
                    position: fixed;
                    bottom: 150px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0,0,0,0.7);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 20px;
                    font-size: 14px;
                    max-width: 90%;
                    text-align: center;
                    z-index: 998;
                    display: none;
                }
            `;
            document.head.appendChild(style);

            // Create notice element for XR status
            const vrNotice = document.createElement('div');
            vrNotice.className = 'vr-notice';
            document.body.appendChild(vrNotice);
            
            // Check for WebXR support
            const checkXRSupport = async () => {
                if (!navigator.xr) {
                    button.classList.add('vr-button-unavailable');
                    button.textContent = 'VR NOT SUPPORTED';
                    vrNotice.textContent = 'WebXR is not available in your browser.';
                    vrNotice.style.display = 'block';
                    setTimeout(() => {
                        vrNotice.style.display = 'none';
                    }, 5000);
                    return false;
                }
                
                try {
                    // Check for 'immersive-vr' session support
                    const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
                    if (!isSupported) {
                        button.classList.add('vr-button-unavailable');
                        button.textContent = 'VR NOT AVAILABLE';
                        vrNotice.textContent = 'VR mode is not available on this device.';
                        vrNotice.style.display = 'block';
                        setTimeout(() => {
                            vrNotice.style.display = 'none';
                        }, 5000);
                        return false;
                    }
                    
                    return true;
                } catch (error) {
                    console.error('Error checking XR support:', error);
                    button.classList.add('vr-button-unavailable');
                    button.textContent = 'VR ERROR';
                    return false;
                }
            };
            
            // Check support immediately
            checkXRSupport();
            
            // Handle VR session with specific configuration for mobile VR
            button.addEventListener('click', async () => {
                try {
                    // Make sure we're still supported
                    const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
                    if (!isSupported) {
                        alert('VR mode is not supported on this device or browser.');
                        return;
                    }
                    
                    if (this.renderer.xr.isPresenting) {
                        // If already in VR, exit session
                        this.renderer.xr.getSession().end();
                        return;
                    }
                    
                    // Request VR session with mobile-friendly options
                    const session = await navigator.xr.requestSession('immersive-vr', {
                        optionalFeatures: [
                            'local-floor',
                            'bounded-floor',
                            'hand-tracking',
                            'layers'
                        ]
                    });
                    
                    // Setup VR session
                    await this.renderer.xr.setSession(session);
                    
                    // Position camera for VR to face the front of the character
                    // Place camera directly in front of character
                    this.camera.position.set(0, 1.6, 4.0); // Move camera further in front
                    this.camera.lookAt(0, 1.6, 0);
                    
                    // Ensure the character is oriented to face the VR camera
                    this.orientCharacterForVR();
                    
                    // Add VR interaction elements (recording button and crosshair)
                    this.addVRInteractionElements(this.modelLoader.model);
                    
                    button.textContent = 'EXIT VR';
                    
                    // Reset button when session ends
                    session.addEventListener('end', () => {
                        button.textContent = 'ENTER VR MODE';
                        // Reset camera and controls for non-VR viewing
                        this.camera.position.set(0, 1.6, 2.0);
                        this.camera.lookAt(0, 1.6, 0);
                        this.controls.target.set(0, 1.6, 0);
                        this.controls.update();
                        
                        // Reset character orientation to original state
                        this.resetCharacterOrientation();
                    });
                    
                    // Mobile VR specific handler for orientation change
                    window.addEventListener('orientationchange', () => {
                        setTimeout(() => {
                            if (this.renderer.xr.isPresenting) {
                                const container = document.getElementById('animation-container');
                                const aspect = container.clientWidth / container.clientHeight;
                                this.camera.aspect = aspect;
                                this.camera.updateProjectionMatrix();
                                this.renderer.setSize(container.clientWidth, container.clientHeight);
                                
                                // Re-orient character when orientation changes
                                this.orientCharacterForVR();
                            }
                        }, 200);
                    });
                    
                    // Add VR brightness adjustment buttons
                    this.addVRBrightnessControls();
                    
                    // Add double-tap to re-center functionality for mobile VR
                    let lastTapTime = 0;
                    const container = document.getElementById('animation-container');
                    container.addEventListener('touchend', (event) => {
                        if (this.renderer.xr.isPresenting) {
                            const currentTime = new Date().getTime();
                            const tapLength = currentTime - lastTapTime;
                            
                            if (tapLength < 500 && tapLength > 0) {
                                // Double tap detected
                                console.log('Double tap detected, re-orienting VR view');
                                // Re-orient camera to face character
                                const xrCamera = this.renderer.xr.getCamera();
                                xrCamera.position.set(0, 1.6, 3.0);
                                xrCamera.lookAt(0, 1.6, 0);
                                
                                // Re-orient character
                                this.orientCharacterForVR();
                                
                                event.preventDefault();
                            }
                            lastTapTime = currentTime;
                        }
                    });
                    
                    // Add a one-time listener for the first XR frame to ensure correct positioning
                    const onFirstXRFrame = () => {
                        // Force the VR camera to be in front of the character
                        const xrCamera = this.renderer.xr.getCamera();
                        // Position the camera in front of the character
                        xrCamera.position.set(0, 1.6, 4.0); // Further in front for better view
                        xrCamera.lookAt(0, 1.6, 0);
                        
                        // Remove the one-time listener
                        this.renderer.xr.getSession().removeEventListener('inputsourceschange', onFirstXRFrame);
                        console.log('VR camera positioned to face the character front');
                    };
                    
                    session.addEventListener('inputsourceschange', onFirstXRFrame);
                    
                } catch (error) {
                    console.error('VR initialization error:', error);
                    vrNotice.textContent = 'Error entering VR: ' + (error.message || 'Unknown error');
                    vrNotice.style.display = 'block';
                    setTimeout(() => {
                        vrNotice.style.display = 'none';
                    }, 5000);
                }
            });

            return button;
        };

        // Add VR button to container
        const vrButton = createVRButton();
        container.appendChild(vrButton);

        // Position camera at a standard human eye level looking straight ahead
        this.camera.position.set(0, 1.6, 2.0);
        this.camera.lookAt(0, 1.6, 0);

        // Set up the scene environment
        this.scene.background = new THREE.Color(0x1a1a1a); // This will be overridden when the room is loaded

        // Standard lighting setup - this will be replaced by the room-specific lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // Main key light (front facing)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
        keyLight.position.set(0, 1.8, 2.5);
        keyLight.target.position.set(0, 1.6, 0);
        keyLight.castShadow = true;
        
        // Set up shadow properties for the key light
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 20;
        keyLight.shadow.bias = -0.0001;
        
        this.scene.add(keyLight);
        this.scene.add(keyLight.target);

        // Fill light (left side)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-2, 1.8, 0);
        this.scene.add(fillLight);

        // Rim light (behind subject)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
        rimLight.position.set(0, 1.8, -2);
        this.scene.add(rimLight);

        // Controls for non-VR mode
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;
        this.controls.minDistance = 1.0;
        this.controls.maxDistance = 20.0; // Increased to allow viewing entire room
        
        // Set orbit target to match the model's head position
        this.controls.target.set(0, 1.6, 0);
        this.controls.update();

        // Handle window resizing
        window.addEventListener('resize', () => {
            const container = document.getElementById('animation-container');
            const aspect = container.clientWidth / container.clientHeight;
            this.camera.aspect = aspect;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        });

        // Set up the animation loop with XR support
        this.clock = new THREE.Clock();

        // Animation loop with enhanced VR support
        const animate = () => {
            this.renderer.setAnimationLoop(() => {
                const delta = this.clock.getDelta();
                
                // Always update the animation mixer to play the original avaturn_animation
                // regardless of speech state
                if (this.modelLoader && this.modelLoader.getMixer()) {
                    this.modelLoader.updateMixer(delta);
                }
                
                // Update controls only in non-VR mode
                if (!this.renderer.xr.isPresenting) {
                    this.controls.update();
                } else {
                    // In VR mode, handle any additional VR-specific updates
                    this.handleVRUpdates();
                }
                
                // Update morph targets based on animation state
                this.updateMorphTargets();
                
                // Render the scene
                this.renderer.render(this.scene, this.camera);
            });
        };

        animate();
    }

    updateMorphTargets() {
        if (this.morphTargetMesh) {
            if (this.isAudioPlaying) {
                // Apply phoneme-based lip sync animation 
                this.applyPhonemeLipSync();
            } else if (this.transitionToRestingFace) {
                // Apply transition to resting face
                this.applyRestingFaceTransition();
            } else {
                // Ensure morphs are zeroed out
                this.morphTargetMesh.morphTargetInfluences.fill(0);
                // Apply eye movements in non-speaking state
                this.applyEyeMovements();
            }
        }
    }

    applyMorphTarget(name, value) {
        if (!this.morphTargetMesh || !this.morphTargetMesh.morphTargetDictionary) return;
        
        const dict = this.morphTargetMesh.morphTargetDictionary;
        if (name in dict) {
            const index = dict[name];
            this.morphTargetMesh.morphTargetInfluences[index] = value;
            return true;
        }
        return false;
    }

    applyPhonemeLipSync() {
        if (!this.morphTargetMesh || !this.isAudioPlaying || !this.currentVisemeTimeline) return;
        
        // Calculate current time in the audio playback
        const currentAudioTime = (performance.now() - this.audioStartTime) / 1000;
        
        // Check if we've reached the end of the viseme timeline - use a stricter check
        const lastViseme = this.currentVisemeTimeline[this.currentVisemeTimeline.length - 1];
        if (lastViseme && currentAudioTime >= lastViseme.endTime) {
            // We've reached the end of the timeline, immediately start transition to resting
            console.log('End of viseme timeline reached at time', currentAudioTime, 'ending at', lastViseme.endTime);
            this.isAudioPlaying = false;
            this.transitionToRestingFace = true;
            this.transitionStartTime = null;
            return;
        }
        
        // Get the current viseme based on audio time
        const visemeData = this.phonemeLipSync.getVisemeAtTime(this.currentVisemeTimeline, currentAudioTime);
        
        // Store the last 4 visemes to create smoother transitions
        if (!this.lastVisemes) {
            this.lastVisemes = Array(4).fill(visemeData);
        } else {
            // Shift the array and add the new viseme
            this.lastVisemes.shift();
            this.lastVisemes.push(visemeData);
        }
        
        // Apply weighted averaging with emphasis on the current viseme for more responsive movements
        // This creates more defined mouth shapes with some smoothing
        const weights = [0.05, 0.10, 0.20, 0.65]; // More emphasis on current viseme (last one)
        
        // Reset all viseme-related morphs before applying new ones
        for (const morphName of this.morphGroups.viseme) {
            this.applyMorphTarget(morphName, 0);
        }
        
        // Apply weighted visemes for smooth transition with more defined shapes
        this.lastVisemes.forEach((viseme, index) => {
            const weight = weights[index];
            // Apply the primary viseme with weighted influence
            if (viseme && viseme.viseme) {
                this.applyMorphTarget(viseme.viseme, viseme.intensity * weight);
            }
        });
        
        // Apply secondary morph targets from current viseme with enhanced intensities
        const currentViseme = this.lastVisemes[3]; // Last in array (most recent)
        if (currentViseme && currentViseme.secondaryMorphs) {
            currentViseme.secondaryMorphs.morphs.forEach(morphName => {
                // Apply with higher intensity for more defined movement
                this.applyMorphTarget(morphName, currentViseme.intensity * currentViseme.secondaryMorphs.weight * 0.85);
            });
        }
        
        // Add jaw movement - slightly more noticeable for emphasized speech
        const jawCycleSpeed = 0.003; // Slightly faster for more natural movement
        const jawMovement = Math.sin(performance.now() * jawCycleSpeed) * 0.01; // Increased amplitude
        this.applyMorphTarget("jawLeft", Math.max(0, jawMovement) * 0.04 * (currentViseme ? currentViseme.intensity : 0));
        this.applyMorphTarget("jawRight", Math.max(0, -jawMovement) * 0.04 * (currentViseme ? currentViseme.intensity : 0));
        
        // Enhance jawOpen for vowels to make mouth open more
        if (currentViseme && /viseme_(aa|O|E)/.test(currentViseme.viseme)) {
            const jawOpenBoost = /viseme_aa/.test(currentViseme.viseme) ? 0.35 : 0.25;
            this.applyMorphTarget("jawOpen", currentViseme.intensity * jawOpenBoost);
        }
        
        // Add occasional subtle micro-expressions during speech
        if (Math.random() < 0.003) { // Slightly more frequent
            const microExpression = Math.random() < 0.5 ? "browInnerUp" : "browOuterUpLeft";
            const intensity = 0.03; // Slightly more noticeable
            this.applyMorphTarget(microExpression, intensity);
        }
        
        // Apply minimal rest-state influence to allow for more expressive speech
        const restInfluence = 0.1; // Reduced to allow more movement
        this.applyMorphTarget("mouthClose", 0.02 * restInfluence);
        this.applyMorphTarget("mouthRollUpper", 0.02 * restInfluence);
    }

    applyRestingFace() {
        // Resting face - natural closed position
        this.applyMorphTarget("viseme_sil", 0.2);
        this.applyMorphTarget("mouthClose", 0.12);
        this.applyMorphTarget("mouthRollUpper", 0.1);
        this.applyMorphTarget("mouthRollLower", 0.1);
        
        // Subtle idle movement
        const idleTime = performance.now() * 0.0001;
        const subtleMovement = Math.sin(idleTime) * 0.004;
        this.applyMorphTarget("mouthLeft", Math.max(0, subtleMovement) * 0.004);
        this.applyMorphTarget("mouthRight", Math.max(0, -subtleMovement) * 0.004);
    }

    // Method to smoothly transition to resting face
    applyRestingFaceTransition() {
        if (!this.transitionStartTime) {
            this.transitionStartTime = performance.now();
            this.transitionDuration = 300; // 300ms transition
            
            // Save current state of morphs
            if (!this.morphStartState && this.morphTargetMesh) {
                this.morphStartState = [...this.morphTargetMesh.morphTargetInfluences];
            }
        }
        
        const now = performance.now();
        const elapsed = now - this.transitionStartTime;
        const progress = Math.min(1.0, elapsed / this.transitionDuration);
        
        // Apply cubic easing for natural movement
        const easedProgress = this.cubicEaseOut(progress);
        
        if (progress >= 1.0) {
            // Transition complete
            this.transitionToRestingFace = false;
            this.transitionStartTime = null;
            this.morphStartState = null;
            
            // Ensure all morph targets are reset
            this.morphTargetMesh.morphTargetInfluences.fill(0);
            
            // Enable eye movements only
            this.applyEyeMovements();
            return;
        }
        
        // Reset all morph targets first
        this.morphTargetMesh.morphTargetInfluences.fill(0);
        
        // Apply eye movements during transition
        this.applyEyeMovements();
        
        // Apply transition to neutral expression/closed mouth
        if (this.morphStartState) {
            const dictionary = this.morphTargetMesh.morphTargetDictionary;
            
            // Special treatment for mouth-related morphs
            const mouthMorphs = [
                'mouthClose', 'viseme_sil', 'mouthRollUpper', 'mouthRollLower',
                'mouthStretchLeft', 'mouthStretchRight', 'mouthPucker', 'mouthFunnel',
                'jawOpen', 'jawForward', 'jawLeft', 'jawRight'
            ];
            
            // Gradually close mouth by zeroing mouth morphs and applying specific closed-mouth morphs
            mouthMorphs.forEach(morphName => {
                if (morphName in dictionary) {
                    const index = dictionary[morphName];
                    const startValue = this.morphStartState[index] || 0;
                    
                    // Special handling for closing morphs - increase their influence
                    if (morphName === 'mouthClose' || morphName === 'viseme_sil' || morphName === 'mouthRollUpper') {
                        // Target values for closed mouth
                        const targetValue = morphName === 'mouthClose' ? 0.12 : 
                                          morphName === 'viseme_sil' ? 0.2 : 
                                          morphName === 'mouthRollUpper' ? 0.1 : 0;
                        
                        // Interpolate from current to target
                        const value = startValue * (1 - easedProgress) + targetValue * easedProgress;
                        this.morphTargetMesh.morphTargetInfluences[index] = value;
                    } else {
                        // For other mouth morphs, gradually reduce to zero
                        this.morphTargetMesh.morphTargetInfluences[index] = startValue * (1 - easedProgress);
                    }
                }
            });
        }
    }
    
    // Cubic ease out function for smoother transitions
    cubicEaseOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    applyEyeMovements() {
        if (!this.morphTargetMesh) return;
        
        // Manage blinking
        if (!this.nextBlinkTime) {
            this.nextBlinkTime = performance.now() + Math.random() * 5000 + 1000;
            this.isBlinking = false;
            this.blinkProgress = 0;
        }
        
        const now = performance.now();
        
        // Check if it's time to blink
        if (!this.isBlinking && now > this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkProgress = 0;
        }
        
        // Process blinking animation
        if (this.isBlinking) {
            this.blinkProgress += 0.1; // Speed of blink
            
            // Blink curve (0 to 1 and back to 0)
            const blinkCurve = Math.sin(this.blinkProgress * Math.PI);
            this.applyMorphTarget("eyesClosed", blinkCurve);
            
            // End of blink
            if (this.blinkProgress >= 1) {
                this.isBlinking = false;
                this.nextBlinkTime = now + Math.random() * 5000 + 1000;
            }
        }
        
        // Natural eye movement
        if (!this.eyeMovementTime || now > this.eyeMovementTime) {
            this.eyeLookTarget = {
                x: (Math.random() * 2 - 1) * 0.5,
                y: (Math.random() * 2 - 1) * 0.3
            };
            this.eyeMovementTime = now + Math.random() * 3000 + 1000;
        }
        
        // Smooth eye movement
        this.currentEyeLook.x = this.smoothValue(this.currentEyeLook.x, this.eyeLookTarget.x, 0.05);
        this.currentEyeLook.y = this.smoothValue(this.currentEyeLook.y, this.eyeLookTarget.y, 0.05);
        
        // Apply eye look influences
        this.applyEyeLookInfluences();
    }

    applyEyeLookInfluences() {
        if (!this.morphTargetMesh) return;
        
        // Looking right
        if (this.currentEyeLook.x > 0) {
            this.applyMorphTarget("eyeLookOutRight", this.currentEyeLook.x);
            this.applyMorphTarget("eyeLookInLeft", this.currentEyeLook.x);
        } else {
            // Looking left
            this.applyMorphTarget("eyeLookOutLeft", -this.currentEyeLook.x);
            this.applyMorphTarget("eyeLookInRight", -this.currentEyeLook.x);
        }
        
        // Looking up/down
        if (this.currentEyeLook.y > 0) {
            this.applyMorphTarget("eyeLookUpLeft", this.currentEyeLook.y);
            this.applyMorphTarget("eyeLookUpRight", this.currentEyeLook.y);
            this.applyMorphTarget("eyesLookUp", this.currentEyeLook.y);
        } else {
            this.applyMorphTarget("eyeLookDownLeft", -this.currentEyeLook.y);
            this.applyMorphTarget("eyeLookDownRight", -this.currentEyeLook.y);
            this.applyMorphTarget("eyesLookDown", -this.currentEyeLook.y);
        }
    }

    smoothValue(current, target, smoothFactor) {
        return current * (1 - smoothFactor) + target * smoothFactor;
    }

    // Add this method to test all morph targets
    testAllMorphTargets() {
        if (!this.availableMorphs) return;
        
        const now = performance.now();
        const testValue = (Math.sin(now * 0.001) + 1) / 2; // 0 to 1

        this.availableMorphs.forEach((morphName, index) => {
            // Cycle through morph targets one by one
            const shouldActivate = Math.floor(now / 1000) % this.availableMorphs.length === index;
            if (shouldActivate) {
                this.applyMorphTarget(morphName, testValue);
                console.log('Testing morph target:', morphName, 'with value:', testValue);
            }
        });
    }

    async speakResponse(text) {
        if (!this.morphTargetMesh) return;

        try {
            console.log('Starting speech response with text:', text);
            
            // Stop any ongoing audio playback
            if (this.isAudioPlaying) {
                // Clean up any existing playback
                this.audioManager.stop();
                this.isAudioPlaying = false;
                this.currentVisemeTimeline = null;
                this.lastVisemes = null;
                
                // Ensure any ongoing transition is completed
                this.transitionToRestingFace = false;
                this.morphTargetMesh.morphTargetInfluences.fill(0);
            }
            
            // Generate speech from text
            const audioData = await window.chatbot.ttsService.textToSpeech(text);
            
            if (!audioData || !audioData.url) {
                console.error('Failed to get valid audio data from TTS service');
                return;
            }
            
            console.log('Received audio data with duration:', audioData.duration);
            
            // Generate viseme timeline based on text and audio duration
            this.currentVisemeTimeline = await this.phonemeLipSync.createVisemeTimeline(text, audioData.duration);
            
            // Log the timeline for debugging
            console.log('Viseme timeline created with', this.currentVisemeTimeline.length, 'visemes');
            if (this.currentVisemeTimeline.length > 0) {
                const lastViseme = this.currentVisemeTimeline[this.currentVisemeTimeline.length - 1];
                console.log('Last viseme ends at', lastViseme.endTime, 'audio duration is', audioData.duration);
            }
            
            let playbackStarted = false;
            let cleanupDone = false;
            
            // Function to clean up resources when audio is done
            const cleanupAudio = () => {
                if (cleanupDone) return;
                cleanupDone = true;
                
                console.log('Audio playback completed, cleaning up resources');
                this.isAudioPlaying = false;
                this.currentVisemeTimeline = null;
                this.lastVisemes = null; // Clear the viseme history
                
                // Start transition to resting face
                this.transitionToRestingFace = true;
                this.transitionStartTime = null; // Will be set in the transition method
                this.morphStartState = null;
                
                // Note: We're now NOT revoking the URL to avoid issues with reuse
                // URL.revokeObjectURL(audioData.url);
            };
            
            // Prepare audio playback
            let audioElement;
            try {
                // Create a new audio element with precise event listeners
                audioElement = new Audio(audioData.url);
                
                // Set up event listeners before playback begins
                audioElement.addEventListener('play', () => {
                    console.log('Audio playback started');
                    // Start animation precisely when audio starts
                    this.isAudioPlaying = true;
                    this.audioStartTime = performance.now();
                });
                
                audioElement.addEventListener('ended', () => {
                    console.log('Audio playback ended');
                    this.isAudioPlaying = false;
                    cleanupAudio();
                });
                
                // Set up error handling
                audioElement.addEventListener('error', (e) => {
                    console.error('Audio playback error:', e);
                    this.isAudioPlaying = false;
                    cleanupAudio();
                });
                
                // Start playback
                const playPromise = audioElement.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    playbackStarted = true;
                }
            } catch (audioError) {
                console.error('Error with direct audio playback:', audioError);
                
                // Fall back to AudioManager if direct approach fails
                try {
                    playbackStarted = await this.audioManager.playAudio(audioData.url);
                    console.log('AudioManager playback started:', playbackStarted);
                    
                    // Start animation now that audio has started
                    if (playbackStarted) {
                        this.isAudioPlaying = true;
                        this.audioStartTime = performance.now();
                    }
                } catch (managerError) {
                    console.error('All audio playback methods failed:', managerError);
                    playbackStarted = false;
                }
            }
            
            if (!playbackStarted) {
                console.error('Unable to start audio playback through any method');
                cleanupAudio();
                return;
            }
            
            // Set a safety timeout based on the expected audio duration
            const timeoutDuration = (audioData.duration * 1000) + 500; // Add 500ms buffer
            const safetyTimeout = setTimeout(() => {
                if (this.isAudioPlaying) {
                    console.log('Safety timeout reached, forcing cleanup');
                    this.isAudioPlaying = false;
                    cleanupAudio();
                }
            }, timeoutDuration);
            
            // Return a promise that resolves when audio playback is complete
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!this.isAudioPlaying && !this.transitionToRestingFace) {
                        clearInterval(checkInterval);
                        clearTimeout(safetyTimeout);
                        resolve();
                    }
                }, 100);
            });
        } catch (error) {
            console.error('Error in speech response:', error);
            this.isAudioPlaying = false;
            throw error;
        }
    }

    // Add a button to reset the model to its original state
    addResetModelButton() {
        const container = document.getElementById('animation-container');
        const button = document.createElement('button');
        button.className = 'reset-button';
        button.textContent = 'RESET MODEL';
        
        // Style the button
        const style = document.createElement('style');
        style.textContent = `
            .reset-button {
                position: fixed;
                bottom: 150px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 30px;
                background: #3F51B5;
                color: white;
                border: none;
                border-radius: 30px;
                cursor: pointer;
                z-index: 999;
                font-size: 20px;
                font-weight: bold;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
                text-transform: uppercase;
            }
            .reset-button:hover {
                background: #303F9F;
            }
        `;
        document.head.appendChild(style);
        
        // Reset the model when clicked
        button.addEventListener('click', () => {
            this.resetModelToOriginal();
        });
        
        container.appendChild(button);
    }
    
    // Reset the model to its original state without any morphs but keep original animation
    resetModelToOriginal() {
        if (!this.modelLoader || !this.morphTargetMesh) return;
        
        console.log('Resetting model to original state...');
        
        // Reset all morph targets to zero
        if (this.morphTargetMesh.morphTargetInfluences) {
            this.morphTargetMesh.morphTargetInfluences.fill(0);
        }
        
        // Stop all animations
        if (this.modelLoader.getMixer()) {
            const mixer = this.modelLoader.getMixer();
            
            // Stop all non-avaturn animations
            mixer.stopAllAction();
            
            // Restart the original avaturn animation
            if (this.modelLoader.animations['avaturn_animation']) {
                console.log('Restarting original avaturn_animation');
                const action = mixer.clipAction(this.modelLoader.animations['avaturn_animation']);
                action.setLoop(THREE.LoopRepeat);
                action.play();
            }
        }
        
        // Reset any animation state
        this.isAudioPlaying = false;
        this.currentVisemeTimeline = null;
        this.lastVisemes = null;
        this.transitionToRestingFace = false;
        this.transitionStartTime = null;
        this.morphStartState = null;
        
        // Reset camera to a good viewing position
        this.camera.position.set(0, 1.6, 2.0);
        this.camera.lookAt(0, 1.6, 0);
        this.controls.target.set(0, 1.6, 0);
        this.controls.update();
        
        console.log('Model reset to original state');
    }

    // Handle VR-specific updates and controller interaction
    handleVRUpdates() {
        // Get XR session
        const session = this.renderer.xr.getSession();
        if (!session) return;
        
        // Get XR reference space (for controller tracking)
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        if (!referenceSpace) return;
        
        try {
            // Update VR interactions (gaze-based, recording button)
            this.updateVRInteractions();
            
            // Handle mobile touchscreen VR control
            if (window.DeviceOrientationEvent && this.renderer.xr.isPresenting) {
                // Mobile VR is active - automatic orientation will be used by WebXR
            }
            
            // XR input sources (controllers)
            const inputSources = session.inputSources;
            if (inputSources) {
                // Handle input sources (controllers or touch events) if available
                for (let source of inputSources) {
                    if (source.handedness) {
                        // Handle controller input if present
                        // (Add specific controller handling code if needed)
                    }
                    
                    // Handle selectstart event (for gaze-based selection)
                    if (source.targetRayMode === 'gaze') {
                        // Gaze-based interactions are handled in updateVRInteractions
                    }
                }
            }
        } catch (error) {
            console.error('Error in VR update loop:', error);
        }
    }

    // Ensure the character is oriented properly for VR viewing
    orientCharacterForVR() {
        // Find the character model - it should be the main model loaded
        // Try multiple methods to locate the character
        let characterModel = null;
        
        // Method 1: Find by model specific attributes
        if (this.modelLoader && this.modelLoader.model) {
            characterModel = this.modelLoader.model;
            console.log('Found character model via modelLoader');
        }
        
        // Method 2: Try to find by traversing the scene
        if (!characterModel) {
            this.scene.traverse(node => {
                // Check if this is likely the character model
                if (node.isMesh && node.morphTargetInfluences && node.morphTargetInfluences.length > 0) {
                    // Found a mesh with morph targets - likely part of the character
                    characterModel = node.parent;
                    while (characterModel && characterModel.parent !== this.scene) {
                        characterModel = characterModel.parent; // Go up to the top level
                    }
                    
                    if (characterModel) {
                        console.log('Found character model via morph target search');
                    }
                }
            });
        }
        
        // Method 3: Find by elimination (not the room, not a light, not a camera)
        if (!characterModel) {
            characterModel = this.scene.children.find(child => 
                child.type === 'Group' && 
                child !== this.scene.children.find(c => c.name && c.name.toLowerCase().includes('room')) &&
                !(child.isLight || child.isCamera)
            );
            
            if (characterModel) {
                console.log('Found character model via elimination');
            }
        }
        
        if (characterModel) {
            // Store the original position and rotation before modifying
            if (!characterModel.userData.originalPosition) {
                characterModel.userData.originalPosition = characterModel.position.clone();
                characterModel.userData.originalRotation = characterModel.rotation.clone();
            }
            
            // Make sure the character is facing the camera in VR
            // Rotate 180 degrees to face the user
            characterModel.rotation.set(0, Math.PI, 0); // Force exact rotation to face user
            
            // Also adjust position slightly if needed to center in view
            if (characterModel.position.z !== 0) {
                characterModel.position.z = 0; // Center at origin for better visibility
            }
            
            console.log('Character oriented to face VR camera');
            
            // Apply enhanced lighting for VR
            this.enhanceVRLighting(characterModel);
        } else {
            console.warn('Could not find character model to orient for VR');
        }
    }
    
    // Add special lighting for VR mode to ensure character is well-lit
    enhanceVRLighting(characterModel) {
        // First, adjust exposure for VR - less bright for duller appearance
        this.renderer.toneMappingExposure = 1.5; // Reduced exposure for duller appearance
        
        // Create a dedicated VR front light with warm but not overly bright tone
        const vrFrontLight = new THREE.SpotLight(0xffebd7, 2.3); // Warm light but reduced intensity
        vrFrontLight.position.set(0, 1.8, 5); // Position in front of character
        vrFrontLight.target.position.set(0, 1.6, 0); // Target character face/upper body
        vrFrontLight.angle = Math.PI / 4.5; // Slightly narrower angle
        vrFrontLight.penumbra = 0.8; // Soft edges
        vrFrontLight.decay = 0.5; // Moderate decay
        vrFrontLight.distance = 25; // Good range
        
        // Add these lights to the scene
        this.scene.add(vrFrontLight);
        this.scene.add(vrFrontLight.target);
        
        // Create an additional fill light from below for VR
        const vrFillLight = new THREE.PointLight(0xfff2e6, 1.1); // Warm fill light, reduced intensity
        vrFillLight.position.set(0, 0.5, 3); // Below and in front
        vrFillLight.decay = 0.8; // Moderate decay
        vrFillLight.distance = 12; // Moderate range
        this.scene.add(vrFillLight);
        
        // Add a gentle ambient light for more even, softer illumination
        const vrAmbientLight = new THREE.AmbientLight(0xfff5eb, 0.3);
        this.scene.add(vrAmbientLight);
        
        // Store references to remove these lights when exiting VR
        this.vrLights = [vrFrontLight, vrFrontLight.target, vrFillLight, vrAmbientLight];
        
        console.log('Enhanced VR-specific lighting applied for duller, natural skin appearance');
        
        // Add VR interaction elements (recording button and crosshair)
        this.addVRInteractionElements(characterModel);
    }
    
    // Add VR interaction elements including a 3D button and gaze-based interaction
    addVRInteractionElements(characterModel) {
        // Create a crosshair/reticle for gaze interaction
        this.createVRCrosshair();
        
        // Create a 3D "Start Recording" button in the VR world
        this.createVRRecordingButton(characterModel);
        
        // Initialize variables for tracking gaze interaction
        this.gazeTarget = null;
        this.gazeStartTime = 0;
        this.gazeThreshold = 2000; // 2 seconds of hovering to activate button
        this.isVRRecording = false; // Track recording state
    }
    
    // Create a crosshair/reticle for gaze-based interaction in VR
    createVRCrosshair() {
        // Create a simple crosshair geometry
        const crosshairGeometry = new THREE.RingGeometry(0.02, 0.03, 32);
        const crosshairMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // Create crosshair mesh
        this.crosshair = new THREE.Mesh(crosshairGeometry, crosshairMaterial);
        this.crosshair.position.z = -0.5; // Position in front of camera
        this.crosshair.visible = false; // Hide initially
        
        // Create inner dot for the crosshair
        const dotGeometry = new THREE.CircleGeometry(0.005, 32);
        const dotMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            opacity: 0.8,
            transparent: true
        });
        
        this.crosshairDot = new THREE.Mesh(dotGeometry, dotMaterial);
        this.crosshairDot.position.z = -0.49; // Slightly in front of the ring
        this.crosshairDot.visible = false; // Hide initially
        
        // Create a progress indicator for gaze activation
        const progressGeometry = new THREE.RingGeometry(0.02, 0.03, 32, 1, 0, 0);
        const progressMaterial = new THREE.MeshBasicMaterial({
            color: 0x4CAF50,
            opacity: 0.8,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        this.gazeProgress = new THREE.Mesh(progressGeometry, progressMaterial);
        this.gazeProgress.position.z = -0.48; // Slightly in front of everything
        this.gazeProgress.visible = false; // Hide initially
        
        // Create a camera helper object to hold the crosshair elements
        this.vrCameraHelper = new THREE.Group();
        this.vrCameraHelper.add(this.crosshair);
        this.vrCameraHelper.add(this.crosshairDot);
        this.vrCameraHelper.add(this.gazeProgress);
        
        // Add to scene - will be updated each frame to follow camera
        this.scene.add(this.vrCameraHelper);
        
        console.log('VR crosshair created for gaze interaction');
    }
    
    // Create a 3D "Start Recording" button in the VR world
    createVRRecordingButton(characterModel) {
        // Determine position - beside the character
        let buttonPosition = new THREE.Vector3(1.0, 1.6, 0.5);
        
        // If character model is available, position relative to it
        if (characterModel) {
            characterModel.updateWorldMatrix(true, false);
            const characterBox = new THREE.Box3().setFromObject(characterModel);
            const characterCenter = characterBox.getCenter(new THREE.Vector3());
            const characterSize = characterBox.getSize(new THREE.Vector3());
            
            // Position to the right of the character
            buttonPosition.set(
                characterCenter.x + characterSize.x * 0.6, // Right side
                characterCenter.y + characterSize.y * 0.1, // Near head height
                characterCenter.z + characterSize.z * 0.3  // Slightly in front
            );
        }
        
        // Create the button shape
        const buttonGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.05);
        const buttonMaterial = new THREE.MeshStandardMaterial({
            color: 0xE53935, // Red color for recording button
            roughness: 0.7,
            metalness: 0.2,
            emissive: 0x330000 // Slight emissive glow
        });
        
        this.vrRecordButton = new THREE.Mesh(buttonGeometry, buttonMaterial);
        this.vrRecordButton.position.copy(buttonPosition);
        
        // Create a simple label for the button since TextGeometry may not be readily available
        const labelGeometry = new THREE.PlaneGeometry(0.16, 0.06);
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 128;
        const labelContext = labelCanvas.getContext('2d');
        labelContext.fillStyle = '#E53935';
        labelContext.fillRect(0, 0, 256, 128);
        labelContext.fillStyle = 'white';
        labelContext.font = 'bold 64px Arial';
        labelContext.textAlign = 'center';
        labelContext.textBaseline = 'middle';
        labelContext.fillText('REC', 128, 64);
        
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.MeshBasicMaterial({
            map: labelTexture,
            transparent: true
        });
        
        this.buttonLabel = new THREE.Mesh(labelGeometry, labelMaterial);
        this.buttonLabel.position.copy(buttonPosition).add(new THREE.Vector3(0, 0, 0.026));
        
        // Create an icon for the button (record circle)
        const iconGeometry = new THREE.CircleGeometry(0.025, 32);
        const iconMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.recordIcon = new THREE.Mesh(iconGeometry, iconMaterial);
        this.recordIcon.position.copy(buttonPosition).add(new THREE.Vector3(-0.07, 0, 0.028));
        
        // Create button group
        this.vrButtonGroup = new THREE.Group();
        this.vrButtonGroup.add(this.vrRecordButton);
        this.vrButtonGroup.add(this.buttonLabel);
        this.vrButtonGroup.add(this.recordIcon);
        
        // Add to scene
        this.scene.add(this.vrButtonGroup);
        
        // Make button interactable
        this.vrRecordButton.userData.isInteractable = true;
        this.vrRecordButton.userData.hoverTime = 0;
        this.vrRecordButton.userData.name = 'recordButton';
        
        console.log('VR Recording button added to scene');
    }
    
    // Update VR interactions each frame
    updateVRInteractions() {
        if (!this.renderer.xr.isPresenting || !this.vrCameraHelper || !this.vrRecordButton) return;
        
        // Get the VR camera
        const xrCamera = this.renderer.xr.getCamera();
        if (!xrCamera) return;
        
        // Position the crosshair in front of the camera
        this.vrCameraHelper.position.copy(xrCamera.position);
        this.vrCameraHelper.quaternion.copy(xrCamera.quaternion);
        
        // Raycasting for gaze interaction
        const raycaster = new THREE.Raycaster();
        const cameraDirection = new THREE.Vector3(0, 0, -1);
        cameraDirection.applyQuaternion(xrCamera.quaternion);
        
        raycaster.set(xrCamera.position, cameraDirection);
        
        // Check if we're looking at interactable objects
        const intersects = raycaster.intersectObject(this.vrRecordButton, false);
        
        // Update crosshair visibility
        this.crosshair.visible = true;
        this.crosshairDot.visible = true;
        
        const currentTime = performance.now();
        
        if (intersects.length > 0) {
            // We're looking at the button
            this.crosshair.material.color.set(0x4CAF50); // Green when hovering
            this.crosshairDot.material.color.set(0x4CAF50);
            
            if (!this.gazeTarget) {
                // Just started looking at the button
                this.gazeTarget = intersects[0].object;
                this.gazeStartTime = currentTime;
                this.gazeProgress.visible = true;
            } else {
                // Continue looking at the button
                const gazeDuration = currentTime - this.gazeStartTime;
                
                // Update progress indicator
                const progressAngle = Math.min(1, gazeDuration / this.gazeThreshold) * Math.PI * 2;
                this.gazeProgress.geometry.dispose(); // Clean up old geometry
                this.gazeProgress.geometry = new THREE.RingGeometry(0.02, 0.03, 32, 1, 0, progressAngle);
                
                // Check if we've looked long enough to activate
                if (gazeDuration >= this.gazeThreshold) {
                    // Reset the gaze timer
                    this.gazeStartTime = currentTime;
                    this.gazeProgress.visible = false;
                    
                    // Toggle recording
                    this.toggleVRRecording();
                }
            }
        } else {
            // Not looking at any interactable object
            this.crosshair.material.color.set(0xffffff); // White when not hovering
            this.crosshairDot.material.color.set(0xffffff);
            this.gazeTarget = null;
            this.gazeProgress.visible = false;
        }
    }
    
    // Toggle recording state in VR
    toggleVRRecording() {
        console.log('Toggling VR recording state');
        
        if (!this.isVRRecording) {
            // Start recording
            this.isVRRecording = true;
            
            // Update button appearance for recording state
            this.vrRecordButton.material.color.set(0xFF1744); // Brighter red
            this.vrRecordButton.material.emissive.set(0x550000); // Stronger emissive
            
            // Trigger the actual recording start through the chatbot system
            this.startVRRecording();
        } else {
            // Stop recording
            this.isVRRecording = false;
            
            // Update button appearance for non-recording state
            this.vrRecordButton.material.color.set(0xE53935); // Regular red
            this.vrRecordButton.material.emissive.set(0x330000); // Normal emissive
            
            // Trigger the actual recording stop
            this.stopVRRecording();
        }
    }
    
    // Start recording in VR mode
    startVRRecording() {
        console.log('Starting VR voice recording');
        
        // Try to find chatbot system through different methods
        const chatbotSystem = this.chatbotInstance || window.chatbotSystem;
        
        if (chatbotSystem && typeof chatbotSystem.startRecording === 'function') {
            // Use the existing startRecording function from chatbot
            chatbotSystem.startRecording();
        } else {
            console.error('Could not find chatbot system for recording');
        }
    }
    
    // Stop recording in VR mode
    stopVRRecording() {
        console.log('Stopping VR voice recording');
        
        // Try to find chatbot system through different methods
        const chatbotSystem = this.chatbotInstance || window.chatbotSystem;
        
        if (chatbotSystem && typeof chatbotSystem.stopRecording === 'function') {
            // Use the existing stopRecording function from chatbot
            chatbotSystem.stopRecording();
        } else {
            console.error('Could not find chatbot system for recording');
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Create a global helper to initialize audio
    window.initAudio = async function() {
        try {
            console.log('Initializing audio system on user interaction');
            
            // Try to create and resume an audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const tempContext = new AudioContext();
                if (tempContext.state === 'suspended') {
                    await tempContext.resume();
                }
                
                // Play a silent sound to unlock audio
                const buffer = tempContext.createBuffer(1, 1, 22050);
                const source = tempContext.createBufferSource();
                source.buffer = buffer;
                source.connect(tempContext.destination);
                source.start(0);
                
                console.log('Audio system initialized successfully');
            }
            
            // Also try to resume chatbot's audio context if it exists
            if (window.chatbot && 
                window.chatbot.facialAnimation && 
                window.chatbot.facialAnimation.audioManager &&
                window.chatbot.facialAnimation.audioManager.audioContext) {
                
                const audioContext = window.chatbot.facialAnimation.audioManager.audioContext;
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                    console.log('ChatBot AudioContext resumed');
                }
            }
            
            return true;
        } catch (err) {
            console.error('Error initializing audio system:', err);
            return false;
        }
    };
    
    // Add user interaction handler to activate audio
    document.body.addEventListener('click', async function() {
        // Initialize audio on first interaction
        await window.initAudio();
        
        // Try to get microphone permissions early
        if (window.chatbot && !window.chatbot.microphonePermissionChecked) {
            window.chatbot.microphonePermissionChecked = true;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop the tracks immediately - we just want the permission
                stream.getTracks().forEach(track => track.stop());
                console.log('Microphone permission granted on page interaction');
            } catch (err) {
                console.error('Could not get microphone permission:', err);
                // We'll handle this when the user tries to record
            }
        }
    });

    // Add click listener to all buttons to ensure audio is initialized
    document.addEventListener('click', async function(event) {
        if (event.target.tagName === 'BUTTON') {
            await window.initAudio();
        }
    });

    // Handle WebSocket connection errors gracefully
    window.addEventListener('error', function(event) {
        if (event.message && event.message.includes('WebSocket connection')) {
            console.warn('WebSocket connection failed. The app will continue to function without live reloading.');
        }
    });
    
    // Fallback for WebSocket connection failures
    const handleWebSocketFailure = () => {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.hostname}:3001/`;
        
        try {
            const ws = new WebSocket(wsUrl);
            
            ws.onerror = () => {
                console.warn('WebSocket connection failed. Live reload disabled.');
            };
            
            ws.onclose = () => {
                // Try to reconnect after a delay
                setTimeout(handleWebSocketFailure, 5000);
            };
        } catch (e) {
            console.warn('WebSocket initialization failed:', e);
        }
    };
    
    // Initialize WebSocket connection handling
    handleWebSocketFailure();
    
    // Initialize chatbot
    const chatbot = new ChatbotSystem();
    window.chatbot = chatbot; // Make it accessible for debugging
}); 