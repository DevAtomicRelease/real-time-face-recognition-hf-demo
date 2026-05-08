/**
 * app.js - Core UI logic and panel switching.
 *
 * Orchestrates the registration and recognition flow:
 * session initialization, tab switching, recording/upload handling,
 * panel transitions, and cleanup on page unload.
 */

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────────
    let sessionId = null;
    const recorder = new FaceRecorder();
    const uploader = new FaceUploader();
    let recognition = null;
    let faceCanvas = null;

    // ── DOM Elements ───────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    const els = {
        statusDot: $('statusDot'),
        sessionStatus: $('sessionStatus'),
        step1: $('step1'),
        step2: $('step2'),
        stepLine1: $('stepLine1'),
        registrationPanel: $('registrationPanel'),
        recognitionPanel: $('recognitionPanel'),
        nameInput: $('nameInput'),
        tabRecord: $('tabRecord'),
        tabUpload: $('tabUpload'),
        recordContent: $('recordContent'),
        uploadContent: $('uploadContent'),
        recordVideo: $('recordVideo'),
        recordOverlay: $('recordOverlay'),
        recordingIndicator: $('recordingIndicator'),
        recordTimer: $('recordTimer'),
        btnRecord: $('btnRecord'),
        uploadZone: $('uploadZone'),
        fileInput: $('fileInput'),
        previewGallery: $('previewGallery'),
        btnUpload: $('btnUpload'),
        processingState: $('processingState'),
        processingText: $('processingText'),
        resultState: $('resultState'),
        resultIcon: $('resultIcon'),
        resultText: $('resultText'),
        resultDetail: $('resultDetail'),
        btnStartRecognition: $('btnStartRecognition'),
        recognitionVideo: $('recognitionVideo'),
        recognitionCanvas: $('recognitionCanvas'),
        fpsCounter: $('fpsCounter'),
        detectionLog: $('detectionLog'),
        registeredCount: $('registeredCount'),
        btnStopRecognition: $('btnStopRecognition'),
    };

    // ── Session Init ───────────────────────────────────────────
    async function initSession() {
        try {
            const res = await fetch('/api/session/start', { method: 'POST' });
            const data = await res.json();
            sessionId = data.session_id;
            els.statusDot.classList.add('active');
            els.sessionStatus.textContent = 'Session Active';
            console.log('[App] Session started:', sessionId);
        } catch (err) {
            els.statusDot.classList.add('error');
            els.sessionStatus.textContent = 'Connection Error';
            console.error('[App] Failed to start session:', err);
        }
    }

    // ── Tab Switching ──────────────────────────────────────────
    function switchTab(tab) {
        els.tabRecord.classList.toggle('active', tab === 'record');
        els.tabUpload.classList.toggle('active', tab === 'upload');
        els.recordContent.classList.toggle('active', tab === 'record');
        els.uploadContent.classList.toggle('active', tab === 'upload');

        if (tab === 'record') {
            recorder.initCamera(els.recordVideo);
        }
    }

    els.tabRecord.addEventListener('click', () => switchTab('record'));
    els.tabUpload.addEventListener('click', () => switchTab('upload'));

    // ── Recording ──────────────────────────────────────────────
    els.btnRecord.addEventListener('click', async () => {
        const name = els.nameInput.value.trim();
        if (!name) {
            els.nameInput.focus();
            els.nameInput.style.borderColor = '#ef4444';
            setTimeout(() => els.nameInput.style.borderColor = '', 2000);
            return;
        }

        if (!recorder.isRecording) {
            // Start recording
            await recorder.initCamera(els.recordVideo);
            recorder.startRecording((time) => {
                els.recordTimer.textContent = time;
            });
            els.btnRecord.innerHTML = '<div class="btn-record-inner" style="border-radius:3px;width:14px;height:14px;background:var(--danger)"></div>Stop Recording';
            els.btnRecord.classList.add('recording');
            els.recordOverlay.classList.add('active');
            els.recordingIndicator.classList.add('active');
        } else {
            // Stop recording
            const blob = await recorder.stopRecording();
            els.btnRecord.innerHTML = '<div class="btn-record-inner"></div>Start Recording';
            els.btnRecord.classList.remove('recording');
            els.recordOverlay.classList.remove('active');
            els.recordingIndicator.classList.remove('active');
            els.recordTimer.textContent = '0:00';

            if (blob && blob.size > 0) {
                await registerViaVideo(blob, name);
            }
        }
    });

    // ── Upload ─────────────────────────────────────────────────
    uploader.init(els.uploadZone, els.fileInput, els.previewGallery, (files) => {
        els.btnUpload.disabled = !uploader.isReady();
    });

    els.btnUpload.addEventListener('click', async () => {
        const name = els.nameInput.value.trim();
        if (!name) {
            els.nameInput.focus();
            els.nameInput.style.borderColor = '#ef4444';
            setTimeout(() => els.nameInput.style.borderColor = '', 2000);
            return;
        }

        if (uploader.isReady()) {
            await registerViaUpload(uploader.getFiles(), name);
        }
    });

    // ── Registration API Calls ─────────────────────────────────
    function showProcessing(text) {
        els.processingState.classList.add('active');
        els.processingText.textContent = text || 'Processing faces...';
        els.recordContent.style.display = 'none';
        els.uploadContent.style.display = 'none';
    }

    function showResult(success, text, detail) {
        els.processingState.classList.remove('active');
        els.resultState.classList.add('active');
        els.resultIcon.className = `result-icon ${success ? 'success' : 'error'}`;
        els.resultIcon.innerHTML = success
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        els.resultText.textContent = text;
        els.resultDetail.textContent = detail || '';
        els.btnStartRecognition.style.display = success ? '' : 'none';
    }

    async function registerViaVideo(blob, name) {
        showProcessing('Extracting frames & generating embeddings...');

        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('name', name);
        formData.append('video', blob, 'recording.webm');

        try {
            const res = await fetch('/api/register/video', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.status === 'ready') {
                showResult(true, 'Registration Successful!',
                    `${data.faces_detected} faces detected, ${data.embeddings_count} embedding(s) stored.`);
                els.registeredCount.textContent = data.embeddings_count;
            } else {
                showResult(false, 'Registration Failed', data.message || 'No faces detected.');
            }
        } catch (err) {
            showResult(false, 'Registration Error', err.message);
        }
    }

    async function registerViaUpload(files, name) {
        showProcessing('Processing uploaded images...');

        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('name', name);
        files.forEach(f => formData.append('images', f));

        try {
            const res = await fetch('/api/register/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.status === 'ready') {
                showResult(true, 'Registration Successful!',
                    `${data.faces_detected} faces detected, ${data.embeddings_count} embedding(s) stored.`);
                els.registeredCount.textContent = data.embeddings_count;
            } else {
                showResult(false, 'Registration Failed', data.message || 'No faces detected.');
            }
        } catch (err) {
            showResult(false, 'Registration Error', err.message);
        }
    }

    // ── Panel Switching ────────────────────────────────────────
    els.btnStartRecognition.addEventListener('click', () => {
        recorder.stopCamera();

        els.registrationPanel.classList.add('hidden');
        els.recognitionPanel.classList.remove('hidden');
        els.step1.classList.remove('active');
        els.step1.classList.add('completed');
        els.stepLine1.classList.add('active');
        els.step2.classList.add('active');

        startRecognition();
    });

    els.btnStopRecognition.addEventListener('click', () => {
        stopRecognition();
        els.recognitionPanel.classList.add('hidden');
        els.registrationPanel.classList.remove('hidden');
        els.step2.classList.remove('active');
        els.stepLine1.classList.remove('active');
        els.step1.classList.remove('completed');
        els.step1.classList.add('active');

        // Reset registration state for another round
        els.resultState.classList.remove('active');
        els.recordContent.style.display = '';
        els.uploadContent.style.display = '';
        switchTab('record');
    });

    // ── Recognition ────────────────────────────────────────────
    function startRecognition() {
        recognition = new FaceRecognition();
        faceCanvas = new FaceCanvas(els.recognitionCanvas, els.recognitionVideo);

        recognition.start(sessionId, els.recognitionVideo, {
            onResults: (faces) => {
                faceCanvas.drawResults(faces);
                updateDetectionLog(faces);
            },
            onFpsUpdate: (fps) => {
                els.fpsCounter.textContent = `${fps} FPS`;
            },
            onDisconnect: () => {
                els.fpsCounter.textContent = 'Disconnected';
            },
        });
    }

    function stopRecognition() {
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        if (faceCanvas) {
            faceCanvas.clear();
            faceCanvas = null;
        }
        els.detectionLog.innerHTML = '<p class="log-placeholder">Waiting for faces...</p>';
    }

    function updateDetectionLog(faces) {
        if (!faces || faces.length === 0) return;

        // Clear placeholder
        const placeholder = els.detectionLog.querySelector('.log-placeholder');
        if (placeholder) placeholder.remove();

        for (const face of faces) {
            const entry = document.createElement('div');
            entry.className = 'log-entry';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.textContent = face.label;

            const confSpan = document.createElement('span');
            confSpan.className = face.label !== 'Unknown' ? 'confidence' : 'unknown';
            confSpan.textContent = `${(face.confidence * 100).toFixed(1)}%`;

            entry.appendChild(nameSpan);
            entry.appendChild(confSpan);

            els.detectionLog.insertBefore(entry, els.detectionLog.firstChild);

            // Keep log manageable
            while (els.detectionLog.children.length > 50) {
                els.detectionLog.removeChild(els.detectionLog.lastChild);
            }
        }
    }

    // ── Cleanup on Unload ──────────────────────────────────────
    window.addEventListener('beforeunload', () => {
        if (sessionId) {
            const formData = new FormData();
            formData.append('session_id', sessionId);
            navigator.sendBeacon('/api/session/end', formData);
        }
    });

    // ── Init ───────────────────────────────────────────────────
    initSession();
    recorder.initCamera(els.recordVideo);

})();
