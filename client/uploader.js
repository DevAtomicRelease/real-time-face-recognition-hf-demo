/**
 * uploader.js - Image upload handler (drag-drop + file picker).
 *
 * Manages the drag-and-drop upload zone and file picker for face images.
 * Validates file types and counts, generates preview thumbnails,
 * and prepares files for upload to the server.
 */

class FaceUploader {
    constructor() {
        this.files = [];
        this.maxFiles = 10;
        this.minFiles = 3;
        this.acceptedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    }

    /**
     * Initialize the upload zone with drag-drop and click handlers.
     * @param {HTMLElement} dropZone - The drop zone element.
     * @param {HTMLInputElement} fileInput - The hidden file input.
     * @param {HTMLElement} gallery - The preview gallery container.
     * @param {Function} onFilesChanged - Callback when files list changes.
     */
    init(dropZone, fileInput, gallery, onFilesChanged) {
        this.dropZone = dropZone;
        this.fileInput = fileInput;
        this.gallery = gallery;
        this.onFilesChanged = onFilesChanged;

        // Click to open file picker
        dropZone.addEventListener('click', () => fileInput.click());

        // File input change
        fileInput.addEventListener('change', (e) => {
            this.addFiles(Array.from(e.target.files));
            fileInput.value = ''; // Reset so same files can be re-selected
        });

        // Drag events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const droppedFiles = Array.from(e.dataTransfer.files);
            this.addFiles(droppedFiles);
        });
    }

    /**
     * Add files to the upload queue, validating type and count.
     * @param {File[]} newFiles
     */
    addFiles(newFiles) {
        for (const file of newFiles) {
            if (this.files.length >= this.maxFiles) {
                console.warn(`[Uploader] Maximum ${this.maxFiles} files allowed.`);
                break;
            }

            if (!this.acceptedTypes.includes(file.type)) {
                console.warn(`[Uploader] Rejected file type: ${file.type}`);
                continue;
            }

            this.files.push(file);
        }

        this.renderPreviews();

        if (this.onFilesChanged) {
            this.onFilesChanged(this.files);
        }
    }

    /**
     * Render thumbnail previews of all queued files.
     */
    renderPreviews() {
        this.gallery.innerHTML = '';

        this.files.forEach((file, index) => {
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';

            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.alt = `Face image ${index + 1}`;

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.style.cssText = `
                position: absolute; top: 4px; right: 4px;
                width: 20px; height: 20px; border-radius: 50%;
                background: rgba(239,68,68,0.8); color: white;
                border: none; cursor: pointer; font-size: 14px;
                display: flex; align-items: center; justify-content: center;
                line-height: 1;
            `;
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(index);
            });

            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            this.gallery.appendChild(wrapper);
        });
    }

    /**
     * Remove a file from the queue by index.
     * @param {number} index
     */
    removeFile(index) {
        this.files.splice(index, 1);
        this.renderPreviews();

        if (this.onFilesChanged) {
            this.onFilesChanged(this.files);
        }
    }

    /**
     * Check if enough files are queued for upload.
     */
    isReady() {
        return this.files.length >= this.minFiles;
    }

    /**
     * Get the queued files for upload.
     * @returns {File[]}
     */
    getFiles() {
        return this.files;
    }

    /**
     * Clear all queued files.
     */
    clear() {
        this.files = [];
        this.gallery.innerHTML = '';
        if (this.onFilesChanged) {
            this.onFilesChanged(this.files);
        }
    }
}

// Export globally
window.FaceUploader = FaceUploader;
