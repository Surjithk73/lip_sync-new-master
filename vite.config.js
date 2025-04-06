import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
// import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
    plugins: [
        react(),
        // basicSsl(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,txt,woff2}'],
                maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB
            },
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            manifest: {
                name: 'Therapist Chatbot',
                short_name: 'TherapistBot',
                description: 'AI Therapist Chatbot with Facial Animations',
                theme_color: '#ffffff',
                icons: [
                    {
                        src: 'vite.svg',
                        sizes: '192x192',
                        type: 'image/svg+xml'
                    }
                ]
            }
        })
    ],
    root: './',
    base: './',
    publicDir: 'public',
    server: {
        port: 3000,
        open: true,
        cors: true,
        host: true,
        fs: {
            strict: false,
            allow: ['..']
        },
        strictPort: false,
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Feature-Policy': 'xr-spatial-tracking *'
        },
        https: {
            key: fs.readFileSync('server.key'),
            cert: fs.readFileSync('server.crt')
        }
    },
    preview: {
        https: {
            key: fs.readFileSync('server.key'),
            cert: fs.readFileSync('server.crt')
        },
        port: 3000,
        host: true,
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Feature-Policy': 'xr-spatial-tracking *'
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true,
        chunkSizeWarningLimit: 2200, // Increased from default 500 to handle larger bundles
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html')
            },
            output: {
                manualChunks: (id) => {
                    // Create specific chunks for large dependencies
                    if (id.includes('node_modules/three')) {
                        return 'three';
                    }
                    if (id.includes('node_modules/tone')) {
                        return 'tone';
                    }
                    if (id.includes('node_modules/@google')) {
                        return 'google-ai';
                    }
                    if (id.includes('node_modules/react') || 
                        id.includes('node_modules/react-dom')) {
                        return 'vendor-react';
                    }
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                }
            }
        }
    },
    optimizeDeps: {
        include: [
            'three',
            'three/examples/jsm/loaders/GLTFLoader',
            'three/examples/jsm/controls/OrbitControls',
            'tone'
        ]
    },
    resolve: {
        alias: {
            'three': path.resolve(__dirname, 'node_modules/three'),
            '@': path.resolve(__dirname, 'src')
        },
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json']
    }
}); 