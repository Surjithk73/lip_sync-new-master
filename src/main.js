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
    }

    initSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window)) {
            alert('Speech recognition is not supported in this browser.');
            return;
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.addMessageToChat('user', transcript);
            if (event.results[0].isFinal) {
                this.generateResponse(transcript);
            }
        };

        this.recognition.onend = () => {
            if (this.isRecording && !this.processingResponse) {
                this.recognition.start();
            } else {
                this.updateRecordingUI(false);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.updateRecordingUI(false);
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
    }

    startRecording() {
        if (this.processingResponse) return;

        this.isRecording = true;
        this.updateRecordingUI(true);
        
        // Create a new message container for this recording session
        this.currentMessage = document.createElement('div');
        this.currentMessage.classList.add('message', 'user-message');
        this.currentMessage.textContent = '';
        this.chatMessages.appendChild(this.currentMessage);
        
        this.recognition.start();
    }

    stopRecording() {
        this.isRecording = false;
        this.recognition.stop();
        this.updateRecordingUI(false);
        this.currentMessage = null;
    }

    updateRecordingUI(isRecording) {
        this.recordButton.textContent = isRecording ? 'Stop Recording' : 'Start Recording';
        this.recordButton.classList.toggle('recording', isRecording);
        this.recordingStatus.textContent = isRecording ? 'Listening...' : 'Click to start speaking';
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
            
            // Position the model much lower for VR viewing
            model.position.set(0, 0.3, -1.0); // Reduced from 0.8 to 0.3 meters (much lower)
            this.scene.add(model);
            this.morphTargetMesh = modelLoader.findMorphTargetMesh(model);
            
            if (!this.morphTargetMesh) {
                throw new Error('No mesh with morph targets found in the model');
            }
            
            // Initialize morph target system
            this.initializeMorphTargets();
            
            // Try to create default idle animation directly - the external animation files aren't working
            console.log('Creating default idle animation for model...');
            try {
                // Use our enhanced default animation
                modelLoader.createDefaultIdleAnimation(model);
                console.log('Default idle animation applied successfully');
            } catch (animError) {
                console.error('Failed to create idle animation:', animError);
            }
            
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
        
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000); // Wider FOV for VR
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
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
                        
                        // Reset camera position when entering VR
                        this.camera.position.set(0, 0.3, 1.0);
                        this.camera.lookAt(0, 0.3, -1.0);
                        
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

        // Position camera for comfortable viewing in VR
        this.camera.position.set(0, 0.3, 1.0); // Adjusted to match new model height
        this.camera.lookAt(0, 0.3, 0);

        // Set up the scene environment
        this.scene.background = new THREE.Color(0x1a1a1a);

        // Lighting setup optimized for VR
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Adjust lights to match new model position
        const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
        frontLight.position.set(0, 0.5, 1.5); // Keep light slightly above head
        frontLight.target.position.set(0, 0.3, -1.0); // Point at new model position
        frontLight.castShadow = true;
        this.scene.add(frontLight);
        this.scene.add(frontLight.target);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-2, 1.6, 0);
        this.scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
        rimLight.position.set(0, 1.7, -2);
        this.scene.add(rimLight);

        // Controls for non-VR mode
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.rotateSpeed = 0.5;
        this.controls.minDistance = 1.0;
        this.controls.maxDistance = 3.0;
        this.controls.target.set(0, 0.3, -1.0); // Updated orbit controls target

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
                
                // Update animation mixer (for body animation)
                if (this.modelLoader && this.modelLoader.getMixer()) {
                    this.modelLoader.updateMixer(delta);
                }
                
                // Update controls only in non-VR mode
                if (!this.renderer.xr.isPresenting) {
                    this.controls.update();
                }
                
                // Update morph targets for facial animation
                this.updateMorphTargets();
                
                // Render scene
                this.renderer.render(this.scene, this.camera);
            });
        };

        animate();
    }

    updateMorphTargets() {
        if (!this.morphTargetMesh) return;

        // Reset all morph target influences
        this.morphTargetMesh.morphTargetInfluences.fill(0);
        
        // Apply eye movements
        this.applyEyeMovements();
        
        // Apply phoneme-based lip sync if we have an active timeline
        if (this.isAudioPlaying && this.currentVisemeTimeline) {
            this.applyPhonemeLipSync();
        } else {
            // Apply default resting face
            this.applyRestingFace();
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
            
            // Generate speech from text
            const audioData = await window.chatbot.ttsService.textToSpeech(text);
            
            if (!audioData || !audioData.url) {
                console.error('Failed to get valid audio data from TTS service');
                return;
            }
            
            console.log('Received audio data with duration:', audioData.duration);
            
            // Generate viseme timeline based on text and audio duration
            this.currentVisemeTimeline = await this.phonemeLipSync.createVisemeTimeline(text, audioData.duration);
            
            // Start facial animation
            this.isAudioPlaying = true;
            this.audioStartTime = performance.now();
            
            // Play audio through audio manager
            const playSuccess = await this.audioManager.playAudio(audioData.url);
            
            if (!playSuccess) {
                console.error('Failed to play audio through AudioManager');
                // Try direct audio element approach as fallback
                const audioElement = document.getElementById('audioInput');
                if (audioElement) {
                    audioElement.src = audioData.url;
                    audioElement.play().catch(e => console.error('Direct audio playback failed:', e));
                }
            }
            
            return new Promise((resolve) => {
                // Create a checker function
                const checkAudioComplete = () => {
                    const audioElement = document.getElementById('audioInput');
                    if (!audioElement || audioElement.ended || audioElement.paused) {
                        console.log('Audio playback completed');
                    this.isAudioPlaying = false;
                        this.currentVisemeTimeline = null;
                    // Return to neutral expression
                        if (this.morphTargetMesh) {
                    this.morphTargetMesh.morphTargetInfluences.fill(0);
                        }
                    // Clean up the temporary audio URL
                        URL.revokeObjectURL(audioData.url);
                    resolve();
                    } else {
                        // Check again in a moment
                        setTimeout(checkAudioComplete, 100);
                    }
                };
                
                // Start checking
                setTimeout(checkAudioComplete, audioData.duration * 1000 + 500);
                
                // Also listen for the ended event as backup
                const audioElement = document.getElementById('audioInput');
                if (audioElement) {
                    audioElement.onended = () => {
                        console.log('Audio ended event triggered');
                        this.isAudioPlaying = false;
                        this.currentVisemeTimeline = null;
                        // Return to neutral expression
                        if (this.morphTargetMesh) {
                            this.morphTargetMesh.morphTargetInfluences.fill(0);
                        }
                        // Clean up the temporary audio URL
                        URL.revokeObjectURL(audioData.url);
                        resolve();
                    };
                }
            });
        } catch (error) {
            console.error('Error in speech response:', error);
            this.isAudioPlaying = false;
            throw error;
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Add user interaction handler to activate audio
    document.body.addEventListener('click', function() {
        // Try to resume audio context if it exists but is suspended
        if (window.chatbot && 
            window.chatbot.facialAnimation && 
            window.chatbot.facialAnimation.audioContext && 
            window.chatbot.facialAnimation.audioContext.state === 'suspended') {
            
            console.log('User interaction detected - resuming audio context');
            window.chatbot.facialAnimation.audioContext.resume().then(() => {
                console.log('AudioContext resumed successfully');
            }).catch(err => {
                console.error('Failed to resume AudioContext:', err);
            });
        }
    }, { once: true });

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