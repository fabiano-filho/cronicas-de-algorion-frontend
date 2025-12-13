// Hint cards carousel functionality + Drag-and-Drop
const TOTAL_CARDS = 8;
const VISIBLE_CARDS = 3;

// Track current starting index
let currentIndex = 0;

// All hint cards data (placeholder)
const hintCardsData = [
    { id: 1, text: 'Carta de Dica 1' },
    { id: 2, text: 'Carta de Dica 2' },
    { id: 3, text: 'Carta de Dica 3' },
    { id: 4, text: 'Carta de Dica 4' },
    { id: 5, text: 'Carta de Dica 5' },
    { id: 6, text: 'Carta de Dica 6' },
    { id: 7, text: 'Carta de Dica 7' },
    { id: 8, text: 'Carta de Dica 8' }
];

// Track slots state (8 slots, each can hold a card ID or null)
const slotsState = new Array(8).fill(null);

// Track used cards (Set of card IDs currently in slots)
const usedCards = new Set();

// Drag state
let draggedCardId = null;
let draggedFromSlot = null;

// DOM elements
const scrollUpBtn = document.getElementById('scrollUp');
const scrollDownBtn = document.getElementById('scrollDown');
const cardsContainer = document.querySelector('.hint-cards-container');
const slots = document.querySelectorAll('.slot');

// Initialize the display
function init() {
    updateDisplay();
    updateButtons();
    setupDragAndDrop();
}

// Update the visible cards
function updateDisplay() {
    // Filter out used cards
    const availableCards = hintCardsData.filter(card => !usedCards.has(card.id));

    const visibleData = availableCards.slice(currentIndex, currentIndex + VISIBLE_CARDS);

    // Clear existing cards in container
    cardsContainer.innerHTML = '';

    // Create card elements for visible cards
    visibleData.forEach((data) => {
        const cardEl = createCardElement(data);
        cardsContainer.appendChild(cardEl);
    });

    // Add placeholders if less than 3 visible
    const placeholdersNeeded = VISIBLE_CARDS - visibleData.length;
    for (let i = 0; i < placeholdersNeeded; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'hint-card';
        placeholder.style.opacity = '0.3';
        placeholder.style.transform = 'scale(0.9)';
        placeholder.innerHTML = '<span class="card-label">-</span>';
        cardsContainer.appendChild(placeholder);
    }

    // Update slots display
    updateSlotsDisplay();
}

// Create a card element
function createCardElement(data, inSlot = false) {
    const cardEl = document.createElement('div');
    cardEl.className = 'hint-card';
    cardEl.draggable = true;
    cardEl.dataset.cardId = data.id;

    const label = document.createElement('span');
    label.className = 'card-label';
    label.textContent = data.text;
    cardEl.appendChild(label);

    // Add remove button if in slot
    if (inSlot) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCardFromSlot(data.id);
        });
        cardEl.appendChild(removeBtn);
    }

    // Add drag event listeners
    cardEl.addEventListener('dragstart', handleDragStart);
    cardEl.addEventListener('dragend', handleDragEnd);

    return cardEl;
}

// Update slots display
function updateSlotsDisplay() {
    slots.forEach((slot, index) => {
        const cardId = slotsState[index];

        // Clear slot
        slot.innerHTML = '<span class="slot-label">SLOT</span>';
        slot.classList.remove('filled');

        if (cardId !== null) {
            // Slot is filled
            slot.classList.add('filled');
            const cardData = hintCardsData.find(c => c.id === cardId);
            if (cardData) {
                const cardEl = createCardElement(cardData, true);
                slot.appendChild(cardEl);
            }
        }
    });
}

// Update button states
function updateButtons() {
    const availableCards = hintCardsData.filter(card => !usedCards.has(card.id));

    // Disable up button if at the start
    scrollUpBtn.disabled = currentIndex === 0;

    // Disable down button if at the end or no more cards
    scrollDownBtn.disabled = currentIndex >= availableCards.length - VISIBLE_CARDS;
}

// Scroll up (show previous cards)
function scrollUp() {
    if (currentIndex > 0) {
        currentIndex--;
        updateDisplay();
        updateButtons();
    }
}

// Scroll down (show next cards)
function scrollDown() {
    const availableCards = hintCardsData.filter(card => !usedCards.has(card.id));
    if (currentIndex < availableCards.length - VISIBLE_CARDS) {
        currentIndex++;
        updateDisplay(); updateButtons();
    }
}

// Setup drag and drop
function setupDragAndDrop() {
    // Make slots droppable
    slots.forEach(slot => {
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('drop', handleDrop);
        slot.addEventListener('dragleave', handleDragLeave);
    });

    // Make hint column droppable (for removing cards from slots)
    cardsContainer.addEventListener('dragover', handleDragOver);
    cardsContainer.addEventListener('drop', handleDropToColumn);
}

// Drag start handler
function handleDragStart(e) {
    const cardEl = e.target.closest('.hint-card');
    if (!cardEl) return;

    draggedCardId = parseInt(cardEl.dataset.cardId);

    // Check if dragging from slot
    const parentSlot = cardEl.closest('.slot');
    if (parentSlot) {
        draggedFromSlot = parseInt(parentSlot.dataset.slotIndex);
    } else {
        draggedFromSlot = null;
    }

    cardEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedCardId);
}

// Drag end handler
function handleDragEnd(e) {
    const cardEl = e.target.closest('.hint-card');
    if (cardEl) {
        cardEl.classList.remove('dragging');
    }

    // Clear drag state
    draggedCardId = null;
    draggedFromSlot = null;

    // Remove all drag-over classes
    slots.forEach(slot => slot.classList.remove('drag-over'));
}

// Drag over handler
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const slot = e.target.closest('.slot');
    if (slot) {
        slot.classList.add('drag-over');
    }
}

// Drag leave handler
function handleDragLeave(e) {
    const slot = e.target.closest('.slot');
    if (slot && !slot.contains(e.relatedTarget)) {
        slot.classList.remove('drag-over');
    }
}

// Drop handler for slots
function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const slot = e.target.closest('.slot');
    if (!slot) return;

    slot.classList.remove('drag-over');

    const targetSlotIndex = parseInt(slot.dataset.slotIndex);
    const existingCardId = slotsState[targetSlotIndex];

    // If dragging from another slot
    if (draggedFromSlot !== null) {
        // Swap or move
        if (existingCardId !== null) {
            // Swap cards
            slotsState[draggedFromSlot] = existingCardId;
            slotsState[targetSlotIndex] = draggedCardId;
        } else {
            // Move to empty slot
            slotsState[draggedFromSlot] = null;
            slotsState[targetSlotIndex] = draggedCardId;
        }
    } else {
        // Dragging from column
        if (existingCardId !== null) {
            // Slot is occupied, swap back to column
            usedCards.delete(existingCardId);
            usedCards.add(draggedCardId);
            slotsState[targetSlotIndex] = draggedCardId;
        } else {
            // Drop into empty slot
            usedCards.add(draggedCardId);
            slotsState[targetSlotIndex] = draggedCardId;
        }
    }

    updateDisplay();
    updateButtons();
}

// Drop handler for column (remove from slot)
function handleDropToColumn(e) {
    e.preventDefault();
    e.stopPropagation();

    // Only process if dragging from a slot
    if (draggedFromSlot !== null && draggedCardId !== null) {
        removeCardFromSlot(draggedCardId);
    }
}

// Remove card from slot
function removeCardFromSlot(cardId) {
    // Find slot index
    const slotIndex = slotsState.findIndex(id => id === cardId);
    if (slotIndex !== -1) {
        slotsState[slotIndex] = null;
        usedCards.delete(cardId);

        // Reset current index if needed
        currentIndex = Math.max(0, currentIndex);

        updateDisplay();
        updateButtons();
    }
}

// Event listeners
scrollUpBtn.addEventListener('click', scrollUp);
scrollDownBtn.addEventListener('click', scrollDown);

// Initialize on page load
init();
