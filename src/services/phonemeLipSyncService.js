import compromise from 'compromise';
import meSpeak from 'mespeak';

class PhonemeLipSyncService {
    constructor() {
        // Standard Preston Blair phoneme set - the industry standard for lip sync
        // This is a reduced set focusing on the most important mouth shapes
        this.visemeMap = {
            // Standard Preston Blair viseme set (simplified)
            'AA': 'viseme_aa', // "ah" as in "father" - open mouth
            'AE': 'viseme_aa', // "a" as in "cat" - open mouth
            'AH': 'viseme_aa', // "uh" as in "cut" - open mouth
            'AO': 'viseme_O',  // "aw" as in "dog" - rounded open mouth
            'AW': 'viseme_aa', // "ow" as in "cow" - open mouth
            'AY': 'viseme_aa', // "eye" - open mouth
            'B': 'viseme_PP',  // "b" as in "bee" - closed lips
            'CH': 'viseme_CH', // "ch" as in "cheese" - pursed lips
            'D': 'viseme_DD',  // "d" as in "dog" - tongue on teeth
            'DH': 'viseme_TH', // "th" as in "that" - tongue through teeth
            'EH': 'viseme_E',  // "e" as in "bed" - slightly open mouth
            'ER': 'viseme_RR', // "ur" as in "bird" - rounded open mouth
            'EY': 'viseme_E',  // "a" as in "say" - slightly open mouth
            'F': 'viseme_FF',  // "f" as in "food" - lower lip on upper teeth
            'G': 'viseme_kk',  // "g" as in "go" - back of mouth
            'HH': 'viseme_sil', // "h" as in "house" - slight opening
            'IH': 'viseme_I',  // "i" as in "sit" - slightly spread lips
            'IY': 'viseme_I',  // "ee" as in "bee" - spread lips
            'JH': 'viseme_CH', // "j" as in "just" - pursed lips
            'K': 'viseme_kk',  // "k" as in "cat" - back of mouth
            'L': 'viseme_DD',  // "l" as in "love" - tongue up
            'M': 'viseme_PP',  // "m" as in "mom" - closed lips
            'N': 'viseme_nn',  // "n" as in "nop" - tongue on upper palate
            'NG': 'viseme_nn', // "ng" as in "sing" - back of mouth
            'OW': 'viseme_O',  // "o" as in "go" - rounded lips
            'OY': 'viseme_O',  // "oy" as in "boy" - rounded lips
            'P': 'viseme_PP',  // "p" as in "pop" - closed lips
            'R': 'viseme_RR',  // "r" as in "red" - rounded small opening
            'S': 'viseme_SS',  // "s" as in "sit" - teeth close, slight grimace
            'SH': 'viseme_SS', // "sh" as in "she" - rounded small opening
            'T': 'viseme_DD',  // "t" as in "top" - tongue on upper palate
            'TH': 'viseme_TH', // "th" as in "thin" - tongue between teeth
            'UH': 'viseme_U',  // "oo" as in "book" - rounded lips
            'UW': 'viseme_U',  // "oo" as in "food" - very rounded lips
            'V': 'viseme_FF',  // "v" as in "very" - lower lip on upper teeth
            'W': 'viseme_U',   // "w" as in "way" - rounded lips
            'Y': 'viseme_I',   // "y" as in "yes" - slightly spread lips
            'Z': 'viseme_SS',  // "z" as in "zoo" - teeth close, slight grimace
            'ZH': 'viseme_SS', // "zh" as in "measure" - teeth close, slight grimace
            'sil': 'viseme_sil' // silence - neutral closed mouth
        };

        // Secondary morph targets that accompany each viseme for more natural movement
        // These are carefully calibrated to match real human mouth movements
        this.secondaryMorphs = {
            'viseme_sil': { morphs: ["mouthClose"], weight: 0.12 },
            'viseme_PP': { morphs: ["mouthPucker", "mouthClose"], weight: 0.25 },
            'viseme_FF': { morphs: ["mouthRollLower", "jawOpen"], weight: 0.28 },
            'viseme_TH': { morphs: ["mouthRollLower", "jawOpen"], weight: 0.30 },
            'viseme_DD': { morphs: ["jawOpen", "mouthLowerDownLeft", "mouthLowerDownRight"], weight: 0.32 },
            'viseme_kk': { morphs: ["jawOpen", "mouthOpen"], weight: 0.35 },
            'viseme_CH': { morphs: ["mouthPucker", "jawOpen"], weight: 0.30 },
            'viseme_SS': { morphs: ["mouthStretchLeft", "mouthStretchRight", "jawForward"], weight: 0.28 },
            'viseme_nn': { morphs: ["jawOpen", "mouthLowerDownLeft", "mouthLowerDownRight"], weight: 0.28 },
            'viseme_RR': { morphs: ["mouthOpen", "jawOpen"], weight: 0.32 },
            'viseme_aa': { morphs: ["mouthOpen", "jawOpen"], weight: 0.45 }, // Much higher for open vowels
            'viseme_E': { morphs: ["mouthStretchLeft", "mouthStretchRight", "jawOpen"], weight: 0.38 }, // Added jawOpen
            'viseme_I': { morphs: ["mouthSmileLeft", "mouthSmileRight", "jawOpen"], weight: 0.35 }, // Added jawOpen
            'viseme_O': { morphs: ["mouthPucker", "mouthFunnel", "jawOpen"], weight: 0.40 }, // Added jawOpen
            'viseme_U': { morphs: ["mouthPucker", "jawOpen"], weight: 0.35 } // Added jawOpen
        };

        // Dictionary of phoneme patterns for improved word analysis
        this.phonemePatterns = this.buildPhonemePatterns();
        
        // Viseme reduction map - reduces the 15 visemes to 7 core visemes for more natural speech
        // This follows the Disney animation principle of simplification
        this.reducedVisemeSet = {
            'viseme_sil': 'viseme_sil', // Neutral
            'viseme_PP': 'viseme_PP',   // Closed (P, B, M)
            'viseme_FF': 'viseme_FF',   // Labiodental (F, V)
            'viseme_TH': 'viseme_TH',   // Interdental (TH)
            'viseme_DD': 'viseme_DD',   // Dental/Alveolar (D, T, L, N)
            'viseme_kk': 'viseme_kk',   // Velar (K, G)
            'viseme_CH': 'viseme_CH',   // Post-alveolar (CH, J, SH)
            'viseme_SS': 'viseme_FF',   // Map to FF (simplified)
            'viseme_nn': 'viseme_DD',   // Map to DD (simplified)
            'viseme_RR': 'viseme_TH',   // Map to TH (simplified)
            'viseme_aa': 'viseme_aa',   // Open vowel
            'viseme_E': 'viseme_E',     // Mid vowel
            'viseme_I': 'viseme_I',     // Spread vowel
            'viseme_O': 'viseme_O',     // Round vowel
            'viseme_U': 'viseme_U'      // Tight round vowel
        };
    }

    // Build a dictionary of text patterns to phoneme mappings
    buildPhonemePatterns() {
        return {
            // Vowels
            'a': { match: /a(?![iy])/g, phoneme: 'AA' },
            'ay': { match: /ay|ai/g, phoneme: 'AY' },
            'ah': { match: /ah/g, phoneme: 'AH' },
            'aw': { match: /aw|au/g, phoneme: 'AW' },
            'e': { match: /e(?![e])/g, phoneme: 'EH' },
            'ee': { match: /ee|ea|y$/g, phoneme: 'IY' },
            'i': { match: /i(?![e])/g, phoneme: 'IH' },
            'o': { match: /o(?![ou])/g, phoneme: 'AO' },
            'oo': { match: /oo|u[^aeiou]/g, phoneme: 'UW' },
            'ou': { match: /ou|ow/g, phoneme: 'OW' },
            'oy': { match: /oy|oi/g, phoneme: 'OY' },
            'u': { match: /u/g, phoneme: 'UH' },
            'er': { match: /er|ir|ur/g, phoneme: 'ER' },
            
            // Consonants
            'b': { match: /b/g, phoneme: 'B' },
            'ch': { match: /ch|tch/g, phoneme: 'CH' },
            'd': { match: /d/g, phoneme: 'D' },
            'f': { match: /f|ph/g, phoneme: 'F' },
            'g': { match: /g(?![h])/g, phoneme: 'G' },
            'h': { match: /h|wh/g, phoneme: 'HH' },
            'j': { match: /j|dge/g, phoneme: 'JH' },
            'k': { match: /k|c(?![eiy])/g, phoneme: 'K' },
            'l': { match: /l/g, phoneme: 'L' },
            'm': { match: /m/g, phoneme: 'M' },
            'n': { match: /n(?![g])/g, phoneme: 'N' },
            'ng': { match: /ng/g, phoneme: 'NG' },
            'p': { match: /p/g, phoneme: 'P' },
            'r': { match: /r/g, phoneme: 'R' },
            's': { match: /s(?![h])|c(?=[eiy])/g, phoneme: 'S' },
            'sh': { match: /sh|ti(?=on)|si(?=on)/g, phoneme: 'SH' },
            't': { match: /t(?![h])/g, phoneme: 'T' },
            'th': { match: /th/g, phoneme: 'TH' },
            'v': { match: /v/g, phoneme: 'V' },
            'w': { match: /w/g, phoneme: 'W' },
            'y': { match: /y(?=[aeiou])/g, phoneme: 'Y' },
            'z': { match: /z/g, phoneme: 'Z' },
            'zh': { match: /si(?=a)/g, phoneme: 'ZH' }
        };
    }

    // Convert text to phonemes with improved natural pauses
    textToPhonemes(text) {
        try {
            console.log('Converting text to phonemes:', text);
            
            // Break text into sentences for more natural pacing
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const result = [];
            
            for (let sentence of sentences) {
                // Add a longer pause before each sentence (except the first)
                if (result.length > 0) {
                    result.push({
                        phoneme: 'sil',
                        duration: 0.3, // Longer pause between sentences
                        viseme: 'viseme_sil'
                    });
                }
                
                // Process words in the sentence
                const words = sentence.toLowerCase().split(/\s+/);
                
                for (let i = 0; i < words.length; i++) {
                    let word = words[i];
                    
                    // Add silence between words (with varying durations based on context)
                    if (i > 0) {
                        // Shorter pauses between words within a phrase
                        result.push({
                            phoneme: 'sil',
                            duration: this.getWordBreakDuration(words[i-1], word),
                            viseme: 'viseme_sil'
                        });
                    }
                    
                    // Clean the word - only keep letters and apostrophes
                    word = word.replace(/[^a-z']/g, '');
                    if (!word) continue;
                    
                    // Extract phonemes from the word
                    const wordPhonemes = this.extractPhonemesFromWord(word);
                    
                    // For longer words, we need to handle them differently
                    if (word.length > 3 && wordPhonemes.length > 2) {
                        // For longer words, emphasize the first syllable and reduce others
                        // This follows natural speech patterns where we emphasize certain syllables
                        for (let j = 0; j < wordPhonemes.length; j++) {
                            if (j === 0) {
                                // First syllable gets normal duration
                                result.push(wordPhonemes[j]);
                            } else {
                                // Subsequent syllables get slightly shorter duration
                                // to avoid machine-gun effect
                                const reducedPhoneme = {...wordPhonemes[j]};
                                reducedPhoneme.duration *= 0.85; // Reduce duration slightly
                                result.push(reducedPhoneme);
                            }
                        }
                    } else {
                        // For shorter words, just add all phonemes normally
                        result.push(...wordPhonemes);
                    }
                }
            }
            
            // Add final silence
            result.push({
                phoneme: 'sil',
                duration: 0.25, // Longer final pause
                viseme: 'viseme_sil'
            });
            
            // Process the result to simplify and reduce visemes
            const processedResult = this.reduceVisemes(result);
            
            console.log('Generated phonemes:', processedResult);
            return processedResult;
        } catch (error) {
            console.error('Failed to convert text to phonemes:', error);
            return this.fallbackPhonemes(text);
        }
    }
    
    // Process and reduce visemes to avoid too many changes
    reduceVisemes(phonemes) {
        if (!phonemes || phonemes.length === 0) return [];
        
        const processedPhonemes = [];
        let lastViseme = null;
        let accumulatedDuration = 0;
        
        // Combine consecutive identical visemes to reduce mouth movement
        for (let i = 0; i < phonemes.length; i++) {
            const currentPhoneme = phonemes[i];
            const reducedViseme = this.reducedVisemeSet[currentPhoneme.viseme] || currentPhoneme.viseme;
            
            // Set the reduced viseme
            currentPhoneme.viseme = reducedViseme;
            
            // If this is the same viseme as before, combine them
            if (lastViseme === reducedViseme) {
                accumulatedDuration += currentPhoneme.duration;
                // Only update the last phoneme's duration, don't add a new one
                if (processedPhonemes.length > 0) {
                    processedPhonemes[processedPhonemes.length - 1].duration = accumulatedDuration;
                }
            } else {
                // New viseme, add it to the list
                processedPhonemes.push({...currentPhoneme});
                lastViseme = reducedViseme;
                accumulatedDuration = currentPhoneme.duration;
            }
        }
        
        // Add minimum durations to all visemes
        return processedPhonemes.map(p => {
            // All visemes should have a minimum duration to prevent too fast changes
            if (p.viseme !== 'viseme_sil') {
                p.duration = Math.max(p.duration, 0.15);
            }
            return p;
        });
    }
    
    // Extract phonemes from a single word with improved timing
    extractPhonemesFromWord(word) {
        const phonemes = [];
        let remainingWord = word;
        
        // Try to match longer patterns first
        const sortedPatterns = Object.entries(this.phonemePatterns)
            .sort((a, b) => b[0].length - a[0].length);
        
        while (remainingWord.length > 0) {
            let matched = false;
            
            for (const [key, pattern] of sortedPatterns) {
                pattern.match.lastIndex = 0; // Reset regex
                const match = pattern.match.exec(remainingWord);
                
                if (match && match.index === 0) {
                    // Found a match at the beginning of the remaining word
                    phonemes.push({
                        phoneme: pattern.phoneme,
                        duration: this.getPhoneticDuration(pattern.phoneme, word),
                        viseme: this.mapPhonemeToViseme(pattern.phoneme)
                    });
                    
                    // Remove the matched part
                    remainingWord = remainingWord.substring(match[0].length);
                    matched = true;
                    break;
                }
            }
            
            // If no pattern matched, skip this character
            if (!matched && remainingWord.length > 0) {
                remainingWord = remainingWord.substring(1);
            }
        }
        
        return phonemes;
    }
    
    // Get more realistic duration for a phoneme
    getPhoneticDuration(phoneme, word) {
        // Scale duration based on word length - longer words have shorter individual phonemes
        // This follows natural speech patterns where longer words are said more quickly per-syllable
        const wordLengthFactor = word && word.length > 5 ? 0.85 : 1.0;
        
        // More detailed phoneme duration modeling based on linguistic research
        if (/^(AA|AE|AO|AW|AY)$/.test(phoneme)) {
            // Open vowels tend to be longer
            return 0.22 * wordLengthFactor;
        } else if (/^(EH|ER|EY|IH|IY|OW|OY|UH|UW)$/.test(phoneme)) {
            // Other vowels
            return 0.20 * wordLengthFactor;
        } else if (/^(R|L|W|Y)$/.test(phoneme)) {
            // Semivowels and liquids have medium duration
            return 0.15 * wordLengthFactor;
        } else if (/^(M|N|NG)$/.test(phoneme)) {
            // Nasals have medium duration
            return 0.15 * wordLengthFactor;
        } else if (/^(F|V|S|Z|SH|ZH|TH|DH)$/.test(phoneme)) {
            // Fricatives can be sustained
            return 0.18 * wordLengthFactor;
        } else if (/^(P|B|T|D|K|G)$/.test(phoneme)) {
            // Stops are quick
            return 0.12 * wordLengthFactor;
        } else if (/^(CH|JH)$/.test(phoneme)) {
            // Affricates
            return 0.15 * wordLengthFactor;
        } else {
            // Default case
            return 0.15 * wordLengthFactor;
        }
    }
    
    // Fallback to simple estimation if phoneme extraction fails
    fallbackPhonemes(text) {
        console.log('Using fallback phoneme extraction');
        
        // Split into words for more natural rhythm
        const words = text.toLowerCase().split(/\s+/);
        const result = [];
        
        for (let word of words) {
            // Add pause between words
            if (result.length > 0) {
                result.push({
                    phoneme: 'sil',
                    duration: 0.15,
                    viseme: 'viseme_sil'
                });
            }
            
            // Clean the word
            word = word.replace(/[^a-z]/g, '');
            if (!word) continue;
            
            // For each word, identify vowels and consonants
            let vowels = word.match(/[aeiou]/g) || [];
            
            // If the word has vowels, create a simplified sequence
            if (vowels.length > 0) {
                // Extract the most prominent vowel (usually the first one)
                const mainVowel = vowels[0];
                let mainViseme;
                
                // Map the vowel to a viseme
                if ('a'.includes(mainVowel)) {
                    mainViseme = 'viseme_aa';
                } else if ('e'.includes(mainVowel)) {
                    mainViseme = 'viseme_E';
                } else if ('i'.includes(mainVowel)) {
                    mainViseme = 'viseme_I';
                } else if ('o'.includes(mainVowel)) {
                    mainViseme = 'viseme_O';
                } else if ('u'.includes(mainVowel)) {
                    mainViseme = 'viseme_U';
                }
                
                // Add a main viseme for the word with longer duration
                result.push({
                    phoneme: mainVowel.toUpperCase(),
                    duration: 0.25,
                    viseme: mainViseme
                });
            } else {
                // For words with no vowels (rare), use a default consonant viseme
                result.push({
                    phoneme: 'consonant',
                    duration: 0.2,
                    viseme: 'viseme_DD'
                });
            }
        }
        
        // Add final silence
        result.push({
            phoneme: 'sil',
            duration: 0.2,
            viseme: 'viseme_sil'
        });
        
        return result;
    }

    // Map a phoneme to its corresponding viseme
    mapPhonemeToViseme(phoneme) {
        return this.visemeMap[phoneme] || 'viseme_sil';
    }

    // Calculate timing for each phoneme/viseme with more natural durations
    calculateVisemeTiming(phonemes, totalDuration) {
        if (!phonemes || phonemes.length === 0) {
            return [];
        }

        // Calculate the sum of estimated durations
        const totalEstimatedDuration = phonemes.reduce((sum, p) => sum + p.duration, 0);
        
        // Scale factor to match the actual audio duration
        let scaleFactor = totalDuration / totalEstimatedDuration;
        
        // If scale factor would make visemes too short, adjust it with a minimum bound
        scaleFactor = Math.max(scaleFactor, 0.9);
        
        // Calculate start and end times for each phoneme with some overlap
        let currentTime = 0;
        const timedPhonemes = [];
        
        for (let i = 0; i < phonemes.length; i++) {
            const phoneme = phonemes[i];
            const scaledDuration = phoneme.duration * scaleFactor;
            
            // Determine overlap with previous phoneme (coarticulation)
            let startTime = currentTime;
            
            // Consonant clusters have more overlap than vowel-consonant transitions
            const isCurrentConsonant = !/^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)$/.test(phoneme.phoneme);
            const isPrevConsonant = i > 0 && !/^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)$/.test(phonemes[i-1].phoneme);
            
            if (i > 0 && phoneme.phoneme !== 'sil' && phonemes[i-1].phoneme !== 'sil') {
                if (isCurrentConsonant && isPrevConsonant) {
                    // Consonant-consonant - more overlap for natural speech
                    startTime = Math.max(0, currentTime - 0.05);
                } else {
                    // Vowel-consonant or consonant-vowel - less overlap
                    startTime = Math.max(0, currentTime - 0.02);
                }
            }
            
            currentTime = startTime + scaledDuration;
            
            timedPhonemes.push({
                ...phoneme,
                startTime,
                endTime: currentTime
            });
        }
        
        // Ensure the last phoneme doesn't extend beyond the total audio duration
        if (timedPhonemes.length > 0) {
            const lastPhoneme = timedPhonemes[timedPhonemes.length - 1];
            if (lastPhoneme.endTime > totalDuration) {
                // Adjust the end time of the last phoneme to match the audio duration
                lastPhoneme.endTime = totalDuration;
                console.log('Adjusted last phoneme end time to match audio duration:', totalDuration);
            }
            
            // If there's still a gap at the end, add a silent viseme to fill it
            if (lastPhoneme.endTime < totalDuration) {
                timedPhonemes.push({
                    phoneme: 'sil',
                    viseme: 'viseme_sil',
                    startTime: lastPhoneme.endTime,
                    endTime: totalDuration,
                    duration: totalDuration - lastPhoneme.endTime
                });
                console.log('Added final silent viseme to fill gap');
            }
        }
        
        return timedPhonemes;
    }

    // Create a viseme animation timeline from text and audio duration
    async createVisemeTimeline(text, audioDuration) {
        // Convert text to phonemes
        const phonemes = this.textToPhonemes(text);
        
        // Calculate timing
        const timedVisemes = this.calculateVisemeTiming(phonemes, audioDuration);
        
        return timedVisemes;
    }

    // Get the active viseme at a specific time
    getVisemeAtTime(visemeTimeline, currentTime) {
        if (!visemeTimeline || visemeTimeline.length === 0) {
            return { viseme: 'viseme_sil', intensity: 0.15 }; // Reduced default intensity
        }
        
        // Find the current viseme based on time
        const currentViseme = visemeTimeline.find(v => 
            currentTime >= v.startTime && currentTime <= v.endTime
        );
        
        // If we're between visemes or at the end, return the silent viseme
        if (!currentViseme) {
            return { viseme: 'viseme_sil', intensity: 0.15 }; // Reduced default intensity
        }
        
        // Calculate intensity based on position within the viseme duration
        // More gradual transitions for natural movement
        const visemeDuration = currentViseme.endTime - currentViseme.startTime;
        const positionInViseme = (currentTime - currentViseme.startTime) / visemeDuration;
        
        let intensity;
        if (positionInViseme < 0.25) { // Faster ramp-up time
            // Quicker ramp up for more responsive mouth movement
            intensity = Math.pow(positionInViseme / 0.25, 1.2) * 0.95; // Increased max intensity
        } else if (positionInViseme > 0.75) { // Later ramp-down
            // Slower ramp down for more pronounced movement
            intensity = Math.pow((1 - positionInViseme) / 0.25, 1.2) * 0.95; // Increased max intensity
        } else {
            // Hold at higher intensity to make mouth movements more noticeable
            intensity = 0.95; // Increased intensity
        }
        
        // Scale intensity based on the viseme type
        // Vowels should be more pronounced for clearer speech
        const isVowelViseme = /viseme_(aa|E|I|O|U)/.test(currentViseme.viseme);
        
        // Apply specific intensity scaling based on viseme type
        let intensityScale;
        if (currentViseme.viseme === 'viseme_sil') {
            intensityScale = 0.1; // Almost closed mouth for silence
        } else if (isVowelViseme) {
            if (currentViseme.viseme === 'viseme_aa') {
                intensityScale = 0.65; // Much more open for 'aa' vowel
            } else if (currentViseme.viseme === 'viseme_O') {
                intensityScale = 0.55; // More pronounced for 'O' vowel
            } else {
                intensityScale = 0.45; // Other vowels more pronounced
            }
        } else if (currentViseme.viseme === 'viseme_PP') {
            intensityScale = 0.25; // Closed mouth consonants
        } else {
            intensityScale = 0.35; // Other consonants more pronounced
        }
        
        return { 
            viseme: currentViseme.viseme, 
            intensity: intensity * intensityScale,
            secondaryMorphs: this.secondaryMorphs[currentViseme.viseme]
        };
    }

    // Get appropriate duration for breaks between words
    getWordBreakDuration(previousWord, currentWord) {
        // Punctuation checks (simulate commas with longer pauses)
        if (previousWord.endsWith(',') || previousWord.endsWith(';')) {
            return 0.2; // Medium pause for commas/semicolons
        }
        
        // Basic linguistic rules for natural pauses
        
        // Check if words are function words (usually said quickly with less pause)
        const functionWords = ['the', 'a', 'an', 'and', 'or', 'but', 'if', 'in', 'on', 'at', 'to', 'of', 'for'];
        
        if (functionWords.includes(previousWord) || functionWords.includes(currentWord)) {
            return 0.05; // Slight pause between function words and content words
        }
        
        // Default word break duration
        return 0.1; // Standard pause between content words
    }
}

export default PhonemeLipSyncService; 