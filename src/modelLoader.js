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
            console.log('Loading model from URL:', url);
            
            this.loader.load(
                url,
                (gltf) => {
                    const model = gltf.scene;
                    
                    // Basic setup to preserve original model appearance
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
                    const percent = Math.round(progress.loaded / progress.total * 100);
                    console.log('Loading model:', percent + '%');
                },
                (error) => {
                    console.error('Error loading model:', error);
                    reject(error);
                }
            );
        });
    }
    
    // Basic material setup without modifications
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
                    node.material.side = THREE.FrontSide;
                    
                    // Only enable transparency if needed
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