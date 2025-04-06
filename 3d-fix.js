// Fix for 3D visibility issues
document.addEventListener('DOMContentLoaded', () => {
    // Wait for the renderer to be created
    setTimeout(() => {
        // Find the canvas
        const canvas = document.querySelector('canvas');
        if (canvas) {
            // Force canvas to be visible
            canvas.style.display = 'block';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.zIndex = '1';
            console.log('Fixed canvas visibility');
            
            // Make sure the container is visible too
            const container = document.getElementById('canvas-container');
            if (container) {
                container.style.display = 'block';
                container.style.position = 'fixed';
                container.style.top = '0';
                container.style.left = '0';
                container.style.width = '100%';
                container.style.height = '100%';
                container.style.zIndex = '1';
                console.log('Fixed container visibility');
            }
        } else {
            console.error('Cannot find canvas element');
        }
    }, 1000); // Wait 1 second for renderer to initialize
}); 