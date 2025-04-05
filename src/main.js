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
        this.facialAnimation = new FacialAnimationSystem();
        this.ttsService = new ElevenLabsService();
        this.initSpeechRecognition();
        this.setupChatInterface();
        this.isRecording = false;
        this.processingResponse = false;
        this.microphonePermissionChecked = false;
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
}

class FacialAnimationSystem {
    constructor() {
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
            
            return model;
        } catch (error) {
            console.error('Failed to load facial model:', error);
        }
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
            alpha: true,
            preserveDrawingBuffer: true 
        });
        
        // Enable VR with specific XR features
        this.renderer.xr.enabled = true;
        
        // Enable tone mapping and correct color space
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
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
            `;
            document.head.appendChild(style);

            // Handle VR session with specific configuration for mobile VR
            button.addEventListener('click', async () => {
                try {
                    if (navigator.xr) {
                        const session = await navigator.xr.requestSession('immersive-vr', {
                            optionalFeatures: [
                                'local-floor',
                                'bounded-floor',
                                'hand-tracking',
                                'layers'
                            ]
                        });
                        
                        await this.renderer.xr.setSession(session);
                        
                        // Position camera for VR using standard human height parameters
                        this.camera.position.set(0, 1.6, 2.0);
                        this.camera.lookAt(0, 1.6, 0);
                        
                        button.textContent = 'Exit VR';
                        
                        session.addEventListener('end', () => {
                            button.textContent = 'ENTER VR MODE';
                            this.renderer.xr.setSession(null);
                        });
                    } else {
                        alert('WebXR not available on your device. Please use a WebXR-compatible browser and VR headset.');
                    }
                } catch (error) {
                    console.error('VR initialization error:', error);
                    alert('Unable to enter VR. Make sure you have a compatible VR viewer and are using HTTPS.');
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
        this.scene.background = new THREE.Color(0x1a1a1a);

        // Standard lighting setup for realistic renderings of human figures
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        // Main key light (front facing)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
        keyLight.position.set(0, 1.8, 2.5);
        keyLight.target.position.set(0, 1.6, 0);
        keyLight.castShadow = true;
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
        this.controls.maxDistance = 5.0;
        
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

        // Animation loop with VR support
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
                }
                
                // Update morph targets only when needed for lip sync
                if (this.isAudioPlaying) {
                    this.updateMorphTargets();
                }
                
                // Render scene
                this.renderer.render(this.scene, this.camera);
            });
        };

        animate();
    }

    updateMorphTargets() {
        if (!this.morphTargetMesh) return;

        // When not speaking, keep all morph targets at 0 to preserve original model
        if (!this.isAudioPlaying) {
            this.morphTargetMesh.morphTargetInfluences.fill(0);
            return;
        }

        // Reset all morph target influences
        this.morphTargetMesh.morphTargetInfluences.fill(0);
        
        // Apply minimal eye movements when speaking
        this.applyEyeMovements();
        
        // Apply phoneme-based lip sync if we have an active timeline
        if (this.isAudioPlaying && this.currentVisemeTimeline) {
            this.applyPhonemeLipSync();
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
            
            // Start facial animation (but don't stop original avatar animation)
            this.isAudioPlaying = true;
            this.audioStartTime = performance.now();
            
            let playbackStarted = false;
            let cleanupDone = false;
            
            // Function to clean up resources when audio is done
            const cleanupAudio = () => {
                if (cleanupDone) return;
                cleanupDone = true;
                
                console.log('Audio playback completed, cleaning up resources');
                this.isAudioPlaying = false;
                this.currentVisemeTimeline = null;
                
                // Reset morph targets when speech ends, but don't stop the animation
                if (this.morphTargetMesh) {
                    this.morphTargetMesh.morphTargetInfluences.fill(0);
                }
                
                // Note: We're now NOT revoking the URL to avoid issues with reuse
                // URL.revokeObjectURL(audioData.url);
            };
            
            // Attempt to play audio through AudioManager first
            try {
                playbackStarted = await this.audioManager.playAudio(audioData.url);
                console.log('AudioManager playback started:', playbackStarted);
            } catch (audioError) {
                console.error('Error with AudioManager playback:', audioError);
                playbackStarted = false;
            }
            
            // If AudioManager playback failed, try direct audio element approach as fallback
            if (!playbackStarted) {
                console.warn('Attempting fallback audio playback method');
                const audioElement = document.getElementById('audioInput');
                if (audioElement) {
                    try {
                        audioElement.src = audioData.url;
                        await audioElement.play();
                        playbackStarted = true;
                        console.log('Direct audio playback started');
                        
                        // Set up ended handler for this element
                        audioElement.onended = cleanupAudio;
                    } catch (e) {
                        console.error('Direct audio playback failed:', e);
                        // Try one more fallback with a new Audio element
                        try {
                            const newAudio = new Audio(audioData.url);
                            await newAudio.play();
                            playbackStarted = true;
                            console.log('New Audio element playback started');
                            
                            // Set up ended handler for this element
                            newAudio.onended = cleanupAudio;
                        } catch (finalError) {
                            console.error('All audio playback methods failed:', finalError);
                        }
                    }
                }
            }
            
            if (!playbackStarted) {
                console.error('Unable to start audio playback through any method');
                cleanupAudio();
                return;
            }
            
            return new Promise((resolve) => {
                // Get the audio element
                const audioElement = document.getElementById('audioInput');
                
                // Set up event listener for the audio element if it exists
                if (audioElement) {
                    audioElement.onended = () => {
                        console.log('Audio ended event triggered');
                        cleanupAudio();
                        resolve();
                    };
                }
                
                // Set a timeout as backup
                const timeoutDuration = (audioData.duration * 1000) + 1000; // Audio duration plus 1 second buffer
                setTimeout(() => {
                    if (this.isAudioPlaying) {
                        console.log('Audio playback timeout reached, forcing cleanup');
                        cleanupAudio();
                        resolve();
                    }
                }, timeoutDuration);
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
        
        // Reset camera to a good viewing position
        this.camera.position.set(0, 1.6, 2.0);
        this.camera.lookAt(0, 1.6, 0);
        this.controls.target.set(0, 1.6, 0);
        this.controls.update();
        
        console.log('Model reset to original state');
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