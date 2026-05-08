/**
 * canvas.js - Draws bounding boxes + labels on video frames.
 *
 * Renders face detection results (bounding boxes, name labels,
 * confidence percentages) as an overlay on the recognition video feed.
 */

class FaceCanvas {
    constructor(canvasElement, videoElement) {
        this.canvas = canvasElement;
        this.video = videoElement;
        this.ctx = canvasElement.getContext('2d');
    }

    /**
     * Sync canvas dimensions with the video element.
     */
    resize() {
        this.canvas.width = this.video.videoWidth || this.video.clientWidth;
        this.canvas.height = this.video.videoHeight || this.video.clientHeight;
    }

    /**
     * Clear the canvas.
     */
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Draw face detection results on the canvas.
     * @param {Array} faces - Array of face result objects with box, label, confidence.
     */
    drawResults(faces) {
        this.resize();
        this.clear();

        if (!faces || faces.length === 0) return;

        // Calculate scale factors (video may be displayed at different size)
        const scaleX = this.canvas.width / (this.video.videoWidth || 1);
        const scaleY = this.canvas.height / (this.video.videoHeight || 1);

        for (const face of faces) {
            const [x1, y1, x2, y2] = face.box;
            const label = face.label;
            const confidence = face.confidence;
            const isRecognized = label !== 'Unknown';

            // Mirror the x coordinates (video is mirrored with scaleX(-1))
            const mirroredX1 = this.canvas.width - (x2 * scaleX);
            const mirroredX2 = this.canvas.width - (x1 * scaleX);
            const scaledY1 = y1 * scaleY;
            const scaledY2 = y2 * scaleY;

            const boxWidth = mirroredX2 - mirroredX1;
            const boxHeight = scaledY2 - scaledY1;

            // Colors
            const boxColor = isRecognized ? '#22c55e' : '#ef4444';
            const bgColor = isRecognized ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';

            // Draw bounding box
            this.ctx.strokeStyle = boxColor;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(mirroredX1, scaledY1, boxWidth, boxHeight);

            // Subtle fill
            this.ctx.fillStyle = bgColor;
            this.ctx.fillRect(mirroredX1, scaledY1, boxWidth, boxHeight);

            // Corner accents
            const cornerLen = Math.min(20, boxWidth * 0.25, boxHeight * 0.25);
            this.ctx.strokeStyle = boxColor;
            this.ctx.lineWidth = 3;

            // Top-left
            this.ctx.beginPath();
            this.ctx.moveTo(mirroredX1, scaledY1 + cornerLen);
            this.ctx.lineTo(mirroredX1, scaledY1);
            this.ctx.lineTo(mirroredX1 + cornerLen, scaledY1);
            this.ctx.stroke();

            // Top-right
            this.ctx.beginPath();
            this.ctx.moveTo(mirroredX2 - cornerLen, scaledY1);
            this.ctx.lineTo(mirroredX2, scaledY1);
            this.ctx.lineTo(mirroredX2, scaledY1 + cornerLen);
            this.ctx.stroke();

            // Bottom-left
            this.ctx.beginPath();
            this.ctx.moveTo(mirroredX1, scaledY2 - cornerLen);
            this.ctx.lineTo(mirroredX1, scaledY2);
            this.ctx.lineTo(mirroredX1 + cornerLen, scaledY2);
            this.ctx.stroke();

            // Bottom-right
            this.ctx.beginPath();
            this.ctx.moveTo(mirroredX2 - cornerLen, scaledY2);
            this.ctx.lineTo(mirroredX2, scaledY2);
            this.ctx.lineTo(mirroredX2, scaledY2 - cornerLen);
            this.ctx.stroke();

            // Label background
            const labelText = isRecognized
                ? `${label} ${(confidence * 100).toFixed(1)}%`
                : `Unknown ${(confidence * 100).toFixed(1)}%`;

            this.ctx.font = '600 13px Inter, sans-serif';
            const textMetrics = this.ctx.measureText(labelText);
            const labelPad = 8;
            const labelHeight = 24;
            const labelWidth = textMetrics.width + labelPad * 2;

            this.ctx.fillStyle = 'rgba(0,0,0,0.75)';
            this.ctx.beginPath();
            this.ctx.roundRect(mirroredX1, scaledY1 - labelHeight - 4, labelWidth, labelHeight, 6);
            this.ctx.fill();

            // Label text
            this.ctx.fillStyle = boxColor;
            this.ctx.fillText(labelText, mirroredX1 + labelPad, scaledY1 - 10);
        }
    }
}

// Export globally
window.FaceCanvas = FaceCanvas;
