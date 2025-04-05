class AudioManager {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
        this.audioElement = null;
        this.gainNode = null;
        this.analyzer = null;
        this.initPromise = null;
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
                } catch (err) {
                    console.error('AudioManager: Failed to resume AudioContext:', err);
                    return false;
                }
            }
            
            // Disconnect previous source if it exists
            if (this.source) {
                try {
                    this.source.disconnect();
                } catch (e) {
                    // Ignore disconnection errors
                }
            }
            
            // Set audio source
            this.audioElement.src = url;
            this.audioElement.muted = false;
            this.audioElement.volume = 1.0;
            
            // Create media element source
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            this.source.connect(this.gainNode);
            
            console.log('AudioManager: Starting audio playback');
            
            try {
                const playPromise = this.audioElement.play();
                
                if (playPromise !== undefined) {
                    await playPromise;
                    console.log('AudioManager: Audio playback started successfully');
                    return true;
                }
            } catch (error) {
                console.error('AudioManager: Error playing audio:', error);
                return false;
            }
        } catch (error) {
            console.error('AudioManager: Playback failed:', error);
            return false;
        }
    }
    
    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
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
}

export default AudioManager; 