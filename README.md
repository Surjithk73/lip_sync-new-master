# Facial Animation System

A sophisticated facial animation system that synchronizes with audio and video input to create realistic facial expressions and movements. The system uses morph targets to control various facial features and responds to both audio input and emotional states.

## Features

- Real-time facial animation with audio synchronization
- Natural eye movements and blinking
- Multiple emotional expressions (happiness, surprise, thoughtful)
- Audio-driven viseme generation for lip sync
- Smooth transitions between expressions
- Interactive controls for emotion adjustment

## Prerequisites

- Node.js (v14 or higher)
- Modern web browser with WebGL support
- Webcam and microphone access

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

1. Click the "Start Animation" button to begin
2. Grant permission for camera and microphone access when prompted
3. Use the emotion sliders to adjust the facial expressions:
   - Happiness: Controls smile and cheek movements
   - Surprise: Controls eye widening and eyebrow raising
   - Thoughtful: Controls subtle eye and eyebrow movements

## VR Mode

The application supports WebXR for viewing the 3D world in virtual reality:

1. On mobile devices, access the application using HTTPS (run `npm run dev` and use the provided HTTPS URL)
2. Click the "ENTER VR MODE" button at the bottom of the screen
3. For mobile VR:
   - Use with a compatible VR headset (Google Cardboard, Samsung Gear VR, etc.)
   - Insert your phone into the headset after entering VR mode
   - Look around to navigate the 3D environment
   - Exit VR mode by tapping the screen (takes you back to normal viewing mode)
4. For desktop VR:
   - Requires a compatible WebXR headset (Oculus Quest, HTC Vive, etc.)
   - Connect your VR headset to your computer
   - Put on your headset after clicking the VR button
   
Note: VR mode requires:
- A browser that supports WebXR (Chrome on Android, Safari on iOS 13+)
- HTTPS connection (automatically configured in development mode)
- A WebXR-compatible device

## Technical Details

The system uses the following technologies:
- Three.js for 3D rendering
- Web Audio API for audio analysis
- Tone.js for advanced audio processing
- MediaStream API for camera/microphone access

## Supported Morph Targets

The system supports a wide range of morph targets for facial expressions, including:
- Eye movements (look directions, blinking, squinting)
- Eyebrow controls
- Mouth shapes and expressions
- Cheek and nose movements
- Jaw controls
- Visemes for speech

## License

MIT License 