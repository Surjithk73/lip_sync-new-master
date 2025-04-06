/**
 * VR Initializer - Minimalist WebXR implementation for mobile compatibility
 */
import * as THREE from 'three';

// Check if WebXR is available in the browser
export function checkVRSupport() {
    // Basic check for navigator.xr
    const hasWebXR = 'xr' in navigator;
    
    // Detect mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    console.log('VR Support Check:', {
        hasWebXR,
        isMobile
    });
    
    return {
        hasWebXR,
        isMobile
    };
}

// Set up basic VR viewport settings
export function setupVRViewport() {
    // Ensure proper meta viewport tag for VR
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    
    if (!viewportMeta) {
        viewportMeta = document.createElement('meta');
        viewportMeta.name = 'viewport';
        document.head.appendChild(viewportMeta);
    }
    
    // Set VR-friendly viewport parameters
    viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    
    // Ensure proper feature policy for WebXR
    let featurePolicyMeta = document.querySelector('meta[http-equiv="Feature-Policy"]');
    if (!featurePolicyMeta) {
        featurePolicyMeta = document.createElement('meta');
        featurePolicyMeta.setAttribute('http-equiv', 'Feature-Policy');
        document.head.appendChild(featurePolicyMeta);
    }
    featurePolicyMeta.content = 'xr-spatial-tracking *';
}

// Create VR button with simple styling
export function createVRButton(renderer) {
    if (!renderer) {
        console.error('Renderer is required to create VR button');
        return null;
    }

    // Check if WebXR is supported
    if (!navigator.xr) {
        console.warn('WebXR not supported in this browser');
        return null;
    }
    
    // Create button element with high z-index
    const button = document.createElement('button');
    button.id = 'vr-button';
    button.style.display = 'none'; // Hide initially until we check support
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.left = '50%';
    button.style.transform = 'translateX(-50%)';
    button.style.padding = '16px 40px';
    button.style.border = '2px solid white';
    button.style.borderRadius = '6px';
    button.style.background = 'rgba(0, 0, 0, 0.75)';
    button.style.color = 'white';
    button.style.font = 'bold 16px sans-serif';
    button.style.textAlign = 'center';
    button.style.cursor = 'pointer';
    button.style.zIndex = '999999';
    button.style.outline = 'none';
    
    // Mobile-specific styling
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        button.style.width = '80%';
        button.style.maxWidth = '300px';
        button.style.padding = '20px 10px';
        button.style.fontSize = '18px';
        button.style.bottom = '30px';
    }
    
    button.textContent = 'ENTER VR';
    
    // Check if immersive-vr is supported and show button if it is
    navigator.xr.isSessionSupported('immersive-vr')
        .then((supported) => {
            if (supported) {
                button.style.display = 'block';
                console.log('VR supported - showing button');
            } else {
                button.style.display = 'none';
                console.warn('Immersive VR not supported on this device/browser');
            }
        })
        .catch(err => {
            console.error('Error checking VR support:', err);
            button.style.display = 'none';
        });
    
    // Set up button click listener with minimal code
    button.addEventListener('click', function() {
        if (!renderer) {
            console.error('Renderer not available');
            return;
        }
        
        if (renderer.xr.isPresenting) {
            renderer.xr.getSession().end();
            return;
        }
        
        navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: [] // Keep to minimum for compatibility
        })
        .then(onSessionStarted)
        .catch(err => {
            console.error('Error starting VR session:', err);
            alert('Failed to enter VR. Please make sure your device supports WebXR and permissions are granted.');
        });
        
        function onSessionStarted(session) {
            button.textContent = 'EXIT VR';
            
            session.addEventListener('end', () => {
                button.textContent = 'ENTER VR';
                button.style.background = 'rgba(0, 0, 0, 0.75)';
            });
            
            // Configure renderer for VR with proper eye level height
            renderer.xr.enabled = true;
            
            // Use 'local' reference space for consistent positioning
            console.log('Using local reference space for VR with proper eye level');
            renderer.xr.setReferenceSpaceType('local');
            
            // Add event listener for sessionstart to dispatch alignment event
            renderer.xr.addEventListener('sessionstart', () => {
                console.log('XR session started - ensuring face-to-face alignment at eye level');
                
                // Dispatch custom event for main.js to handle model positioning
                const event = new CustomEvent('vrsessionstart', {
                    detail: {
                        timestamp: Date.now(),
                        eyeLevel: true
                    }
                });
                document.dispatchEvent(event);
            });
            
            // Simple direct session setup
            renderer.xr.setSession(session);
            
            // Dispatch a custom event to notify the app about VR session start
            const vrSessionStartEvent = new CustomEvent('vrsessionstart', {
                detail: {
                    session: session,
                    timestamp: Date.now()
                }
            });
            document.dispatchEvent(vrSessionStartEvent);
            
            // Handle VR button visibility in session
            button.style.zIndex = '999999';
            
            // Log that VR session has started
            console.log('VR session started in conversational mode with proper eye height');
        }
    });
    
    // Add button to document body for maximum visibility
    document.body.appendChild(button);
    
    return button;
}

// Ensure visibility of VR button on mobile
export function ensureVRButtonVisibility() {
    // Give the button some time to be created
    setTimeout(() => {
        const vrButton = document.getElementById('vr-button');
        if (!vrButton) {
            console.warn('VR button not found');
            return;
        }
        
        // Mobile devices need additional styling and z-index
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Ensure highest z-index
        vrButton.style.zIndex = '999999';
        
        // Ensure button is attached directly to body
        if (vrButton.parentElement !== document.body) {
            document.body.appendChild(vrButton);
        }
        
        // Set special positioning for mobile
        if (isMobile) {
            vrButton.style.position = 'fixed';
            vrButton.style.width = '80%';
            vrButton.style.maxWidth = '300px';
            vrButton.style.bottom = '30px';
            vrButton.style.left = '50%';
            vrButton.style.transform = 'translateX(-50%)';
            vrButton.style.fontSize = '18px';
            vrButton.style.padding = '20px 10px';
        }
        
        // Make button clearly visible
        vrButton.style.display = 'block';
        
        console.log('VR button visibility ensured');
    }, 2000); // Wait longer to ensure all other elements are loaded
}

// Initialize VR detection on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Running VR detection and initialization');
    checkVRSupport();
    setupVRViewport();
    ensureVRButtonVisibility();
}); 