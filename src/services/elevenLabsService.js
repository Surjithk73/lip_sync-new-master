class ElevenLabsService {
    constructor() {
        // API configuration
        this.API_KEY = 'sk_9ad2b81887703c99443ddee5503769b89c0e8317f693f1f1'; // Updated API key
        this.BASE_URL = 'https://api.elevenlabs.io/v1';
        
        // Using Adam voice ID - Professional male voice
        // You can also use other male voices:
        // Josh (passionate, exciting): 'TxGEqnHWrfWFTfGW9XjX'
        // Sam (serious, grounded): 'yoZ06aMxZJJ28mfd3POQ'
        // Adam (professional, balanced): 'pNInz6obpgDQGcFmaJgB'
        this.VOICE_ID = 'pNInz6obpgDQGcFmaJgB';

        // Voice settings
        this.voiceSettings = {
            stability: 0.5,
            similarity_boost: 0.75,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
            },
            optimize_streaming_latency: 0,
            output_format: "mp3_44100_128"
        };
        
        // Audio context for duration calculations
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async createVoice(name, audioFiles) {
        try {
            const formData = new FormData();
            formData.append('name', name);
            audioFiles.forEach((file, index) => {
                formData.append(`files`, file);
            });

            const response = await fetch(`${this.BASE_URL}/voices/add`, {
                method: 'POST',
                headers: {
                    'xi-api-key': this.API_KEY,
                },
                body: formData
            });

            const data = await response.json();
            this.VOICE_ID = data.voice_id;
            return data;
        } catch (error) {
            console.error('Error creating voice:', error);
            throw error;
        }
    }

    async textToSpeech(text) {
        try {
            console.log('Generating speech for text:', text);
            
            const response = await fetch(`${this.BASE_URL}/text-to-speech/${this.VOICE_ID}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': this.API_KEY
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                })
            });

            if (!response.ok) {
                throw new Error('TTS request failed');
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Get the audio duration
            const audioDuration = await this.getAudioDuration(audioBlob);
            console.log('Generated audio duration:', audioDuration);
            
            return {
                url: audioUrl,
                duration: audioDuration,
                text: text
            };
        } catch (error) {
            console.error('Error generating speech:', error);
            throw error;
        }
    }
    
    // Get the duration of an audio blob
    async getAudioDuration(audioBlob) {
        return new Promise((resolve, reject) => {
            const audioElement = new Audio();
            audioElement.src = URL.createObjectURL(audioBlob);
            
            audioElement.onloadedmetadata = () => {
                const duration = audioElement.duration;
                URL.revokeObjectURL(audioElement.src);
                resolve(duration);
            };
            
            audioElement.onerror = (error) => {
                URL.revokeObjectURL(audioElement.src);
                reject(error);
            };
        });
    }

    setApiKey(apiKey) {
        this.API_KEY = apiKey;
    }

    setVoiceId(voiceId) {
        this.VOICE_ID = voiceId;
    }

    getVoiceId() {
        return this.VOICE_ID;
    }

    // Method to update voice settings
    updateVoiceSettings(settings) {
        this.voiceSettings = {
            ...this.voiceSettings,
            ...settings
        };
    }
}

export default ElevenLabsService; 