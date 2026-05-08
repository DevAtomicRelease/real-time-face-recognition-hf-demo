/**
 * recorder.js - MediaRecorder wrapper for video capture.
 *
 * Handles browser webcam access via getUserMedia, records 5-10 second
 * video blobs using the MediaRecorder API, and provides start/stop controls.
 */

class FaceRecorder {
    constructor() {
        this.stream = null;
        this.mediaRecorder = null;
        this.chunks = [];
        this.isRecording = false;
        this.timerInterval = null;
        this.startTime = 0;
        this.maxDuration = 10000; // 10 seconds max
        this.minDuration = 5000;  // 5 seconds min
    }

    /**
     * Initialize webcam stream and attach to video element.
     * @param {HTMLVideoElement} videoElement
     */
    async initCamera(videoElement) {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: false,
            });
            videoElement.srcObject = this.stream;
            await videoElement.play();
            return true;
        } catch (err) {
            console.error('[Recorder] Camera access denied:', err);
            return false;
        }
    }

    /**
     * Start recording video from the webcam stream.
     * @param {Function} onTimerUpdate - Callback with formatted time string.
     * @returns {Promise} Resolves when recording starts.
     */
    startRecording(onTimerUpdate) {
        if (!this.stream) throw new Error('Camera not initialized');
        if (this.isRecording) return;

        this.chunks = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.chunks.push(e.data);
        };

        this.mediaRecorder.start(100); // Collect data every 100ms
        this.isRecording = true;
        this.startTime = Date.now();

        // Timer update
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const secs = Math.floor(elapsed / 1000);
            const mins = Math.floor(secs / 60);
            const display = `${mins}:${String(secs % 60).padStart(2, '0')}`;
            if (onTimerUpdate) onTimerUpdate(display);

            // Auto-stop at max duration
            if (elapsed >= this.maxDuration) {
                this.stopRecording();
            }
        }, 100);
    }

    /**
     * Stop recording and return the video blob.
     * @returns {Promise<Blob>} The recorded video blob.
     */
    stopRecording() {
        return new Promise((resolve) => {
            if (!this.isRecording || !this.mediaRecorder) {
                resolve(null);
                return;
            }

            clearInterval(this.timerInterval);

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                this.isRecording = false;
                this.chunks = [];
                resolve(blob);
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * Check if recording duration meets minimum requirement.
     */
    hasMinDuration() {
        if (!this.isRecording) return false;
        return (Date.now() - this.startTime) >= this.minDuration;
    }

    /**
     * Stop the camera stream entirely.
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    /**
     * Get the current stream for reuse.
     */
    getStream() {
        return this.stream;
    }
}

// Export globally
window.FaceRecorder = FaceRecorder;
