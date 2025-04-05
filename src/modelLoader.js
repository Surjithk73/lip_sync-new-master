import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class ModelLoader {
    constructor() {
        this.loader = new GLTFLoader();
        this.fbxLoader = new FBXLoader();
        this.mixer = null;
        this.animations = {};
        this.model = null;
        this.animationModel = null;
    }

    async loadModel(url) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url,
                (gltf) => {
                    const model = gltf.scene;
                    this.setupModel(model);
                    this.model = model;
                    
                    // Check for animations in the GLTF file
                    if (gltf.animations && gltf.animations.length > 0) {
                        console.log(`Model contains ${gltf.animations.length} animations`);
                        this.setupModelAnimations(model, gltf.animations);
                    }
                    
                    resolve(model);
                },
                (progress) => {
                    console.log('Loading model:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading model:', error);
                    reject(error);
                }
            );
        });
    }

    // Setup animations that are included in the model
    setupModelAnimations(model, animations) {
        if (!animations || animations.length === 0) return;
        
        // Create animation mixer if not already created
        if (!this.mixer) {
            this.mixer = new THREE.AnimationMixer(model);
            console.log('Created animation mixer for model');
        }
        
        // Process each animation
        animations.forEach((clip, index) => {
            const name = clip.name || `animation_${index}`;
            this.animations[name] = clip;
            console.log(`Model animation "${name}" found with duration: ${clip.duration}s`);
            
            // Play the first animation by default if it's an idle animation
            if (index === 0 || name.toLowerCase().includes('idle')) {
                const action = this.mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat);
                action.play();
                console.log(`Playing model animation: ${name}`);
            }
        });
    }

    async loadAnimation(url, model) {
        console.log('Attempting to load animation from:', url);
        
        // Determine file extension
        const extension = url.split('.').pop().toLowerCase();
        
        // Try direct fetch first to check if file exists
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`File not found: ${url}`);
            }
        } catch (error) {
            console.error('Animation file fetch error:', error);
            
            // Create a simple idle animation as fallback
            this.createDefaultIdleAnimation(model);
            return Promise.reject(error);
        }
        
        // Based on extension, use appropriate loader
        if (extension === 'fbx') {
            return this.loadFBXAnimation(url, model);
        } else if (extension === 'glb' || extension === 'gltf') {
            return this.loadGLTFAnimation(url, model);
        } else {
            console.warn(`Unsupported animation file format: ${extension}`);
            
            // Create a fallback animation
            this.createDefaultIdleAnimation(model);
            return Promise.reject(new Error(`Unsupported animation format: ${extension}`));
        }
    }
    
    async loadFBXAnimation(url, model) {
        return new Promise((resolve, reject) => {
            this.fbxLoader.load(
                url,
                (fbx) => {
                    console.log('Loaded FBX animation:', url);
                    
                    // Extract animation name from URL
                    const name = url.split('/').pop().split('.')[0];
                    
                    // Store the animation model for debugging
                    this.animationModel = fbx;
                    
                    try {
                        // Check if FBX has animations
                        if (fbx.animations && fbx.animations.length > 0) {
                            // Set up animation
                            this.setupAnimation(fbx, model, name);
                            resolve(this.animations[name]);
                        } else {
                            throw new Error('No animations found in FBX file');
                        }
                    } catch (err) {
                        console.error('Error setting up FBX animation:', err);
                        
                        // Create a default idle animation as fallback
                        this.createDefaultIdleAnimation(model);
                        reject(err);
                    }
                },
                (progress) => {
                    console.log('Loading animation:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading FBX animation:', error);
                    
                    // Create a default idle animation as fallback
                    this.createDefaultIdleAnimation(model);
                    reject(error);
                }
            );
        });
    }
    
    async loadGLTFAnimation(url, model) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(
                url,
                (gltf) => {
                    console.log('Loaded GLTF animation:', url);
                    
                    // Extract animation name from URL
                    const name = url.split('/').pop().split('.')[0];
                    
                    try {
                        // Check if GLTF has animations
                        if (gltf.animations && gltf.animations.length > 0) {
                            // Create animation mixer if not already created
                            if (!this.mixer) {
                                this.mixer = new THREE.AnimationMixer(model);
                                console.log('Created animation mixer for model');
                            }
                            
                            // Use the first animation
                            const clip = gltf.animations[0].clone();
                            
                            // Store the animation
                            this.animations[name] = clip;
                            console.log(`GLTF Animation "${name}" loaded with duration: ${clip.duration}s`);
                            
                            // Create and play the animation
                            const action = this.mixer.clipAction(clip);
                            action.setLoop(THREE.LoopRepeat);
                            action.clampWhenFinished = false;
                            action.play();
                            
                            console.log(`Playing GLTF animation: ${name}`);
                            resolve(clip);
                        } else {
                            throw new Error('No animations found in GLTF file');
                        }
                    } catch (err) {
                        console.error('Error setting up GLTF animation:', err);
                        
                        // Create a default idle animation as fallback
                        this.createDefaultIdleAnimation(model);
                        reject(err);
                    }
                },
                (progress) => {
                    console.log('Loading GLTF animation:', (progress.loaded / progress.total * 100) + '%');
                },
                (error) => {
                    console.error('Error loading GLTF animation:', error);
                    
                    // Create a default idle animation as fallback
                    this.createDefaultIdleAnimation(model);
                    reject(error);
                }
            );
        });
    }
    
    // Create a simple default idle animation
    createDefaultIdleAnimation(model) {
        console.log('Creating enhanced default idle animation');
        
        // Find target objects for animation
        let headObject = null;
        let neckObject = null;
        let spineObject = null;
        let targetMesh = null;
        
        // Collect all animated objects
        model.traverse(node => {
            // Save references to important bones
            if (node.isBone) {
                const name = node.name.toLowerCase();
                if (name.includes('head')) {
                    headObject = node;
                    console.log('Found head bone:', node.name);
                } else if (name.includes('neck')) {
                    neckObject = node;
                    console.log('Found neck bone:', node.name);
                } else if (name.includes('spine')) {
                    if (!spineObject || name.includes('spine1') || name.includes('spine2')) {
                        spineObject = node;
                        console.log('Found spine bone:', node.name);
                    }
                }
            }
            
            // Also find a mesh for position animation fallback
            if (!targetMesh && node.isMesh) {
                targetMesh = node;
            }
        });
        
        // Create animation mixer if not already created
        if (!this.mixer) {
            this.mixer = new THREE.AnimationMixer(model);
            console.log('Created animation mixer for model');
        }
        
        // Create animation tracks
        const tracks = [];
        const duration = 4.0; // Longer animation for more natural movement
        
        // Create natural breathing animation by moving the spine slightly
        if (spineObject) {
            // Breathing track - subtle up and down movement with rotation
            const breathingTimes = [0, duration/4, duration/2, 3*duration/4, duration];
            const breathingPosValues = [
                // Starting position
                0, 0, 0,
                // Breathe in
                0, 0.005, 0,
                // Hold breath
                0, 0.01, 0,
                // Breathe out
                0, 0.005, 0,
                // Back to start
                0, 0, 0
            ];
            
            // Add spine breathing animation
            tracks.push(new THREE.KeyframeTrack(
                `${spineObject.name}.position`,
                breathingTimes,
                breathingPosValues
            ));
            
            // Subtle spine rotation for more natural movement
            const breathingRotValues = [
                // Start
                0, 0, 0, 1,  
                // Slight forward
                0.005, 0, 0, 0.9998,
                // Max forward
                0.01, 0, 0, 0.9998,
                // Back to slight
                0.005, 0, 0, 0.9998,
                // Return to start
                0, 0, 0, 1
            ];
            
            tracks.push(new THREE.KeyframeTrack(
                `${spineObject.name}.quaternion`,
                breathingTimes,
                breathingRotValues
            ));
        }
        
        // Add subtle head movement if head bone exists
        if (headObject) {
            // Head movement track - looking around slightly
            const headTimes = [0, duration/3, 2*duration/3, duration];
            const headRotValues = [
                // Start - neutral
                0, 0, 0, 1,
                // Look slightly right and down
                0.01, -0.015, 0.005, 0.9998,
                // Look slightly left and up
                -0.01, 0.015, -0.005, 0.9998,
                // Back to neutral
                0, 0, 0, 1
            ];
            
            tracks.push(new THREE.KeyframeTrack(
                `${headObject.name}.quaternion`,
                headTimes,
                headRotValues
            ));
        }
        
        // Add neck movement if neck bone exists
        if (neckObject) {
            // Neck movement track - slight movement
            const neckTimes = [0, duration/2, duration];
            const neckRotValues = [
                // Start position
                0, 0, 0, 1,
                // Subtle tilt
                0.005, 0.008, 0, 0.9999,
                // Back to start
                0, 0, 0, 1
            ];
            
            tracks.push(new THREE.KeyframeTrack(
                `${neckObject.name}.quaternion`,
                neckTimes,
                neckRotValues
            ));
        }
        
        // If no bones were found, apply animation to the entire model as fallback
        if (tracks.length === 0 && targetMesh) {
            console.log('No bones found for animation, using mesh fallback');
            
            const meshTimes = [0, duration/2, duration];
            const meshPosValues = [
                // Initial position
                0, 0, 0,
                // Slight up movement
                0, 0.01, 0,
                // Back to initial
                0, 0, 0
            ];
            
            tracks.push(new THREE.KeyframeTrack(
                `.position`,
                meshTimes,
                meshPosValues
            ));
        }
        
        // If we have valid tracks, create and play the animation
        if (tracks.length > 0) {
            // Create animation clip
            const clip = new THREE.AnimationClip('EnhancedIdle', duration, tracks);
            
            // Store the animation
            this.animations['EnhancedIdle'] = clip;
            
            // Play the animation with crossfade
            const action = this.mixer.clipAction(clip);
            action.setLoop(THREE.LoopRepeat);
            action.clampWhenFinished = false;
            action.play();
            
            console.log('Playing enhanced idle animation with', tracks.length, 'animation tracks');
            return clip;
        } else {
            console.warn('Could not create any animation tracks');
            return null;
        }
    }
    
    setupAnimation(fbxModel, targetModel, animationName) {
        // Log bone structures for debugging
        console.log('FBX model structure:', this.getBoneStructure(fbxModel));
        console.log('Target model structure:', this.getBoneStructure(targetModel));
        
        // Get animation clips from FBX
        const animations = fbxModel.animations;
        if (!animations || animations.length === 0) {
            throw new Error('No animations found in FBX file');
        }
        
        // Find the skeletons
        let sourceSkeleton = null;
        let targetSkeleton = null;
        
        fbxModel.traverse(node => {
            if (node.isMesh && node.skeleton) {
                sourceSkeleton = node;
                console.log('Found source skeleton:', node.name);
            }
        });
        
        targetModel.traverse(node => {
            if (node.isSkinnedMesh && node.skeleton) {
                targetSkeleton = node;
                console.log('Found target skeleton:', node.name, 'with bones:', node.skeleton.bones.length);
            }
        });
        
        if (!targetSkeleton) {
            throw new Error('No skeleton found in target model');
        }
        
        // Create animation mixer if not already created
        if (!this.mixer) {
            this.mixer = new THREE.AnimationMixer(targetModel);
            console.log('Created animation mixer for target model');
        }
        
        // Use the animation directly if possible
        const clip = animations[0].clone();
        
        // Rename tracks to match the target model's bone names if needed
        this.retargetAnimation(clip, targetModel);
        
        // Store the animation
        this.animations[animationName] = clip;
        console.log(`Animation "${animationName}" loaded with duration: ${clip.duration}s`);
        
        // Create and play the animation
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat);
        action.clampWhenFinished = false;
        action.play();
        
        console.log(`Playing animation: ${animationName}`);
        return clip;
    }
    
    retargetAnimation(clip, targetModel) {
        // Get all track names (bone names) in the animation
        const trackNames = clip.tracks.map(track => {
            // Extract bone name from the track name (e.g. "mixamorigRightArm.position" -> "mixamorigRightArm")
            return track.name.split('.')[0];
        });
        
        console.log('Animation tracks:', trackNames);
        
        // Create a map of fbx bone names to target bone names
        const boneMap = {};
        
        // Standard bone name mappings that often need to be fixed
        const commonMappings = {
            'mixamorigHips': 'Hips',
            'mixamorigSpine': 'Spine',
            'mixamorigSpine1': 'Spine1',
            'mixamorigSpine2': 'Spine2',
            'mixamorigNeck': 'Neck',
            'mixamorigHead': 'Head',
            'mixamorigLeftShoulder': 'LeftShoulder',
            'mixamorigLeftArm': 'LeftArm',
            'mixamorigLeftForeArm': 'LeftForeArm',
            'mixamorigLeftHand': 'LeftHand',
            'mixamorigRightShoulder': 'RightShoulder',
            'mixamorigRightArm': 'RightArm',
            'mixamorigRightForeArm': 'RightForeArm',
            'mixamorigRightHand': 'RightHand',
            'mixamorigLeftUpLeg': 'LeftUpLeg',
            'mixamorigLeftLeg': 'LeftLeg',
            'mixamorigLeftFoot': 'LeftFoot',
            'mixamorigRightUpLeg': 'RightUpLeg',
            'mixamorigRightLeg': 'RightLeg',
            'mixamorigRightFoot': 'RightFoot'
        };
        
        // Find all bones in the target model
        const targetBones = [];
        targetModel.traverse(node => {
            if (node.isBone) {
                targetBones.push(node.name);
            }
        });
        
        console.log('Target model bones:', targetBones);
        
        // Try to map track names to target bones
        for (const trackName of trackNames) {
            if (commonMappings[trackName]) {
                // Use common mapping
                boneMap[trackName] = commonMappings[trackName];
            } else if (targetBones.includes(trackName)) {
                // Direct match
                boneMap[trackName] = trackName;
            } else {
                // Try to find a match by removing common prefixes
                const simpleName = trackName.replace(/^mixamorig|^mixamo|^Character|^Armature|^Rig/i, '');
                
                // Find closest match
                let bestMatch = null;
                let bestScore = 0;
                
                for (const targetBone of targetBones) {
                    const targetSimpleName = targetBone.replace(/^mixamorig|^mixamo|^Character|^Armature|^Rig/i, '');
                    
                    // Calculate similarity score (simple implementation)
                    let score = 0;
                    if (targetSimpleName.toLowerCase() === simpleName.toLowerCase()) {
                        score = 100; // Exact match after prefix removal
                    } else if (targetSimpleName.toLowerCase().includes(simpleName.toLowerCase()) || 
                              simpleName.toLowerCase().includes(targetSimpleName.toLowerCase())) {
                        score = 50; // Partial match
                    }
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = targetBone;
                    }
                }
                
                // Use the best match if good enough
                if (bestScore >= 50) {
                    boneMap[trackName] = bestMatch;
                }
            }
        }
        
        console.log('Bone mapping:', boneMap);
        
        // Update track names in the clip
        const newTracks = [];
        for (const track of clip.tracks) {
            const trackSplit = track.name.split('.');
            const boneName = trackSplit[0];
            const propertyName = trackSplit[1];
            
            if (boneMap[boneName]) {
                // Create a new track with the mapped name
                const newTrack = track.clone();
                newTrack.name = `${boneMap[boneName]}.${propertyName}`;
                newTracks.push(newTrack);
                console.log(`Remapped track: ${track.name} -> ${newTrack.name}`);
            } else {
                // Keep the original track if no mapping is found
                newTracks.push(track);
            }
        }
        
        // Replace the tracks in the clip
        clip.tracks = newTracks;
        
        return clip;
    }

    // Helper function to get bone structure for debugging
    getBoneStructure(model) {
        const bones = [];
        model.traverse(node => {
            if (node.isBone) {
                bones.push({
                    name: node.name,
                    parent: node.parent ? node.parent.name : null,
                    children: node.children.map(child => child.name)
                });
            }
        });
        return bones;
    }

    setupModel(model) {
        model.traverse((node) => {
            if (node.isMesh) {
                // Log all available morph target influences and dictionary
                if (node.morphTargetDictionary) {
                    console.log('Found mesh with morph targets:', node.name);
                    console.log('Morph target dictionary:', node.morphTargetDictionary);
                    console.log('Number of morph targets:', node.morphTargetInfluences.length);
                }

                // Enable morph targets
                if (node.morphTargetDictionary && node.morphTargetInfluences) {
                    // Ensure all morph targets are initialized
                    const morphTargetCount = Object.keys(node.morphTargetDictionary).length;
                    if (node.morphTargetInfluences.length !== morphTargetCount) {
                        node.morphTargetInfluences = new Float32Array(morphTargetCount);
                    }
                    node.morphTargetInfluences.fill(0);
                }

                // Setup materials
                if (node.material) {
                    node.material.side = THREE.DoubleSide;
                    node.material.transparent = true;
                    node.material.needsUpdate = true;
                }
            }
        });

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        model.position.sub(center);
        const scale = 2 / Math.max(size.x, size.y, size.z);
        model.scale.multiplyScalar(scale);
    }

    // Find all meshes with morph targets
    findMorphTargetMesh(model) {
        let targetMesh = null;
        let maxMorphTargets = 0;

        model.traverse((node) => {
            if (node.isMesh && node.morphTargetDictionary) {
                const numMorphTargets = Object.keys(node.morphTargetDictionary).length;
                console.log(`Found mesh ${node.name} with ${numMorphTargets} morph targets`);
                
                // Select the mesh with the most morph targets
                if (numMorphTargets > maxMorphTargets) {
                    targetMesh = node;
                    maxMorphTargets = numMorphTargets;
                }
            }
        });

        if (targetMesh) {
            console.log('Selected mesh for animation:', targetMesh.name);
            console.log('Available morph targets:', Object.keys(targetMesh.morphTargetDictionary));
        }

        return targetMesh;
    }
    
    getMixer() {
        return this.mixer;
    }
    
    updateMixer(deltaTime) {
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
    }
} 