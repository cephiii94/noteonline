// script/custom-select.js
// Custom Select UI Component for NoteOnline

const categoryIcons = {
    'Personal': '📋',
    'Work': '💼',
    'Pekerjaan': '💼',
    'Idea': '💡',
    'Ide': '💡',
    'Learning': '📚',
    'Belajar': '📚',
    'Brankas': '🔒',
    'Bisnis': '📈',
    'Proyek': '📁',
    'backlog': '📥',
    'doing': '⚡',
    'done': '✅'
};

export function convertSelectToCustomDropdown(selectEl) {
    if (!selectEl || selectEl.dataset.customized === 'true' || selectEl.closest('.ql-toolbar') || selectEl.closest('.ql-snow') || selectEl.className.includes('ql-')) return;

    selectEl.dataset.customized = 'true';
    selectEl.style.display = 'none'; // Sembunyikan native select

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    
    // Salin class grid jika ada (misal: form-grid-span-2)
    if (selectEl.classList.contains('form-grid-span-2')) {
        wrapper.classList.add('form-grid-span-2');
    }

    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.tabIndex = 0;

    const labelContainer = document.createElement('span');
    labelContainer.className = 'custom-select-label';

    const arrow = document.createElement('i');
    arrow.className = 'fas fa-chevron-down custom-select-arrow';

    trigger.appendChild(labelContainer);
    trigger.appendChild(arrow);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    if (selectEl.parentNode) {
        selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
    }

    function getOptionData(opt) {
        let rawText = opt.textContent.trim();
        let val = opt.value;
        
        // Cek jika teks sudah memiliki emoji
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|🔒|📋|💼|💡|📚|📈|📁|📥|⚡|✅/u;
        const match = rawText.match(emojiRegex);
        
        let icon = '';
        let cleanText = rawText;

        if (match) {
            icon = match[0];
            cleanText = rawText.replace(emojiRegex, '').trim();
        } else if (categoryIcons[val]) {
            icon = categoryIcons[val];
        } else if (categoryIcons[rawText]) {
            icon = categoryIcons[rawText];
        }

        return { rawText, cleanText, val, icon };
    }

    function renderOptions() {
        menu.innerHTML = '';
        const options = Array.from(selectEl.options);
        
        options.forEach((opt, idx) => {
            const { cleanText, val, icon } = getOptionData(opt);
            const optionDiv = document.createElement('div');
            optionDiv.className = 'custom-select-option';
            
            if (opt.disabled) optionDiv.classList.add('is-disabled');
            if (opt.selected || selectEl.value === val) optionDiv.classList.add('is-selected');

            const contentDiv = document.createElement('div');
            contentDiv.className = 'custom-select-option-content';
            
            if (icon) {
                const iconSpan = document.createElement('span');
                iconSpan.className = 'custom-select-option-icon';
                iconSpan.textContent = icon;
                contentDiv.appendChild(iconSpan);
            }

            const textSpan = document.createElement('span');
            textSpan.className = 'custom-select-option-text';
            textSpan.textContent = cleanText;
            contentDiv.appendChild(textSpan);

            const checkIcon = document.createElement('i');
            checkIcon.className = 'fas fa-check custom-select-check';

            optionDiv.appendChild(contentDiv);
            optionDiv.appendChild(checkIcon);

            optionDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                if (opt.disabled) return;
                
                selectEl.value = val;
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                updateTrigger();
                closeDropdown();
            });

            menu.appendChild(optionDiv);
        });
    }

    function updateTrigger() {
        let selectedOpt = selectEl.options[selectEl.selectedIndex];
        if (!selectedOpt && selectEl.options.length > 0) {
            selectedOpt = selectEl.options[0];
        }
        if (!selectedOpt) return;

        const { cleanText, icon } = getOptionData(selectedOpt);
        labelContainer.innerHTML = '';

        if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'custom-select-option-icon';
            iconSpan.textContent = icon;
            labelContainer.appendChild(iconSpan);
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'custom-select-option-text';
        textSpan.textContent = cleanText;
        labelContainer.appendChild(textSpan);

        // Update state opsi di menu
        Array.from(menu.children).forEach((childOpt, idx) => {
            const opt = selectEl.options[idx];
            if (opt) {
                if (opt.value === selectEl.value) {
                    childOpt.classList.add('is-selected');
                } else {
                    childOpt.classList.remove('is-selected');
                }
            }
        });
    }

    function toggleDropdown() {
        const isOpen = wrapper.classList.contains('is-open');
        closeAllCustomDropdowns();
        if (!isOpen) {
            wrapper.classList.add('is-open');
        }
    }

    function closeDropdown() {
        wrapper.classList.remove('is-open');
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });

    trigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleDropdown();
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    // Handle pengubahan .value langsung via JS (misal: editNoteCategory.value = 'Work')
    try {
        const nativeValueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(selectEl, 'value', {
            set: function(val) {
                nativeValueDescriptor.set.call(this, val);
                updateTrigger();
            },
            get: function() {
                return nativeValueDescriptor.get.call(this);
            },
            configurable: true
        });
    } catch(e) {
        console.warn('CustomSelect: Property setter binding warning', e);
    }

    selectEl.addEventListener('change', () => {
        updateTrigger();
    });

    // Observer untuk mendeteksi penambahan/pengurangan <option> secara dinamis
    const observer = new MutationObserver(() => {
        renderOptions();
        updateTrigger();
    });
    observer.observe(selectEl, { childList: true, subtree: true });

    renderOptions();
    updateTrigger();
}

export function initAllCustomDropdowns() {
    document.querySelectorAll('select').forEach(selectEl => {
        if (selectEl.classList.contains('mobile-move-select') || selectEl.closest('.ql-toolbar') || selectEl.closest('.ql-snow') || selectEl.className.includes('ql-')) return;
        convertSelectToCustomDropdown(selectEl);
    });
}

export function closeAllCustomDropdowns() {
    document.querySelectorAll('.custom-select-wrapper.is-open').forEach(w => {
        w.classList.remove('is-open');
    });
}

document.addEventListener('click', () => {
    closeAllCustomDropdowns();
});
