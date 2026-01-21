/**
 * 4ourmedia Audio Visualizer App Logic
 * Manages UI interactions, recording state, and overlays.
 */

// --- Constants & Global State ---
const STORAGE_KEY = 'audioVisualizerSettings';
let appState = 'idle'; // idle, recording, paused
let clipCounter = 0;
let mediaRecorder;
let recordedChunks = [];
let startTime = null;

// Overlay State
let overlayImages = Array(5).fill(null);
let overlaySettings = Array(5).fill(null).map((_, i) => ({
    x: 100 + (i * 50),
    y: 100 + (i * 50),
    size: 50,
    opacity: 80,
    isDragging: false,
    dragOffset: { x: 0, y: 0 }
}));
let activeOverlay = null;

let textOverlays = [
    { content: '', x: 100, y: 100, size: 32, color: '#ffffff', font: 'Inter', style: 'normal', shadow: true, isDragging: false, dragOffset: { x: 0, y: 0 } },
    { content: '', x: 100, y: 150, size: 24, color: '#cccccc', font: 'Inter', style: 'normal', shadow: true, isDragging: false, dragOffset: { x: 0, y: 0 } }
];
let activeTextOverlay = null;

// Initialize Visualizer
const visualizer = new AudioVisualizer('visualizerCanvas', 'audioPlayer');

// --- DOM Elements ---
const elements = {
    imageUpload: document.getElementById('imageUpload'),
    audioUpload: document.getElementById('audioUpload'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    downloadContainer: document.getElementById('downloadContainer'),
    statusMessage: document.getElementById('statusMessage'),
    recordingTime: document.getElementById('recordingTime'),
    progressBar: document.getElementById('progressBar'),
    progressContainer: document.getElementById('progressContainer'),
    progressText: document.getElementById('progressText'),
    // Settings inputs
    barStyle: document.getElementById('barStyle'),
    sensitivity: document.getElementById('sensitivity'),
    colorTheme: document.getElementById('colorTheme'),
    animationSpeed: document.getElementById('animationSpeed'),
    visualizerPosition: document.getElementById('visualizerPosition'),
    barCount: document.getElementById('barCount'),
    mirrorMode: document.getElementById('mirrorMode'),
    glowIntensity: document.getElementById('glowIntensity'),
    videoQuality: document.getElementById('videoQuality'),
    frameRate: document.getElementById('frameRate'),
    exportFormat: document.getElementById('exportFormat')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Re-bind elements if they were null (in case script ran before DOM - though defer/bottom script handles this)
    refreshElementRefs();
    loadSettings();
    visualizer.init();

    // Hook up the overlay drawing callback
    visualizer.onDraw = (ctx) => drawOverlays(ctx);
    visualizer.drawInitialState();

    checkRecordingSupport();
    setupEventListeners();
});

function refreshElementRefs() {
    // Helper to get all IDs if not already captured
    for (const key of Object.keys(elements)) {
        if (!elements[key]) elements[key] = document.getElementById(key);
    }
}

// --- Settings Management ---
function saveSettings() {
    const settings = {
        barStyle: visualizer.settings.barStyle,
        sensitivity: visualizer.settings.sensitivity,
        colorTheme: visualizer.settings.colorTheme,
        animationSpeed: visualizer.settings.animationSpeed,
        position: visualizer.settings.position,
        barCount: visualizer.settings.barCount,
        mirrorMode: visualizer.settings.mirrorMode,
        glowIntensity: visualizer.settings.glowIntensity,
        videoQuality: elements.videoQuality.value,
        frameRate: elements.frameRate.value,
        exportFormat: elements.exportFormat.value,
        overlaySettings: overlaySettings,
        textOverlays: textOverlays
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('LocalStorage save failed', e);
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const s = JSON.parse(saved);

            // Apply to visualizer
            visualizer.updateSettings({
                barStyle: s.barStyle,
                sensitivity: s.sensitivity,
                colorTheme: s.colorTheme,
                animationSpeed: s.animationSpeed,
                position: s.position,
                barCount: s.barCount,
                mirrorMode: s.mirrorMode,
                glowIntensity: s.glowIntensity,
                frameRate: s.frameRate
            });

            // Update DOM inputs
            if (s.barStyle) elements.barStyle.value = s.barStyle;
            if (s.sensitivity) elements.sensitivity.value = s.sensitivity;
            if (s.colorTheme) elements.colorTheme.value = s.colorTheme;
            if (s.animationSpeed) elements.animationSpeed.value = s.animationSpeed;
            if (s.position) elements.visualizerPosition.value = s.position;
            if (s.barCount) elements.barCount.value = s.barCount;
            if (s.mirrorMode) elements.mirrorMode.value = s.mirrorMode;
            if (s.glowIntensity) elements.glowIntensity.value = s.glowIntensity;
            if (s.videoQuality) elements.videoQuality.value = s.videoQuality;
            if (s.frameRate) elements.frameRate.value = s.frameRate;
            if (s.exportFormat) elements.exportFormat.value = s.exportFormat;

            // Update Overlays
            if (s.overlaySettings) overlaySettings = s.overlaySettings;
            if (s.textOverlays) textOverlays = s.textOverlays;

            // Trigger updates for display values
            document.getElementById('sensitivityValue').textContent = s.sensitivity;
            document.getElementById('animationSpeedValue').textContent = s.animationSpeed;
            document.getElementById('barCountValue').textContent = s.barCount;
            document.getElementById('glowIntensityValue').textContent = s.glowIntensity;

            // Load overlay UI inputs (partial implementation of restoration, assumes 5 slots)
            for (let i = 0; i < 5; i++) {
                const elSize = document.getElementById(`overlay${i + 1}Size`);
                const elOp = document.getElementById(`overlay${i + 1}Opacity`);
                if (elSize && overlaySettings[i]) {
                    elSize.value = overlaySettings[i].size;
                    document.getElementById(`overlay${i + 1}SizeValue`).textContent = overlaySettings[i].size;
                }
                if (elOp && overlaySettings[i]) {
                    elOp.value = overlaySettings[i].opacity;
                    document.getElementById(`overlay${i + 1}OpacityValue`).textContent = overlaySettings[i].opacity;
                }
            }

            // Load text overlay UI inputs
            for (let i = 0; i < 2; i++) {
                const text = textOverlays[i];
                if (text) {
                    document.getElementById(`text${i + 1}Content`).value = text.content || '';
                    document.getElementById(`text${i + 1}Size`).value = text.size || 32;
                    document.getElementById(`text${i + 1}Color`).value = text.color || '#ffffff';
                    document.getElementById(`text${i + 1}Font`).value = text.font || 'Inter';
                    document.getElementById(`text${i + 1}Style`).value = text.style || 'normal';
                    document.getElementById(`text${i + 1}Shadow`).checked = text.shadow !== false;
                }
            }

            visualizer.updateCanvasSize(); // Resize based on loaded quality
        }
    } catch (e) {
        console.warn('LocalStorage load failed', e);
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // File Uploads
    elements.imageUpload.addEventListener('change', handleImageUpload);
    elements.audioUpload.addEventListener('change', handleAudioUpload);

    // Visualizer Controls
    elements.barStyle.addEventListener('change', (e) => { visualizer.updateSettings({ barStyle: e.target.value }); saveSettings(); });
    elements.sensitivity.addEventListener('input', (e) => {
        visualizer.updateSettings({ sensitivity: parseFloat(e.target.value) });
        document.getElementById('sensitivityValue').textContent = e.target.value;
        saveSettings();
    });
    elements.colorTheme.addEventListener('change', (e) => { visualizer.updateSettings({ colorTheme: e.target.value }); saveSettings(); });
    elements.animationSpeed.addEventListener('input', (e) => {
        visualizer.updateSettings({ animationSpeed: parseFloat(e.target.value) });
        document.getElementById('animationSpeedValue').textContent = e.target.value;
        saveSettings();
    });
    elements.visualizerPosition.addEventListener('change', (e) => {
        visualizer.updateSettings({ position: e.target.value });
        saveSettings();
        visualizer.drawInitialState();
    });
    elements.barCount.addEventListener('input', (e) => {
        visualizer.updateSettings({ barCount: parseInt(e.target.value) });
        document.getElementById('barCountValue').textContent = e.target.value;
        saveSettings();
        visualizer.drawInitialState();
    });
    elements.mirrorMode.addEventListener('change', (e) => {
        visualizer.updateSettings({ mirrorMode: e.target.value });
        saveSettings();
        visualizer.drawInitialState();
    });
    elements.glowIntensity.addEventListener('input', (e) => {
        visualizer.updateSettings({ glowIntensity: parseInt(e.target.value) });
        document.getElementById('glowIntensityValue').textContent = e.target.value;
        saveSettings();
        visualizer.drawInitialState();
    });

    // Export Settings
    elements.videoQuality.addEventListener('change', () => {
        const qualityMap = { '720p': { width: 1280, height: 720 }, '1080p': { width: 1920, height: 1080 }, '4k': { width: 3840, height: 2160 } };
        const s = qualityMap[elements.videoQuality.value];
        visualizer.updateSettings({ width: s.width, height: s.height });
        saveSettings();
    }); // This calls drawInitialState internally via updateCanvasSize->backgroundNeedsUpdate logic check? No, need to trigger draw
    elements.videoQuality.addEventListener('change', () => visualizer.drawInitialState());

    elements.frameRate.addEventListener('change', (e) => {
        visualizer.updateSettings({ frameRate: e.target.value });
        saveSettings();
    });
    elements.exportFormat.addEventListener('change', saveSettings);

    // Recording Controls
    elements.startBtn.addEventListener('click', handleStart);
    elements.pauseBtn.addEventListener('click', handlePause);
    elements.resumeBtn.addEventListener('click', handleResume);
    elements.stopBtn.addEventListener('click', handleStop);

    // Overlay Uploads & Controls
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`overlay${i}Upload`).addEventListener('change', (e) => handleOverlayUpload(e, i - 1));
        document.getElementById(`overlay${i}Size`).addEventListener('input', (e) => {
            overlaySettings[i - 1].size = parseInt(e.target.value);
            document.getElementById(`overlay${i}SizeValue`).textContent = e.target.value;
            saveSettings();
            visualizer.drawInitialState();
        });
        document.getElementById(`overlay${i}Opacity`).addEventListener('input', (e) => {
            overlaySettings[i - 1].opacity = parseInt(e.target.value);
            document.getElementById(`overlay${i}OpacityValue`).textContent = e.target.value;
            saveSettings();
            visualizer.drawInitialState();
        });
        document.getElementById(`overlay${i}Remove`).addEventListener('click', () => removeOverlay(i - 1));
    }

    // Text Overlay Controls
    for (let i = 1; i <= 2; i++) {
        const idx = i - 1;
        document.getElementById(`text${i}Content`).addEventListener('input', (e) => { textOverlays[idx].content = e.target.value; saveSettings(); visualizer.drawInitialState(); });
        document.getElementById(`text${i}Size`).addEventListener('input', (e) => { textOverlays[idx].size = parseInt(e.target.value); saveSettings(); visualizer.drawInitialState(); });
        document.getElementById(`text${i}Color`).addEventListener('input', (e) => { textOverlays[idx].color = e.target.value; saveSettings(); visualizer.drawInitialState(); });
        document.getElementById(`text${i}Font`).addEventListener('change', (e) => { textOverlays[idx].font = e.target.value; saveSettings(); visualizer.drawInitialState(); });
        document.getElementById(`text${i}Style`).addEventListener('change', (e) => { textOverlays[idx].style = e.target.value; saveSettings(); visualizer.drawInitialState(); });
        document.getElementById(`text${i}Shadow`).addEventListener('change', (e) => { textOverlays[idx].shadow = e.target.checked; saveSettings(); visualizer.drawInitialState(); });
    }

    // Canvas Interactions (Dragging)
    const canvas = visualizer.canvas;
    canvas.addEventListener('mousedown', handleCanvasMouseDown);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseup', handleCanvasMouseUp);
    canvas.addEventListener('mouseleave', handleCanvasMouseUp);
    canvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleCanvasTouchEnd);
}

// --- Upload Handlers ---
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('imageFileName').textContent = file.name;
        const url = URL.createObjectURL(file);

        if (file.type.startsWith('video/')) {
            visualizer.setBackgroundVideo(url);
        } else {
            const img = new Image();
            img.onload = () => {
                visualizer.setBackground(img);
                checkFilesReady();
            };
            img.src = url;
        }
    }
}

function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('audioFileName').textContent = file.name;
        const audioSrc = URL.createObjectURL(file);
        visualizer.audioPlayer.src = audioSrc;
        checkFilesReady();
    }
}

function handleOverlayUpload(e, index) {
    const file = e.target.files[0];
    if (file) {
        // UI Feedback: Loading
        const label = document.querySelector(`label[for="overlay${index + 1}Upload"]`);
        if (label) label.textContent = '...';

        document.getElementById(`overlay${index + 1}Name`).textContent = file.name;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                // Reset settings to ensure visibility (Center of canvas, decent size/opacity)
                overlaySettings[index] = {
                    x: visualizer.canvas.width / 2 - 100, // Approximate center
                    y: visualizer.canvas.height / 2 - 100,
                    size: 50,
                    opacity: 100,
                    isDragging: false,
                    dragOffset: { x: 0, y: 0 }
                };

                // Update specific UI controls to match new defaults
                const sizeInput = document.getElementById(`overlay${index + 1}Size`);
                const opInput = document.getElementById(`overlay${index + 1}Opacity`);
                if (sizeInput) { sizeInput.value = 50; document.getElementById(`overlay${index + 1}SizeValue`).textContent = 50; }
                if (opInput) { opInput.value = 100; document.getElementById(`overlay${index + 1}OpacityValue`).textContent = 100; }

                overlayImages[index] = img;
                visualizer.drawInitialState();
                saveSettings(); // Persist the reset

                // UI Feedback: Success
                if (label) {
                    label.textContent = '✓';
                    label.classList.add('bg-green-500', 'text-white');
                    label.classList.remove('bg-white/10');
                }

                // Show remove button
                document.getElementById(`overlay${index + 1}Remove`).classList.remove('hidden');
            };
            img.onerror = (err) => {
                console.error(`Overlay ${index + 1} failed to load`, err);
                if (label) label.textContent = '❌';
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function removeOverlay(index) {
    overlayImages[index] = null;
    document.getElementById(`overlay${index + 1}Upload`).value = '';
    document.getElementById(`overlay${index + 1}Name`).textContent = '';

    // Reset UI Feedback
    const label = document.querySelector(`label[for="overlay${index + 1}Upload"]`);
    if (label) {
        label.textContent = `+${index + 1}`;
        label.classList.remove('bg-green-500', 'text-white');
        label.classList.add('bg-white/10');
    }
    document.getElementById(`overlay${index + 1}Remove`).classList.add('hidden');

    visualizer.drawInitialState();
    saveSettings();
}

function checkFilesReady() {
    // Only verify we have something to visualize
    if (visualizer.audioPlayer.src) {
        elements.startBtn.disabled = false;
        elements.statusMessage.textContent = 'Ready to start recording.';
    }
}

// --- Recording Logic ---
async function handleStart() {
    if (appState !== 'idle') return;

    try {
        appState = 'recording';
        clipCounter++;
        elements.statusMessage.textContent = `Recording Clip ${clipCounter}...`;
        elements.progressContainer.classList.remove('hidden');
        startTime = Date.now();
        updateProgressLoop();

        await visualizer.setupAudio();

        // Ensure context is running
        if (visualizer.audioContext.state === 'suspended') {
            await visualizer.audioContext.resume();
        }

        // Start playback and recording
        const playPromise = visualizer.audioPlayer.play();
        if (playPromise !== undefined) await playPromise;

        setupMediaRecorder(); // Initializes mediaRecorder instance with current stream

        mediaRecorder.start();
        visualizer.loop(0); // Start visualizer loop

        updateButtonStates();
    } catch (err) {
        console.error('Start error:', err);
        appState = 'idle';
        elements.statusMessage.textContent = 'Error starting: ' + err.message;
        updateButtonStates();
    }
}

function setupMediaRecorder() {
    // Capture canvas and audio
    const canvasStream = visualizer.canvas.captureStream(parseInt(elements.frameRate.value));
    const audioDest = visualizer.audioContext.createMediaStreamDestination();

    // We already connected source -> destination in setupAudio, but we need to connect source -> newDest for recording? 
    // In visualizer.js we did source -> analyser -> destination. 
    // Wait, visualizer.js connected to `audioContext.destination` (speakers).
    // We need to connect `visualizer.source` to `audioDest` as well for the recorder.
    if (visualizer.source) {
        visualizer.source.connect(audioDest);
    }

    const combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDest.stream.getAudioTracks()]);

    // Choose Mime Type
    const mimeType = getSupportedMimeType();
    try {
        mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
    } catch (e) {
        mediaRecorder = new MediaRecorder(combinedStream);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        recordedChunks = [];

        // Use mp4 extension if mime type is mp4, else webm
        const isMp4 = (mediaRecorder.mimeType || '').includes('mp4') || elements.exportFormat.value === 'mp4';
        const ext = isMp4 ? 'mp4' : 'webm';

        createDownloadLink(videoUrl, ext);

        if (appState === 'paused') {
            elements.statusMessage.textContent = `Clip ${clipCounter} ready. Resume for next.`;
        }
    };
}

function handlePause() {
    if (appState !== 'recording') return;
    appState = 'paused';
    elements.statusMessage.textContent = 'Paused.';
    visualizer.audioPlayer.pause();
    visualizer.pause(); // Stop loop
    mediaRecorder.stop(); // Finalize current chunk/clip
    updateButtonStates();
}

function handleResume() {
    if (appState !== 'paused') return;
    appState = 'recording';
    elements.statusMessage.textContent = `Recording Clip ${++clipCounter}...`;
    visualizer.audioPlayer.play();
    visualizer.loop(0);
    mediaRecorder.start();
    updateButtonStates();
}

function handleStop() {
    if (appState === 'idle') return;
    if (appState === 'recording') mediaRecorder.stop();

    appState = 'idle';
    elements.statusMessage.textContent = 'Finished.';
    visualizer.audioPlayer.pause();
    visualizer.stop();
    elements.progressContainer.classList.add('hidden');
    updateButtonStates();
}

function getSupportedMimeType() {
    // Simplified selection
    const types = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
    for (const t of types) {
        if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
}

function createDownloadLink(url, ext) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `visualizer-clip-${clipCounter}.${ext}`;
    a.textContent = `📥 Download Clip ${clipCounter} (${ext.toUpperCase()})`;
    a.className = 'glass-btn w-full p-3 rounded-lg text-white font-bold text-center block mb-2';
    elements.downloadContainer.appendChild(a);
}

function updateButtonStates() {
    elements.startBtn.classList.toggle('hidden', appState !== 'idle');
    elements.pauseBtn.classList.toggle('hidden', appState !== 'recording');
    elements.resumeBtn.classList.toggle('hidden', appState !== 'paused');
    elements.stopBtn.classList.toggle('hidden', appState === 'idle');
}

function updateProgressLoop() {
    if (appState === 'recording') {
        const elapsed = (Date.now() - startTime) / 1000;
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
        elements.recordingTime.textContent = `${mins}:${secs}`;

        if (visualizer.audioPlayer.duration) {
            const p = (visualizer.audioPlayer.currentTime / visualizer.audioPlayer.duration) * 100;
            elements.progressBar.style.width = `${p}%`;
            elements.progressText.textContent = `${Math.round(p)}%`;
        }

        requestAnimationFrame(updateProgressLoop);
    }
}

// --- Overlay Drawing & Interaction ---
function drawOverlays(ctx) {
    // Draw Images
    for (let i = 0; i < overlayImages.length; i++) {
        const img = overlayImages[i];
        if (img && img.complete && img.naturalWidth > 0) {
            const sett = overlaySettings[i];
            const w = (img.width * sett.size) / 100;
            const h = (img.height * sett.size) / 100;
            ctx.globalAlpha = sett.opacity / 100;
            ctx.drawImage(img, sett.x, sett.y, w, h);
            ctx.globalAlpha = 1.0;
        }
    }

    // Draw Text
    for (const t of textOverlays) {
        if (t.content) {
            ctx.font = `${t.style} ${t.size}px ${t.font}`;
            ctx.fillStyle = t.color;
            if (t.shadow) {
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
            }
            ctx.fillText(t.content, t.x, t.y);
            ctx.shadowColor = 'transparent';
        }
    }
}

function handleCanvasMouseDown(e) {
    const rect = visualizer.canvas.getBoundingClientRect();
    const scaleX = visualizer.canvas.width / rect.width;
    const scaleY = visualizer.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    checkDragStart(x, y);
}

function handleCanvasTouchStart(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const rect = visualizer.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * (visualizer.canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (visualizer.canvas.height / rect.height);
    checkDragStart(x, y);
}

function checkDragStart(x, y) {
    // Check Text
    visualizer.ctx.textBaseline = 'alphabetic'; // Ensure consistency
    for (let i = textOverlays.length - 1; i >= 0; i--) {
        const t = textOverlays[i];
        if (!t.content) continue;

        visualizer.ctx.font = `${t.style} ${t.size}px ${t.font}`;
        const metrics = visualizer.ctx.measureText(t.content);
        // Approximation of hit box
        if (x >= t.x && x <= t.x + metrics.width && y >= t.y - t.size && y <= t.y + 10) {
            activeTextOverlay = i;
            t.isDragging = true;
            t.dragOffset = { x: x - t.x, y: y - t.y };
            visualizer.canvas.style.cursor = 'grabbing';
            return;
        }
    }

    // Check Images
    for (let i = overlayImages.length - 1; i >= 0; i--) {
        const img = overlayImages[i];
        if (!img) continue;
        const s = overlaySettings[i];
        const w = (img.width * s.size) / 100;
        const h = (img.height * s.size) / 100;
        if (x >= s.x && x <= s.x + w && y >= s.y && y <= s.y + h) {
            activeOverlay = i;
            s.isDragging = true;
            s.dragOffset = { x: x - s.x, y: y - s.y };
            visualizer.canvas.style.cursor = 'grabbing';
            return;
        }
    }
}

function handleCanvasMouseMove(e) {
    const rect = visualizer.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (visualizer.canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (visualizer.canvas.height / rect.height);
    handleDragMove(x, y);
}

function handleCanvasTouchMove(e) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const rect = visualizer.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) * (visualizer.canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (visualizer.canvas.height / rect.height);
    handleDragMove(x, y);
}

function handleDragMove(x, y) {
    let needsDraw = false;
    if (activeTextOverlay !== null) {
        const t = textOverlays[activeTextOverlay];
        if (t.isDragging) {
            t.x = x - t.dragOffset.x;
            t.y = y - t.dragOffset.y;
            needsDraw = true;
        }
    } else if (activeOverlay !== null) {
        const s = overlaySettings[activeOverlay];
        if (s.isDragging) {
            s.x = x - s.dragOffset.x;
            s.y = y - s.dragOffset.y;
            needsDraw = true;
        }
    }
    if (needsDraw) {
        visualizer.drawInitialState();
    }
}

function handleCanvasMouseUp() {
    stopDrag();
}

function handleCanvasTouchEnd() {
    stopDrag();
}

function stopDrag() {
    if (activeTextOverlay !== null) {
        textOverlays[activeTextOverlay].isDragging = false;
        saveSettings();
        activeTextOverlay = null;
    }
    if (activeOverlay !== null) {
        overlaySettings[activeOverlay].isDragging = false;
        saveSettings();
        activeOverlay = null;
    }
    visualizer.canvas.style.cursor = 'default';
}

function checkRecordingSupport() {
    if (!window.MediaRecorder) {
        elements.statusMessage.textContent = '❌ Recording not supported in this browser.';
        elements.startBtn.disabled = true;
    }
}
