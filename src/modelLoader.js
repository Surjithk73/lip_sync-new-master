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
                    
                    // Minimal setup to preserve original model appearance
                    this.setupModelMaterials(model);
                    this.model = model;
                    
                    // Handle animations from the original GLB file
                    if (gltf.animations && gltf.animations.length > 0) {
                        console.log(`Model contains ${gltf.animations.length} animations`);
                        
                        // Create animation mixer if not already created
                        if (!this.mixer) {
                            this.mixer = new THREE.AnimationMixer(model);
                            console.log('Created animation mixer for model');
                        }
                        
                        // Store and play the original animations
                        gltf.animations.forEach((clip, index) => {
                            const name = clip.name || `animation_${index}`;
                            this.animations[name] = clip;
                            console.log(`Model animation "${name}" found with duration: ${clip.duration}s`);
                            
                            // Configure the animation for smooth looping
                            const action = this.mixer.clipAction(clip);
                            
                            // Settings for natural animation
                            action.setLoop(THREE.LoopRepeat);
                            action.clampWhenFinished = false;
                            
                            // For Avaturn animations, ensure they play properly
                            if (name === 'avaturn_animation') {
                                // Make sure we don't crossfade with other animations
                                action.weight = 1;
                                
                                // Reset animation time to start
                                action.time = 0;
                                
                                // Ensure smooth looping for the animation
                                action.timeScale = 1.0;
                                
                                // Slightly longer blend time for smoother transitions
                                action.fadeIn(0.3);
                            }
                            
                            // Play the animation
                            action.play();
                            console.log(`Playing model animation: ${name}`);
                        });
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
    
    // Only set up materials without modifying the model
    setupModelMaterials(model) {
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

                // Setup materials with minimal modifications to preserve look
                if (node.material) {
                    // Only set properties that are necessary for proper rendering
                    node.material.side = THREE.FrontSide; // Changed from DoubleSide to preserve original material
                    
                    // Only enable transparency if the material actually has transparent textures
                    // Forcing transparency can cause rendering issues
                    if (node.material.map && node.material.map.image) {
                        const hasTransparency = node.material.map.image.data && 
                            node.material.map.image.data.some(value => value === 0);
                        node.material.transparent = hasTransparency;
                    }
                    
                    // Ensure material is updated
                    node.material.needsUpdate = true;
                }
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
    
    // We don't want any default animation, but we need this for backward compatibility
    createDefaultIdleAnimation(model) {
        console.log('Skipping default idle animation creation to preserve original model appearance');
        return null;
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

        // Removed centering and scaling to preserve original model proportions
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