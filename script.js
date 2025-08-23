// Note Management System with Server Storage
class NoteManager {
    constructor() {
        this.notes = [];
        this.currentNoteId = null;
        this.apiBase = '/api/notes';
        this.isLoading = false;
        this.initializeEventListeners();
        this.loadNotes();
    }

    // Initialize event listeners
    initializeEventListeners() {
        // Header actions
        document.getElementById('addNoteBtn').addEventListener('click', () => this.openNoteModal());
        document.getElementById('searchToggle').addEventListener('click', () => this.toggleSearch());
        
        // Search functionality
        document.getElementById('searchInput').addEventListener('input', (e) => this.searchNotes(e.target.value));
        document.getElementById('searchClear').addEventListener('click', () => this.clearSearch());
        
        // Form submission
        document.getElementById('noteForm').addEventListener('submit', (e) => this.saveNote(e));
        
        // Delete confirmation
        document.getElementById('confirmDeleteBtn').addEventListener('click', () => this.deleteNote());
        
        // Close modals on overlay click
        document.getElementById('noteModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeNoteModal();
        });
        document.getElementById('deleteModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeDeleteModal();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    // API helper methods
    async apiRequest(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            this.showNotification(`Error: ${error.message}`, 'error');
            throw error;
        }
    }

    // Load notes from server
    async loadNotes() {
        try {
            this.setLoading(true);
            const response = await this.apiRequest(this.apiBase);
            this.notes = response.data || [];
            this.renderNotes();
            this.updateStats();
        } catch (error) {
            this.showNotification('Failed to load notes from server', 'error');
            this.notes = [];
        } finally {
            this.setLoading(false);
        }
    }

    // Set loading state
    setLoading(loading) {
        this.isLoading = loading;
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(btn => {
            btn.disabled = loading;
            if (loading) {
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        });
        
        // Show loading indicator in stats
        if (loading) {
            document.getElementById('totalNotes').textContent = '...';
            document.getElementById('lastModified').textContent = 'Loading...';
        }
    }

// Format date
    formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            return 'Today';
        } else if (diffDays === 2) {
            return 'Yesterday';
        } else if (diffDays <= 7) {
            return `${diffDays - 1} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    // Open note modal
    openNoteModal(noteId = null) {
        this.currentNoteId = noteId;
        const modal = document.getElementById('noteModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('noteForm');
        
        if (noteId) {
            // Edit mode
            const note = this.notes.find(n => n.id === noteId);
            if (note) {
                title.textContent = 'Edit Note';
                document.getElementById('noteId').value = note.id;
                document.getElementById('noteTitle').value = note.title;
                document.getElementById('noteContent').value = note.content;
                document.getElementById('noteCategory').value = note.category;
            }
        } else {
            // Create mode
            title.textContent = 'Add New Note';
            form.reset();
        }
        
        modal.classList.add('active');
        document.getElementById('noteTitle').focus();
    }

    // Close note modal
    closeNoteModal() {
        document.getElementById('noteModal').classList.remove('active');
        this.currentNoteId = null;
    }

    // Save note to server
    async saveNote(e) {
        e.preventDefault();
        
        if (this.isLoading) return;
        
        const title = document.getElementById('noteTitle').value.trim();
        const content = document.getElementById('noteContent').value.trim();
        const category = document.getElementById('noteCategory').value;
        
        if (!title || !content) {
            this.showNotification('Please fill in both title and content.', 'error');
            return;
        }
        
        try {
            this.setLoading(true);
            
            if (this.currentNoteId) {
                // Update existing note
                const response = await this.apiRequest(`${this.apiBase}/${this.currentNoteId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ title, content, category })
                });
                
                // Update local notes array
                const noteIndex = this.notes.findIndex(n => n.id === this.currentNoteId);
                if (noteIndex !== -1) {
                    this.notes[noteIndex] = response.data;
                }
                
                this.showNotification('Note updated successfully!', 'success');
            } else {
                // Create new note
                const response = await this.apiRequest(this.apiBase, {
                    method: 'POST',
                    body: JSON.stringify({ title, content, category })
                });
                
                // Add to local notes array
                this.notes.unshift(response.data);
                
                this.showNotification('Note created successfully!', 'success');
            }
            
            this.renderNotes();
            this.updateStats();
            this.closeNoteModal();
            
        } catch (error) {
            this.showNotification('Failed to save note. Please try again.', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    // Open delete modal
    openDeleteModal(noteId) {
        this.currentNoteId = noteId;
        document.getElementById('deleteModal').classList.add('active');
    }

    // Close delete modal
    closeDeleteModal() {
        document.getElementById('deleteModal').classList.remove('active');
        this.currentNoteId = null;
    }

    // Delete note from server
    async deleteNote() {
        if (!this.currentNoteId || this.isLoading) return;
        
        try {
            this.setLoading(true);
            
            await this.apiRequest(`${this.apiBase}/${this.currentNoteId}`, {
                method: 'DELETE'
            });
            
            // Remove from local notes array
            this.notes = this.notes.filter(note => note.id !== this.currentNoteId);
            
            this.renderNotes();
            this.updateStats();
            this.closeDeleteModal();
            this.showNotification('Note deleted successfully!', 'success');
            
        } catch (error) {
            this.showNotification('Failed to delete note. Please try again.', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    // Toggle search
    toggleSearch() {
        const searchContainer = document.getElementById('searchContainer');
        const searchInput = document.getElementById('searchInput');
        
        searchContainer.classList.toggle('active');
        
        if (searchContainer.classList.contains('active')) {
            searchInput.focus();
        } else {
            this.clearSearch();
        }
    }

    // Search notes
    searchNotes(query) {
        const filteredNotes = query.trim() === '' 
            ? this.notes 
            : this.notes.filter(note => 
                note.title.toLowerCase().includes(query.toLowerCase()) ||
                note.content.toLowerCase().includes(query.toLowerCase()) ||
                note.category.toLowerCase().includes(query.toLowerCase())
            );
        
        this.renderNotes(filteredNotes);
    }

    // Clear search
    clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchContainer').classList.remove('active');
        this.renderNotes();
    }

    // Render notes
    renderNotes(notesToRender = null) {
        const notesGrid = document.getElementById('notesGrid');
        const emptyState = document.getElementById('emptyState');
        const notes = notesToRender || this.notes;
        
        if (notes.length === 0) {
            notesGrid.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        notesGrid.innerHTML = notes.map(note => `
            <div class="note-card">
                <div class="note-header">
                    <div>
                        <h3 class="note-title">${this.escapeHtml(note.title)}</h3>
                        <span class="note-category">${this.capitalizeFirst(note.category)}</span>
                    </div>
                </div>
                <div class="note-content">${this.escapeHtml(note.content)}</div>
                <div class="note-meta">
                    <span>Created: ${this.formatDate(note.createdAt)}</span>
                    <span>Updated: ${this.formatDate(note.updatedAt)}</span>
                </div>
                <div class="note-actions">
                    <button class="note-action-btn" onclick="noteManager.openNoteModal('${note.id}')" title="Edit note">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="note-action-btn delete" onclick="noteManager.openDeleteModal('${note.id}')" title="Delete note">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Update statistics
    updateStats() {
        const totalNotes = this.notes.length;
        const lastModified = totalNotes > 0 
            ? this.formatDate(Math.max(...this.notes.map(note => note.updatedAt)))
            : 'Never';
        
        document.getElementById('totalNotes').textContent = totalNotes;
        document.getElementById('lastModified').textContent = lastModified;
    }

    // Handle keyboard shortcuts
    handleKeyboardShortcuts(e) {
        // Ctrl/Cmd + N: New note
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            this.openNoteModal();
        }
        
        // Ctrl/Cmd + F: Search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            this.toggleSearch();
        }
        
        // Escape: Close modals
        if (e.key === 'Escape') {
            this.closeNoteModal();
            this.closeDeleteModal();
            this.clearSearch();
        }
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            animation: slideInRight 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Global functions for inline event handlers
function openNoteModal(noteId = null) {
    noteManager.openNoteModal(noteId);
}

function closeNoteModal() {
    noteManager.closeNoteModal();
}

function closeDeleteModal() {
    noteManager.closeDeleteModal();
}

// Initialize the application
let noteManager;
document.addEventListener('DOMContentLoaded', () => {
    noteManager = new NoteManager();
});