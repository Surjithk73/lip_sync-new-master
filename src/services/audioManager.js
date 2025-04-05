class AudioManager {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
        this.audioElement = null;
        this.gainNode = null;
        this.analyzer = null;
        this.initPromise = null;
        this.sourceMap = new Map(); // Keep track of sources to avoid duplicate connections
    }

    async initialize() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise(async (resolve) => {
            try {
                console.log('Initializing AudioManager...');
                
                // Find audio element
                this.audioElement = document.getElementById('audioInput');
                if (!this.audioElement) {
                    console.error('AudioManager: No audio element found with id "audioInput"');
                    // Create one if it doesn't exist
                    this.audioElement = document.createElement('audio');
                    this.audioElement.id = 'audioInput';
                    this.audioElement.preload = 'auto';
                    document.body.appendChild(this.audioElement);
                    console.log('AudioManager: Created new audio element');
                }
                
                // Create audio context
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
                
                // Create gain node for volume control
                this.gainNode = this.audioContext.createGain();
                this.gainNode.gain.value = 1.0; // Full volume
                
                // Create analyzer
                this.analyzer = this.audioContext.createAnalyser();
                this.analyzer.fftSize = 2048;
                
                // Set up audio graph connections (will connect source when playing)
                this.gainNode.connect(this.analyzer);
                this.analyzer.connect(this.audioContext.destination);
                
                console.log('AudioManager: Audio context created:', this.audioContext.state);
                
                // Set up event listeners
                this.setupEventListeners();
                
                // Play silent sound to unlock audio on iOS/Safari
                await this.unlockAudio();
                
                this.isInitialized = true;
                console.log('AudioManager: Initialization complete');
                resolve();
            } catch (error) {
                console.error('AudioManager: Initialization failed:', error);
                resolve(); // Resolve anyway to prevent hanging
            }
        });
        
        return this.initPromise;
    }
    
    setupEventListeners() {
        // Listen for interactions to resume audio context
        const resumeAudioContext = async () => {
            if (this.audioContext && this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                    console.log('AudioManager: AudioContext resumed by user interaction');
                } catch (err) {
                    console.error('AudioManager: Failed to resume AudioContext:', err);
                }
            }
        };
        
        // Add interaction listeners to resume AudioContext
        document.addEventListener('click', resumeAudioContext, { once: false });
        document.addEventListener('touchstart', resumeAudioContext, { once: false });
        document.addEventListener('keydown', resumeAudioContext, { once: false });
        
        // Add error tracking to audio element
        this.audioElement.addEventListener('error', (e) => {
            console.error('AudioManager: Audio element error:', e);
        });
    }
    
    async playAudio(url) {
        try {
            await this.initialize();
            
            if (!this.isInitialized) {
                console.error('AudioManager: Cannot play audio - not initialized');
                return false;
            }
            
            // Resume AudioContext if suspended
            if (this.audioContext.state === 'suspended') {
                try {
                    console.log('AudioManager: Resuming audio context...');
                    await this.audioContext.resume();
                    
                    // Play silent audio to unlock if needed
                    await this.unlockAudio();
                } catch (err) {
                    console.error('AudioManager: Failed to resume AudioContext:', err);
                    return false;
                }
            }
            
            // Clean up previous playback
            this.stop();
            
            // For this playback, create a new audio element
            // This helps avoid issues with some browsers not properly resetting audio elements
            const audioId = 'audioInput_' + Date.now();
            const newAudioElement = document.createElement('audio');
            newAudioElement.id = audioId;
            newAudioElement.preload = 'auto';
            newAudioElement.crossOrigin = 'anonymous';
            document.body.appendChild(newAudioElement);
            
            // Keep a reference to the old audio element for cleanup later
            const oldAudioElement = this.audioElement;
            
            // Switch to the new audio element
            this.audioElement = newAudioElement;
            
            // Set audio source
            this.audioElement.src = url;
            this.audioElement.muted = false;
            this.audioElement.volume = 1.0;
            
            // Create a new source for this audio element
            try {
                const source = this.audioContext.createMediaElementSource(this.audioElement);
                source.connect(this.gainNode);
                
                // Save the source in our map
                this.sourceMap.set(audioId, source);
                
                // Set up ended handler to clean up the element
                this.audioElement.onended = () => {
                    console.log('AudioManager: Audio playback ended, cleaning up');
                    
                    // Disconnect the source
                    const source = this.sourceMap.get(audioId);
                    if (source) {
                        try {
                            source.disconnect();
                        } catch (e) {
                            // Ignore disconnection errors
                        }
                        this.sourceMap.delete(audioId);
                    }
                    
                    // Remove the element after a short delay to ensure it's done playing
                    setTimeout(() => {
                        if (document.getElementById(audioId)) {
                            document.body.removeChild(newAudioElement);
                        }
                    }, 100);
                };
            } catch (e) {
                console.error('AudioManager: Error creating media element source:', e);
                
                // If we failed to create a source, try to play directly
                try {
                    await this.audioElement.play();
                    return true;
                } catch (playError) {
                    console.error('AudioManager: Direct playback failed:', playError);
                    
                    // Clean up the new element since we're not using it
                    if (document.getElementById(audioId)) {
                        document.body.removeChild(newAudioElement);
                    }
                    
                    // Switch back to the old element
                    this.audioElement = oldAudioElement;
                    return false;
                }
            }
            
            console.log('AudioManager: Starting audio playback');
            
            try {
                const playPromise = this.audioElement.play();
                
                if (playPromise !== undefined) {
                    await playPromise;
                    console.log('AudioManager: Audio playback started successfully');
                    
                    // Now that we know the new audio element is working,
                    // we can clean up the old one (if it's not the same)
                    if (oldAudioElement !== this.audioElement && document.getElementById(oldAudioElement.id)) {
                        // Only remove if it's not the built-in audioInput element
                        if (oldAudioElement.id !== 'audioInput') {
                            try {
                                document.body.removeChild(oldAudioElement);
                            } catch (e) {
                                // Ignore errors removing the element
                            }
                        }
                    }
                    
                    return true;
                }
                return true; // Return true even if playPromise is undefined (older browsers)
            } catch (error) {
                console.error('AudioManager: Error playing audio:', error);
                
                // Clean up and switch back to old element
                if (document.getElementById(audioId)) {
                    document.body.removeChild(newAudioElement);
                }
                this.audioElement = oldAudioElement;
                
                // As a last resort, try creating a new Audio object
                try {
                    const tempAudio = new Audio(url);
                    tempAudio.volume = 1.0;
                    await tempAudio.play();
                    console.log('AudioManager: Fallback audio playback started');
                    return true;
                } catch (fallbackError) {
                    console.error('AudioManager: All playback attempts failed');
                    return false;
                }
            }
        } catch (error) {
            console.error('AudioManager: Playback failed:', error);
            return false;
        }
    }
    
    stop() {
        if (this.audioElement) {
            try {
                this.audioElement.pause();
                this.audioElement.currentTime = 0;
                
                // Cancel any pending audio
                if (this.source) {
                    try {
                        this.source.disconnect();
                    } catch (e) {
                        // Ignore disconnection errors
                    }
                }
            } catch (e) {
                console.warn('AudioManager: Error stopping audio:', e);
            }
        }
    }
    
    setVolume(value) {
        if (this.gainNode) {
            const volume = Math.max(0, Math.min(1, value));
            this.gainNode.gain.value = volume;
        }
    }
    
    getAnalyzer() {
        return this.analyzer;
    }
    
    getAudioContext() {
        return this.audioContext;
    }
    
    // Unlock audio on iOS and other mobile browsers
    async unlockAudio() {
        try {
            // Create and play a silent buffer to unlock audio
            const buffer = this.audioContext.createBuffer(1, 1, 22050);
            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(0);
            console.log('AudioManager: Played silent sound to unlock audio');
            
            // Also try unlocking with an audio element
            const silence = new Audio("data:audio/mp3;base64,SUQzBAAAAAABEUAAACgAZnR5cElzb21pc28yAAAAASwAAAAgAAADaGRscgAAAAADaDZoZWl4EgAAAAxlbmdBVFMwAUVORFM=");
            silence.load();
            try {
                await silence.play();
                setTimeout(() => {
                    silence.pause();
                }, 1);
                console.log('AudioManager: Played silent audio element to unlock audio');
            } catch (e) {
                // Silence errors - this is just a secondary attempt
            }
        } catch (e) {
            console.warn('AudioManager: Could not unlock audio, may have issues on iOS:', e);
        }
    }
}

export default AudioManager; 