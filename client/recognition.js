/**
 * recognition.js - WebSocket client for real-time recognition feed.
 *
 * Connects to the server's WebSocket endpoint, captures frames from
 * the webcam, sends them as base64 to the server, and receives
 * face detection/recognition results back.
 */

class FaceRecognition {
    constructor() {
        this.ws = null;
        this.stream = null;
        this.captureCanvas = document.createElement('canvas');
        this.captureCtx = this.captureCanvas.getContext('2d');
        this.isRunning = false;
        this.frameInterval = null;
        this.fps = 5; // WS_FRAME_RATE
        this.fpsCounter = { frames: 0, lastTime: Date.now(), current: 0 };
        this.onResults = null;
        this.onFpsUpdate = null;
        this.onDisconnect = null;
    }

    /**
     * Start the recognition feed.
     * @param {string} sessionId - The session ID for the WebSocket connection.
     * @param {HTMLVideoElement} videoElement - The video element to capture frames from.
     * @param {Object} callbacks - { onResults, onFpsUpdate, onDisconnect }
     */
    async start(sessionId, videoElement, callbacks = {}) {
        this.onResults = callbacks.onResults || null;
        this.onFpsUpdate = callbacks.onFpsUpdate || null;
        this.onDisconnect = callbacks.onDisconnect || null;

        // Start webcam and wait for it to be fully ready
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: false,
            });
            videoElement.srcObject = this.stream;

            // Wait for video metadata and first frame to load
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Video load timeout')), 10000);

                if (videoElement.readyState >= 2) {
                    clearTimeout(timeout);
                    resolve();
                    return;
                }

                videoElement.onloadeddata = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                videoElement.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Video load error'));
                };
            });

            await videoElement.play();

            // Extra wait to ensure first frames are rendered
            await new Promise(r => setTimeout(r, 500));

            console.log(`[Recognition] Webcam ready: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
        } catch (err) {
            console.error('[Recognition] Camera init failed:', err);
            if (this.onDisconnect) this.onDisconnect();
            return;
        }

        // Connect WebSocket only after camera is fully ready
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}/ws/recognize/${sessionId}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('[Recognition] WebSocket connected.');
            this.isRunning = true;
            this._startFrameCapture(videoElement);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.error) {
                    console.error('[Recognition] Server error:', data.error);
                    return;
                }

                // Update FPS counter
                this.fpsCounter.frames++;
                const now = Date.now();
                if (now - this.fpsCounter.lastTime >= 1000) {
                    this.fpsCounter.current = this.fpsCounter.frames;
                    this.fpsCounter.frames = 0;
                    this.fpsCounter.lastTime = now;
                    if (this.onFpsUpdate) this.onFpsUpdate(this.fpsCounter.current);
                }

                if (this.onResults && data.faces) {
                    this.onResults(data.faces);
                }
            } catch (err) {
                console.error('[Recognition] Failed to parse message:', err);
            }
        };

        this.ws.onclose = () => {
            console.log('[Recognition] WebSocket closed.');
            this.isRunning = false;
            this._stopFrameCapture();
            if (this.onDisconnect) this.onDisconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[Recognition] WebSocket error:', err);
        };
    }

    /**
     * Start capturing and sending frames at the configured FPS.
     * @param {HTMLVideoElement} videoElement
     */
    _startFrameCapture(videoElement) {
        const interval = 1000 / this.fps;
        let pendingSend = false; // Prevent frame overlap

        this.frameInterval = setInterval(() => {
            if (!this.isRunning || this.ws.readyState !== WebSocket.OPEN || pendingSend) return;

            // Verify video has valid dimensions
            const vw = videoElement.videoWidth;
            const vh = videoElement.videoHeight;
            if (!vw || !vh) return;

            // Size the capture canvas to the video
            this.captureCanvas.width = vw;
            this.captureCanvas.height = vh;

            // Draw current frame
            this.captureCtx.drawImage(videoElement, 0, 0, vw, vh);

            // Convert to base64 JPEG and send
            pendingSend = true;
            this.captureCanvas.toBlob((blob) => {
                pendingSend = false;
                if (blob && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            const base64 = reader.result.split(',')[1];
                            this.ws.send(base64);
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }, 'image/jpeg', 0.7);
        }, interval);
    }

    /**
     * Stop frame capture.
     */
    _stopFrameCapture() {
        if (this.frameInterval) {
            clearInterval(this.frameInterval);
            this.frameInterval = null;
        }
    }

    /**
     * Stop the recognition feed entirely.
     */
    stop() {
        this.isRunning = false;
        this._stopFrameCapture();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}

// Export globally
window.FaceRecognition = FaceRecognition;
