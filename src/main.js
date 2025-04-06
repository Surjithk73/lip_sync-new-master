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
import * as VRInitializer from './vr-initializer';

class ChatbotSystem {
    constructor() {
        // State variables
        this.isRecording = false;
        this.processingResponse = false;
        this.networkErrorCount = 0;
        
        // Initialize core systems
        this.facialAnimation = new FacialAnimationSystem();
        
        // Set up the chat interface when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
                this.setupChatInterface();
            });
        } else {
            this.initialize();
            this.setupChatInterface();
        }
        
        // Make the chatbot accessible globally for debugging
        window.chatbot = this;
    }

    async initialize() {
        try {
            await this.facialAnimation.initialize();
            console.log('ChatbotSystem initialized');
        } catch (error) {
            console.error('Failed to initialize ChatbotSystem:', error);
        }
    }

    setupChatInterface() {
        this.chatMessages = document.getElementById('chat-messages');
        this.inputArea = document.getElementById('chat-input-area');
        
        // Reference pre-created text input
        this.textInputContainer = document.getElementById('text-input-alternative');
        this.textInput = document.getElementById('text-input-field');
        this.textInputButton = document.getElementById('text-input-button');
        
        // Setup record button
        this.recordButton = document.getElementById('recordButton');
        this.recordingStatus = document.getElementById('recording-status');

        if (this.recordButton) {
            this.recordButton.addEventListener('click', () => this.toggleRecording());
        }
        
        // Don't create the text input elements again as they're already in the HTML
        console.log('Chat interface setup completed');
        
        // Add initial message from assistant
        setTimeout(() => {
            this.addMessageToChat('assistant', "Hello! To begin our conversation, press the Record button and speak, or type in the text field below.");
        }, 500);
    }

    toggleTextInput() {
        // No need to create elements since they already exist in HTML
        if (this.textInputContainer) {
            // Just toggle visibility if needed
            const isHidden = this.textInputContainer.style.display === 'none';
            this.textInputContainer.style.display = isHidden ? 'flex' : 'none';
            
            if (isHidden && this.textInput) {
                this.textInput.focus();
            }
        }
    }

    toggleRecording() {
            if (!this.isRecording) {
                this.startRecording();
            } else {
                this.stopRecording();
            }
    }

    startRecording() {
        if (!this.isRecording) {
        this.isRecording = true;
            if (this.recordButton) {
                this.recordButton.innerHTML = '<span class="record-icon"></span> Stop Recording';
                this.recordButton.classList.add('recording');
            }
            if (this.recordingStatus) {
                this.recordingStatus.textContent = 'Listening...';
            }
            
            this.facialAnimation.startListening()
                .then(result => {
                    if (result && result.transcript) {
                        this.handleTranscript(result.transcript);
                    } else if (result && result.error) {
                        console.error('Speech recognition error:', result.error);
                        this.handleSpeechRecognitionError(result.error);
                    }
                })
                .catch(error => {
                    console.error('Error starting speech recognition:', error);
                    this.handleSpeechRecognitionError(error.message || 'Unknown error');
                })
                .finally(() => {
                    this.isRecording = false;
                    if (this.recordButton) {
                        this.recordButton.innerHTML = '<span class="record-icon"></span> Start Recording';
                        this.recordButton.classList.remove('recording');
                    }
                    if (this.recordingStatus) {
                        this.recordingStatus.textContent = 'Click to start speaking';
                    }
                });
        }
    }

    stopRecording() {
        if (this.isRecording) {
            this.facialAnimation.stopListening();
        this.isRecording = false;
            if (this.recordButton) {
                this.recordButton.innerHTML = '<span class="record-icon"></span> Start Recording';
                this.recordButton.classList.remove('recording');
            }
            if (this.recordingStatus) {
                this.recordingStatus.textContent = 'Processing...';
            }
        }
    }

    handleSpeechRecognitionError(error) {
        console.error('Speech recognition error:', error);
        
        // Update UI to show error
        if (this.recordingStatus) {
            this.recordingStatus.textContent = 'Speech recognition failed';
        }
        
        // If it's a network error, increment counter
        if (error.includes('network')) {
            this.networkErrorCount++;
        }
        
        // If network error or no speech detected, suggest using text input
        if (error.includes('network') || error.includes('no-speech')) {
            if (this.textInputContainer && this.textInputContainer.style.display === 'none') {
                this.textInputContainer.style.display = 'flex';
                if (this.textInput) {
                    setTimeout(() => this.textInput.focus(), 300);
                }
            }
        }
    }

    handleTranscript(transcript) {
        if (transcript && transcript.trim()) {
            this.addMessageToChat('user', transcript);
            this.generateResponse(transcript);
        } else {
            this.addMessageToChat('assistant', "I couldn't hear anything. Please try again or use the text input.");
        }
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
        if (!this.chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        messageElement.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
        
        // Format links to be clickable
        const formattedText = text.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        
        messageElement.innerHTML = formattedText;
        this.chatMessages.appendChild(messageElement);
        
        // Scroll to the bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    async generateResponse(userInput) {
        this.processingResponse = true;
        
        try {
            if (!userInput || !userInput.trim()) {
                throw new Error('Empty input');
            }
            
            // Add loading message
            this.recordingStatus.textContent = 'Processing response...';
            
            // Get response from facial animation system (which will handle API call)
            const response = await this.facialAnimation.generateResponse(userInput);
            
            // Add response to chat
            this.addMessageToChat('assistant', response);
            
            // Speak the response
            await this.facialAnimation.speakResponse(response);
        } catch (error) {
            console.error('Error generating response:', error);
            this.addMessageToChat('assistant', 'Sorry, I encountered an error while generating a response. Please try again.');
        } finally {
            this.processingResponse = false;
            this.recordingStatus.textContent = 'Click to start speaking';
        }
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
            
            // Create container with styling that matches our theme
            const container = document.createElement('div');
            container.id = 'text-input-alternative';
            
            // Create text input
            const input = document.createElement('input');
            input.id = 'text-input-field';
            input.type = 'text';
            input.placeholder = 'Type your message here...';
            
            // Create send button
            const button = document.createElement('button');
            button.textContent = 'Send';
            
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
            
            // Always insert at the top of chat input area
            if (chatInputArea.firstChild) {
                chatInputArea.insertBefore(container, chatInputArea.firstChild);
            } else {
                chatInputArea.appendChild(container);
            }
            
            // Always create the text input right away without waiting
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
            
            // Place model at the origin, but adjust for perfect conversational height
            // We'll further refine in the loadRoomModel method
            model.position.y = 0;
            
            // Store the model reference for later adjustments
            this.characterModel = model;
            this.scene.add(model);
            
            // Find mesh with morph targets but don't apply animations yet
            this.morphTargetMesh = modelLoader.findMorphTargetMesh(model);
            
            if (!this.morphTargetMesh) {
                throw new Error('No mesh with morph targets found in the model');
            }
            
            // Initialize morph targets for lip sync
            this.initializeMorphTargets();
            
            // Skip creating default animation which might affect appearance
            console.log('Using original model animation only');
            
            // Fix avatar hair first
            this.fixAvatarHair();
            
            // Load the room model and position character within it
            this.loadRoomModel(model);
            
            return model;
        } catch (error) {
            console.error('Failed to load facial model:', error);
        }
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
            
            // Keep room position at Y=0 as the reference point for proper alignment
            roomModel.position.y = 0;
            console.log('Room positioned at origin Y=0 for consistent reference');
            
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
            
            // Calculate character's bounding box
            const characterBounds = new THREE.Box3().setFromObject(characterModel);
            const characterHeight = characterBounds.max.y - characterBounds.min.y;
            
            // The standard eye height is approximately 1.65 meters for an average person
            const standardEyeHeight = 1.65;
            
            // Calculate where the character's eyes are (approximately 90% of height from bottom)
            const characterEyeHeightRatio = 0.9;
            const characterEyeHeightFromBottom = characterHeight * characterEyeHeightRatio;

            console.log(`Character height: ${characterHeight.toFixed(2)}, eye height from bottom: ${characterEyeHeightFromBottom.toFixed(2)}`);

            // Calculate how high the character's feet should be to put eyes at standard height
            const characterFeetPosition = standardEyeHeight - characterEyeHeightFromBottom;

            console.log(`Setting character feet position to Y=${characterFeetPosition.toFixed(2)} to align eyes at ${standardEyeHeight}m`);

            // Position character for optimal face-to-face conversation
            characterModel.position.set(
                0,                        // Centered horizontally
                characterFeetPosition,    // Use calculated eye-aligned position
                -2                        // 2 meters in front of user
            );
            
            console.log('Final character position:', characterModel.position);
            
            // Update camera to look directly at character's eye level
            this.adjustCameraForConversation(characterModel);
            
            // Update room lighting to match the environment
            this.updateLightingForRoom(roomModel);
            
            // Store the initial eye-aligned position for VR mode
            this.initialEyeAlignedPosition = {
                character: characterModel.position.clone(),
                room: roomModel.position.clone()
            };
            
            return roomModel;
        } catch (error) {
            console.error('Failed to load room model:', error);
        }
    }
    
    adjustCameraForConversation(characterModel) {
        // The standard eye height for an average person
        const standardEyeHeight = 1.65;
        
        // Calculate the character's bounding box
        const characterBounds = new THREE.Box3().setFromObject(characterModel);
        const characterHeight = characterBounds.max.y - characterBounds.min.y;
        
        // Calculate where the character's eyes are (approximately 90% of height from bottom)
        const characterEyeHeightRatio = 0.9;
        const characterEyeHeight = characterModel.position.y + (characterHeight * characterEyeHeightRatio);
        
        console.log(`Character eye height calculated at Y=${characterEyeHeight.toFixed(2)}`);
        
        // Position camera at standard eye height looking at character's face
        this.camera.position.set(
            0,                // Centered horizontally
            standardEyeHeight, // Standard eye height
            1.5               // 1.5 meters back from origin
        );
        
        // Look at character's face
        this.camera.lookAt(new THREE.Vector3(
            0,                // Centered horizontally
            characterEyeHeight, // Character's eye level
            -2                // Character is 2 meters away
        ));
        
        // Update orbit controls to target character's face
        this.controls.target.set(0, characterEyeHeight, -2);
        
        // Adjust control limits for natural movement
        this.controls.minDistance = 1.0; // Closest approach
        this.controls.maxDistance = 5.0; // Maximum distance
        this.controls.update();
        
        console.log('Camera positioned at eye level for face-to-face conversation');
    }
    
    updateLightingForRoom(roomModel) {
        // Remove existing lights
        this.scene.children.forEach(child => {
            if (child.isLight && !(child instanceof THREE.AmbientLight)) {
                this.scene.remove(child);
            }
        });
        
        // Create new lighting setup optimized for face-to-face conversation
        
        // Keep ambient light but adjust intensity for better overall illumination
        const ambientLight = this.scene.children.find(child => child instanceof THREE.AmbientLight);
        if (ambientLight) {
            ambientLight.intensity = 0.6; // Increased for better base illumination
        }
        
        // Create main directional light (simulating window light)
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
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
        
        // Add some soft fill lights for the room
        const fillLight1 = new THREE.PointLight(0xffffff, 0.4);
        fillLight1.position.set(-5, 5, -5);
        this.scene.add(fillLight1);
        
        const fillLight2 = new THREE.PointLight(0xffffff, 0.2);
        fillLight2.position.set(5, 2, -5);
        this.scene.add(fillLight2);
        
        // ======= FACE-TO-FACE CONVERSATION SPECIFIC LIGHTING =======
        
        // Key light for illuminating the character's face
        // Positioned in the same general area as the user's viewpoint for natural illumination
        const faceKeyLight = new THREE.SpotLight(0xffffff, 1.0); 
        faceKeyLight.position.set(0, 1.8, 1.5); // Positioned near the user's viewpoint
        faceKeyLight.target.position.set(0, 1.65, 0); // Target the character's face
        faceKeyLight.angle = Math.PI / 6; // Narrow spotlight
        faceKeyLight.penumbra = 0.5; // Soft edges
        faceKeyLight.decay = 1.0;
        faceKeyLight.distance = 5; // Short distance to focus on character
        
        faceKeyLight.castShadow = true;
        faceKeyLight.shadow.bias = -0.002;
        
        this.scene.add(faceKeyLight);
        this.scene.add(faceKeyLight.target);
        
        // VR-specific fill light from below to light the face in darker VR headsets
        const faceFillLight = new THREE.SpotLight(0xfffff0, 0.7); // Slight warm tint
        faceFillLight.position.set(0, 1.0, 1.0); // Below viewing position
        faceFillLight.target.position.set(0, 1.65, 0); // Aim at face
        faceFillLight.angle = Math.PI / 5;
        faceFillLight.penumbra = 0.7;
        faceFillLight.decay = 1.5;
        faceFillLight.distance = 3;
        
        this.scene.add(faceFillLight);
        this.scene.add(faceFillLight.target);
        
        // Add a rim light to separate character from background
        const rimLight = new THREE.SpotLight(0xffffff, 0.8);
        rimLight.position.set(0, 1.8, -1.0); // Behind character
        rimLight.target.position.set(0, 1.65, 0);
        rimLight.angle = Math.PI / 6;
        rimLight.penumbra = 0.5;
        rimLight.decay = 1.0;
        rimLight.distance = 5;
        
        this.scene.add(rimLight);
        this.scene.add(rimLight.target);
        
        // VR-specific: Create a conversational lighting environment
        // Add a light slightly to the side to create gentle shadows for facial features
        const detailLight = new THREE.SpotLight(0xffffff, 0.5);
        detailLight.position.set(1.0, 1.7, 1.2); // Slightly to the side
        detailLight.target.position.set(0, 1.65, 0);
        detailLight.angle = Math.PI / 8; // Very narrow for detail
        detailLight.penumbra = 0.8;
        detailLight.decay = 1.5;
        detailLight.distance = 4;
        
        this.scene.add(detailLight);
        this.scene.add(detailLight.target);
        
        // NEW: Add subtle side lighting for the room to create atmosphere
        const roomSideLight = new THREE.SpotLight(0xf5e3c8, 0.6); // Warm color
        roomSideLight.position.set(-8, 5, 0); // Position on the left side of the room
        roomSideLight.target.position.set(0, 0, 0); // Target center of room
        roomSideLight.angle = Math.PI / 4; // Wider angle for room lighting
        roomSideLight.penumbra = 0.9; // Very soft edges
        roomSideLight.decay = 1.2;
        roomSideLight.distance = 15; // Longer distance to cover the room
        
        // Add some dynamic shadow to add depth to the room
        roomSideLight.castShadow = true;
        roomSideLight.shadow.mapSize.width = 1024;
        roomSideLight.shadow.mapSize.height = 1024;
        roomSideLight.shadow.camera.far = 20;
        roomSideLight.shadow.bias = -0.001;
        
        this.scene.add(roomSideLight);
        this.scene.add(roomSideLight.target);
        
        // Enable renderer shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Tone mapping to enhance visibility in VR
        this.renderer.toneMappingExposure = 1.3; // Slightly brighter for VR headsets
        
        console.log('Lighting optimized for face-to-face conversation in VR');
    }

    // Fix for avatar hair meshes
    fixAvatarHair() {
        if (!this.characterModel) return;
        
        // Find hair-related meshes in the model
        this.characterModel.traverse(node => {
            if (node.isMesh && node.name.toLowerCase().includes('hair')) {
                // Reset any problematic transformations that might have flattened the hair
                const originalScale = node.scale.clone();
                
                // Ensure hair has proper volume (slightly increase Y scale if it was flattened)
                node.scale.y = Math.max(node.scale.y, originalScale.x * 1.1);
                
                console.log('Fixed hair mesh:', node.name);
                
                // Make sure hair materials have proper settings
                if (node.material) {
                    // Ensure normal maps are properly applied
                    if (node.material.normalMap) {
                        node.material.normalScale.set(1.0, 1.0);
                    }
                    
                    // Slightly increase roughness for more natural look
                    if (node.material.roughness !== undefined) {
                        node.material.roughness = Math.min(node.material.roughness, 0.7);
                    }
                    
                    node.material.needsUpdate = true;
                }
            }
        });
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
        // Create scene
        this.scene = new THREE.Scene();
        
        // Create camera with standard human eye level
        this.camera = new THREE.PerspectiveCamera(
            45, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        
        // Position for conversational distance (slightly closer and directly centered)
        this.camera.position.set(0, 1.65, 1.5); // Moved closer for conversation
        
        // Get container for renderer
        const container = document.getElementById('canvas-container');
        if (!container) {
            console.error('Could not find canvas container');
            return;
        }
        
        // Create renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x000000, 0); // Set clear color to transparent
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        
        // Enable XR features
        this.renderer.xr.enabled = true;
        
        container.appendChild(this.renderer.domElement);

        // Create VR button using the simplified implementation
        VRInitializer.createVRButton(this.renderer);

        // Position camera at a perfect conversational distance - looking directly at character face
        this.camera.position.set(0, 1.65, 1.5);
        this.camera.lookAt(0, 1.65, 0);

        // Set up the scene environment
        this.scene.background = null; // Changed from THREE.Color(0x1a1a1a) to null for transparency

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
        
        // Set orbit target to match the character's eye position
        this.controls.target.set(0, 1.65, 0); // Target character's eyes
        this.controls.update();

        // Handle window resizing
        window.addEventListener('resize', () => {
            const width = window.innerWidth;
            const height = window.innerHeight; 
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        });

        // Set up the animation loop with XR support
        this.clock = new THREE.Clock();

        // Animation loop with VR support
        const animate = () => {
                if (!this.renderer.xr.isPresenting) {
                // Update controls only in non-VR mode
                    this.controls.update();
                }
                
            // Update morph targets
                this.updateMorphTargets();
            
            // Update animation mixer if available
            if (this.modelLoader && this.modelLoader.getMixer()) {
                const delta = this.clock.getDelta();
                this.modelLoader.getMixer().update(delta);
            }
                
                // Render scene
                this.renderer.render(this.scene, this.camera);
        };

        // Use WebXR's animation loop
        this.renderer.setAnimationLoop(animate);
    }

    updateMorphTargets() {
        if (!this.morphTargetMesh) return;

        // When not speaking, ensure morph targets are reset
        if (!this.isAudioPlaying || !this.currentVisemeTimeline) {
            // This is a safety check - if we're not speaking but the method was called,
            // ensure all morphs are zeroed out and start transition if needed
            if (!this.transitionToRestingFace) {
                this.transitionToRestingFace = true;
                this.transitionStartTime = null;
            }
            return;
        }

        // Reset all morph target influences
        this.morphTargetMesh.morphTargetInfluences.fill(0);
        
        // Apply minimal eye movements when speaking
        this.applyEyeMovements();
        
        // Apply phoneme-based lip sync
            this.applyPhonemeLipSync();
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

    // Reset the model to its original state without any morphs but keep original animation
    resetModelToOriginal() {
        // Stub method retained for compatibility
        console.log('resetModelToOriginal called but disabled');
    }

    async generateResponse(userInput) {
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
    
    // Add speech recognition methods
    async startListening() {
        return new Promise((resolve, reject) => {
            if (!('webkitSpeechRecognition' in window)) {
                reject(new Error('Speech recognition not supported in this browser'));
                return;
            }
            
            // Create recognition instance if it doesn't exist
            if (!this.recognition) {
                this.recognition = new webkitSpeechRecognition();
                this.recognition.continuous = false;
                this.recognition.interimResults = true;
                this.recognition.lang = 'en-US';
                this.recognition.maxAlternatives = 3;
                
                this.recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    if (event.results[0].isFinal) {
                        this.recognitionResult = {
                            transcript: transcript,
                            confidence: event.results[0][0].confidence
                        };
                    }
                };
                
                this.recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    this.recognitionResult = {
                        error: event.error,
                        message: `Speech recognition error: ${event.error}`
                    };
                };
                
                this.recognition.onend = () => {
                    resolve(this.recognitionResult || { error: 'No speech detected' });
                    this.recognitionResult = null;
                };
            }
            
            // Reset and start
            this.recognitionResult = null;
            
            try {
                this.recognition.start();
            } catch (error) {
                reject(error);
            }
        });
    }
    
    stopListening() {
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('Error stopping recognition:', error);
            }
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Basic service worker registration for caching
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/src/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(error => {
                console.error('ServiceWorker registration failed:', error);
            });
    }
    
    // Initialize audio on user interaction
    window.addEventListener('click', async function() {
        try {
            // Try to create and resume an audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                const tempContext = new AudioContext();
                if (tempContext.state === 'suspended') {
                    await tempContext.resume();
                }
                console.log('Audio initialized');
            }
        } catch (err) {
            console.error('Error initializing audio:', err);
        }
    });
    
    // Initialize WebXR support detection
    VRInitializer.checkVRSupport();
    VRInitializer.setupVRViewport();
    VRInitializer.ensureVRButtonVisibility();
    
    // Configure WebXR for optimal face-to-face conversation
    if (navigator.xr) {
        // Add a listener for VR session start to position the camera correctly
        document.addEventListener('vrsessionstart', () => {
            console.log('VR session started - optimizing for face-to-face conversation at eye level');
            
            // If we have access to the chatbot system, adjust the character position
            if (window.chatbot && window.chatbot.facialAnimation) {
                const facialSystem = window.chatbot.facialAnimation;
                
                // Get character and room from facial system
                const characterModel = facialSystem.characterModel;
                const initialPositions = facialSystem.initialEyeAlignedPosition;
                
                if (characterModel) {
                    // Detect if we're on mobile
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    // Position character at the eye-aligned position with minor adjustments for VR
                    const characterYPosition = initialPositions?.character?.y || 0;
                    
                    // Set position with accurate eye-level alignment
                    characterModel.position.set(
                        0,                        // Centered horizontally
                        characterYPosition,       // Use stored eye-aligned position
                        -2                        // 2 meters away for conversation
                    );
                    
                    // Reset rotation to face user directly
                    characterModel.rotation.set(0, 0, 0);
                    
                    // Use local reference space for better positioning
                    if (facialSystem.renderer && facialSystem.renderer.xr) {
                        facialSystem.renderer.xr.setReferenceSpaceType('local');
                        console.log('Set reference space type to "local" for better positioning');
                    }
                    
                    console.log('Character positioned for VR conversation at eye level:', characterModel.position);
                }
            }
        });
    }
    
    // Initialize chatbot
    const chatbot = new ChatbotSystem();
    window.chatbot = chatbot; // Make it accessible for debugging
    
    // Ensure VR button is always on top and optimized for face-to-face conversation
    setTimeout(() => {
        const vrButton = document.getElementById('vr-button');
        if (vrButton) {
            // Make sure it's at the highest z-index
            vrButton.style.zIndex = '999999';
            
            // Ensure it's directly attached to the body
            if (vrButton.parentElement !== document.body) {
                document.body.appendChild(vrButton);
            }
            
            // Modify the VR button click handler to optimize for face-to-face conversation
            const originalOnClick = vrButton.onclick;
            vrButton.onclick = function(event) {
                console.log('VR button clicked - preparing optimal eye-level positioning');
                
                // If we have access to the chatbot system, prepare it for VR
                if (window.chatbot && window.chatbot.facialAnimation) {
                    const facialSystem = window.chatbot.facialAnimation;
                    
                    // If we have the character model, position it for VR
                    if (facialSystem.camera && facialSystem.characterModel) {
                        // Get character model and initial aligned positions
                        const characterModel = facialSystem.characterModel;
                        const initialPositions = facialSystem.initialEyeAlignedPosition;
                        
                        if (characterModel && initialPositions) {
                            // Detect if we're on mobile
                            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                            
                            // Use the original eye-aligned position from initialization
                            const characterYPosition = initialPositions.character.y;
                            
                            console.log(`Using eye-aligned character position Y=${characterYPosition.toFixed(2)}`);
                            
                            // Position character to match eye level
                            characterModel.position.set(
                                0,                      // Centered horizontally
                                characterYPosition,     // Eye-aligned position from initialization
                                -2                      // 2 meters away for perfect conversation distance
                            );
                            
                            // Reset rotation to face user directly
                            characterModel.rotation.set(0, 0, 0);
                            
                            // Use local reference space for better positioning
                            if (facialSystem.renderer && facialSystem.renderer.xr) {
                                facialSystem.renderer.xr.setReferenceSpaceType('local');
                                console.log('Set reference space type to "local" for consistent VR positioning');
                            }
                            
                            console.log('Character positioned for VR at:', characterModel.position);
                        } else {
                            console.warn('Could not find initial eye-aligned positions');
                        }
                    }
                }
                
                // Call the original click handler
                if (originalOnClick) {
                    originalOnClick.call(this, event);
                }
            };
            
            console.log('VR button configured for face-to-face conversational experience');
        }
    }, 1000); // Delay to ensure other elements are loaded
}); 