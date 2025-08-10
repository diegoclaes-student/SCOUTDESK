// Application Scout Management
class ScoutApp {
    constructor() {
        this.data = {
            transactions: JSON.parse(localStorage.getItem('scout_transactions')) || [],
            chefs: JSON.parse(localStorage.getItem('scout_chefs')) || [],
            enfants: JSON.parse(localStorage.getItem('scout_enfants')) || [],
            events: JSON.parse(localStorage.getItem('scout_events')) || [],
            inventaire: JSON.parse(localStorage.getItem('scout_inventaire')) || []
        };
        
        this.init();
    }

    init() {
        this.setupNavigation();
        this.setupForms();
        this.loadDashboard();
        this.renderAll();
    }

    // Navigation
    setupNavigation() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('href').substring(1);
                this.showModule(target);
                
                // Update active nav
                navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            });
        });
    }

    showModule(moduleName) {
        const modules = document.querySelectorAll('.module');
        modules.forEach(module => module.classList.remove('active'));
        
        const targetModule = document.getElementById(moduleName);
        if (targetModule) {
            targetModule.classList.add('active');
        }
    }

    // Forms Setup
    setupForms() {
        // Transaction form
        document.getElementById('transaction-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTransaction();
        });

        // Chef form
        document.getElementById('chef-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addChef();
        });

        // Enfant form
        document.getElementById('enfant-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addEnfant();
        });

        // Event form
        document.getElementById('event-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addEvent();
        });

        // Item form
        document.getElementById('item-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addItem();
        });
    }

    // Dashboard
    loadDashboard() {
        // Budget total
        const totalRecettes = this.data.transactions
            .filter(t => t.type === 'recette')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        
        const totalDepenses = this.data.transactions
            .filter(t => t.type === 'depense')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);
        
        const budget = totalRecettes - totalDepenses;
        document.getElementById('budget-total').textContent = `€${budget.toFixed(2)}`;

        // Comptes
        document.getElementById('chefs-count').textContent = this.data.chefs.filter(c => c.statut === 'Actif').length;
        document.getElementById('enfants-count').textContent = this.data.enfants.length;

        // Prochaine activité
        const nextEvent = this.getNextEvent();
        document.getElementById('next-activity').textContent = nextEvent ? 
            `${nextEvent.title} - ${this.formatDate(nextEvent.date)}` : 
            'Aucune planifiée';
    }

    getNextEvent() {
        const today = new Date();
        const futureEvents = this.data.events
            .filter(event => new Date(event.date) >= today)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        return futureEvents[0] || null;
    }

    // Transactions
    addTransaction() {
        const transaction = {
            id: Date.now(),
            date: document.getElementById('transaction-date').value,
            description: document.getElementById('transaction-description').value,
            type: document.getElementById('transaction-type').value,
            amount: parseFloat(document.getElementById('transaction-amount').value)
        };

        this.data.transactions.push(transaction);
        this.saveData('transactions');
        this.renderTransactions();
        this.updateFinanceSummary();
        this.loadDashboard();
        this.closeModal();
        document.getElementById('transaction-form').reset();
    }

    renderTransactions() {
        const tbody = document.getElementById('transactions-tbody');
        tbody.innerHTML = '';

        this.data.transactions
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .forEach(transaction => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${this.formatDate(transaction.date)}</td>
                    <td>${transaction.description}</td>
                    <td><span class="status-badge status-${transaction.type}">${transaction.type}</span></td>
                    <td>€${transaction.amount.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-danger" onclick="app.deleteTransaction(${transaction.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
    }

    updateFinanceSummary() {
        const recettes = this.data.transactions
            .filter(t => t.type === 'recette')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const depenses = this.data.transactions
            .filter(t => t.type === 'depense')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const solde = recettes - depenses;

        document.getElementById('total-recettes').textContent = `€${recettes.toFixed(2)}`;
        document.getElementById('total-depenses').textContent = `€${depenses.toFixed(2)}`;
        document.getElementById('solde-total').textContent = `€${solde.toFixed(2)}`;
    }

    deleteTransaction(id) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) {
            this.data.transactions = this.data.transactions.filter(t => t.id !== id);
            this.saveData('transactions');
            this.renderTransactions();
            this.updateFinanceSummary();
            this.loadDashboard();
        }
    }

    // Chefs
    addChef() {
        const chef = {
            id: Date.now(),
            nom: document.getElementById('chef-nom').value,
            prenom: document.getElementById('chef-prenom').value,
            email: document.getElementById('chef-email').value,
            telephone: document.getElementById('chef-telephone').value,
            section: document.getElementById('chef-section').value,
            statut: 'Actif'
        };

        this.data.chefs.push(chef);
        this.saveData('chefs');
        this.renderChefs();
        this.loadDashboard();
        this.closeModal();
        document.getElementById('chef-form').reset();
    }

    renderChefs() {
        const tbody = document.getElementById('chefs-tbody');
        tbody.innerHTML = '';

        this.data.chefs.forEach(chef => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${chef.nom}</td>
                <td>${chef.prenom}</td>
                <td>${chef.email}</td>
                <td>${chef.telephone}</td>
                <td>${chef.section}</td>
                <td><span class="status-badge status-${chef.statut.toLowerCase()}">${chef.statut}</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="app.toggleChefStatus(${chef.id})">
                        <i class="fas fa-toggle-on"></i>
                    </button>
                    <button class="btn btn-danger" onclick="app.deleteChef(${chef.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    toggleChefStatus(id) {
        const chef = this.data.chefs.find(c => c.id === id);
        if (chef) {
            chef.statut = chef.statut === 'Actif' ? 'Inactif' : 'Actif';
            this.saveData('chefs');
            this.renderChefs();
            this.loadDashboard();
        }
    }

    deleteChef(id) {
        if (confirm('Êtes-vous sûr de vouloir supprimer ce chef ?')) {
            this.data.chefs = this.data.chefs.filter(c => c.id !== id);
            this.saveData('chefs');
            this.renderChefs();
            this.loadDashboard();
        }
    }

    // Enfants
    addEnfant() {
        const enfant = {
            id: Date.now(),
            nom: document.getElementById('enfant-nom').value,
            prenom: document.getElementById('enfant-prenom').value,
            age: parseInt(document.getElementById('enfant-age').value),
            section: document.getElementById('enfant-section').value,
            parent: document.getElementById('enfant-parent').value,
            telephone: document.getElementById('enfant-telephone').value
        };

        this.data.enfants.push(enfant);
        this.saveData('enfants');
        this.renderEnfants();
        this.loadDashboard();
        this.closeModal();
        document.getElementById('enfant-form').reset();
    }

    renderEnfants() {
        const tbody = document.getElementById('enfants-tbody');
        tbody.innerHTML = '';

        let enfantsToShow = this.data.enfants;
        const filter = document.getElementById('filter-section').value;
        if (filter) {
            enfantsToShow = enfantsToShow.filter(e => e.section === filter);
        }

        enfantsToShow.forEach(enfant => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${enfant.nom}</td>
                <td>${enfant.prenom}</td>
                <td>${enfant.age} ans</td>
                <td>${enfant.section}</td>
                <td>${enfant.parent}</td>
                <td>${enfant.telephone}</td>
                <td>
                    <button class="btn btn-danger" onclick="app.deleteEnfant(${enfant.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    deleteEnfant(id) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cet enfant ?')) {
            this.data.enfants = this.data.enfants.filter(e => e.id !== id);
            this.saveData('enfants');
            this.renderEnfants();
            this.loadDashboard();
        }
    }

    filterEnfantsBySection() {
        this.renderEnfants();
    }

    // Events
    addEvent() {
        const event = {
            id: Date.now(),
            title: document.getElementById('event-title').value,
            date: document.getElementById('event-date').value,
            time: document.getElementById('event-time').value,
            description: document.getElementById('event-description').value,
            section: document.getElementById('event-section').value,
            type: document.getElementById('event-type').value
        };

        this.data.events.push(event);
        this.saveData('events');
        this.renderCalendar();
        this.loadDashboard();
        this.closeModal();
        document.getElementById('event-form').reset();
    }

    renderCalendar() {
        const sectionCalendar = document.getElementById('section-calendar');
        const communCalendar = document.getElementById('commun-calendar');
        
        if (sectionCalendar) {
            this.renderCalendarEvents(sectionCalendar, 'section');
        }
        if (communCalendar) {
            this.renderCalendarEvents(communCalendar, 'commun');
        }
    }

    renderCalendarEvents(container, type) {
        container.innerHTML = '';
        
        let eventsToShow = this.data.events;
        if (type === 'section') {
            const filter = document.getElementById('section-filter').value;
            if (filter) {
                eventsToShow = eventsToShow.filter(e => e.section === filter);
            } else {
                eventsToShow = eventsToShow.filter(e => e.section);
            }
        } else {
            eventsToShow = eventsToShow.filter(e => !e.section || e.type === 'commun');
        }

        eventsToShow
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'event-item';
                eventDiv.innerHTML = `
                    <div style="background: #f7fafc; border-left: 4px solid #48bb78; padding: 15px; margin: 10px 0; border-radius: 5px;">
                        <h4>${event.title}</h4>
                        <p><i class="fas fa-calendar"></i> ${this.formatDate(event.date)} à ${event.time}</p>
                        ${event.section ? `<p><i class="fas fa-users"></i> ${event.section}</p>` : ''}
                        ${event.description ? `<p>${event.description}</p>` : ''}
                        <button class="btn btn-danger" onclick="app.deleteEvent(${event.id})" style="margin-top: 10px;">
                            <i class="fas fa-trash"></i> Supprimer
                        </button>
                    </div>
                `;
                container.appendChild(eventDiv);
            });
    }

    deleteEvent(id) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) {
            this.data.events = this.data.events.filter(e => e.id !== id);
            this.saveData('events');
            this.renderCalendar();
            this.loadDashboard();
        }
    }

    filterEventsBySection() {
        this.renderCalendar();
    }

    // Inventaire
    addItem() {
        const item = {
            id: Date.now(),
            nom: document.getElementById('item-nom').value,
            category: document.getElementById('item-category').value,
            quantity: parseInt(document.getElementById('item-quantity').value),
            etat: document.getElementById('item-etat').value,
            location: document.getElementById('item-location').value,
            statut: 'Disponible'
        };

        this.data.inventaire.push(item);
        this.saveData('inventaire');
        this.renderInventaire();
        this.updateInventoryStats();
        this.closeModal();
        document.getElementById('item-form').reset();
    }

    renderInventaire() {
        const tbody = document.getElementById('inventaire-tbody');
        tbody.innerHTML = '';

        this.data.inventaire.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.nom}</td>
                <td>${item.category}</td>
                <td>${item.quantity}</td>
                <td>${item.etat}</td>
                <td>${item.location}</td>
                <td><span class="status-badge status-${item.statut.toLowerCase()}">${item.statut}</span></td>
                <td>
                    <button class="btn btn-secondary" onclick="app.toggleItemStatus(${item.id})">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                    <button class="btn btn-danger" onclick="app.deleteItem(${item.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    toggleItemStatus(id) {
        const item = this.data.inventaire.find(i => i.id === id);
        if (item) {
            item.statut = item.statut === 'Disponible' ? 'Emprunté' : 'Disponible';
            this.saveData('inventaire');
            this.renderInventaire();
            this.updateInventoryStats();
        }
    }

    deleteItem(id) {
        if (confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
            this.data.inventaire = this.data.inventaire.filter(i => i.id !== id);
            this.saveData('inventaire');
            this.renderInventaire();
            this.updateInventoryStats();
        }
    }

    updateInventoryStats() {
        const total = this.data.inventaire.length;
        const available = this.data.inventaire.filter(i => i.statut === 'Disponible').length;
        const borrowed = this.data.inventaire.filter(i => i.statut === 'Emprunté').length;

        document.getElementById('total-items').textContent = total;
        document.getElementById('available-items').textContent = available;
        document.getElementById('borrowed-items').textContent = borrowed;
    }

    // Modals
    showAddTransactionModal() {
        document.getElementById('transaction-date').value = new Date().toISOString().split('T')[0];
        this.showModal('transaction-modal');
    }

    showAddChefModal() {
        this.showModal('chef-modal');
    }

    showAddEnfantModal() {
        this.showModal('enfant-modal');
    }

    showAddEventModal(type) {
        document.getElementById('event-type').value = type;
        document.getElementById('event-modal-title').textContent = 
            type === 'section' ? 'Ajouter Activité Section' : 'Ajouter Événement Commun';
        this.showModal('event-modal');
    }

    showAddItemModal() {
        this.showModal('item-modal');
    }

    showModal(modalId) {
        document.getElementById('modal-overlay').style.display = 'block';
        document.getElementById(modalId).style.display = 'block';
    }

    closeModal() {
        document.getElementById('modal-overlay').style.display = 'none';
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    // Export
    exportFinances() {
        const data = this.data.transactions;
        const csv = this.convertToCSV(data, ['date', 'description', 'type', 'amount']);
        this.downloadCSV(csv, 'finances_scout.csv');
    }

    convertToCSV(data, headers) {
        const csvHeaders = headers.join(',');
        const csvRows = data.map(row => 
            headers.map(header => `"${row[header]}"`).join(',')
        );
        return [csvHeaders, ...csvRows].join('\n');
    }

    downloadCSV(csv, filename) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Utilities
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR');
    }

    saveData(key) {
        localStorage.setItem(`scout_${key}`, JSON.stringify(this.data[key]));
    }

    renderAll() {
        this.renderTransactions();
        this.updateFinanceSummary();
        this.renderChefs();
        this.renderEnfants();
        this.renderCalendar();
        this.renderInventaire();
        this.updateInventoryStats();
    }
}

// Initialize app
const app = new ScoutApp();

// Global functions for onclick handlers
function showAddTransactionModal() { app.showAddTransactionModal(); }
function showAddChefModal() { app.showAddChefModal(); }
function showAddEnfantModal() { app.showAddEnfantModal(); }
function showAddEventModal(type) { app.showAddEventModal(type); }
function showAddItemModal() { app.showAddItemModal(); }
function closeModal() { app.closeModal(); }
function exportFinances() { app.exportFinances(); }
function filterEnfantsBySection() { app.filterEnfantsBySection(); }
function filterEventsBySection() { app.filterEventsBySection(); }

// Close modal when clicking outside
window.onclick = function(event) {
    const overlay = document.getElementById('modal-overlay');
    if (event.target === overlay) {
        app.closeModal();
    }
};