/**
 * LocalStorage and Preset Management for Invoice Builder
 */

const STORAGE_KEYS = {
  SENDER_PROFILE: 'invoice_sender_profile',
  DRAFT: 'invoice_current_draft',
  SIDEBAR_COLLAPSED: 'invoice_sidebar_collapsed',
  SAVED_INVOICES: 'invoice_saved_invoices_list',
  CURRENT_INVOICE_ID: 'invoice_active_invoice_id'
};

const StorageManager = {
  // Get all saved invoices
  getSavedInvoices: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SAVED_INVOICES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading saved invoices', e);
      return [];
    }
  },

  // Save all invoices array
  saveAllInvoices: (list, notifyParent = true) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED_INVOICES, JSON.stringify(list));
      if (notifyParent) {
        const message = {
          type: 'INVOICES_UPDATED',
          invoices: list
        };
        if (window.parent !== window) {
          window.parent.postMessage(message, window.location.origin);
        } else if (window.opener && !window.opener.closed) {
          window.opener.postMessage(message, window.location.origin);
        }
      }
      return true;
    } catch (e) {
      console.error('Error saving invoices list', e);
      return false;
    }
  },

  // Save or update an invoice
  saveInvoice: (invoice) => {
    try {
      const list = StorageManager.getSavedInvoices();
      const existingIndex = list.findIndex(item => item.id === invoice.id);
      const now = new Date().toISOString();
      invoice.updatedAt = now;
      if (existingIndex >= 0) {
        list[existingIndex] = { ...invoice, updatedAt: now };
      } else {
        if (!invoice.createdAt) invoice.createdAt = now;
        list.unshift({ ...invoice, createdAt: invoice.createdAt, updatedAt: now });
      }
      StorageManager.saveAllInvoices(list);
      StorageManager.setActiveInvoiceId(invoice.id);
      return true;
    } catch (e) {
      console.error('Error saving invoice item', e);
      return false;
    }
  },

  // Delete invoice by ID
  deleteInvoice: (id) => {
    try {
      let list = StorageManager.getSavedInvoices();
      list = list.filter(item => item.id !== id);
      StorageManager.saveAllInvoices(list);
      return true;
    } catch (e) {
      console.error('Error deleting invoice', e);
      return false;
    }
  },

  // Active invoice ID
  getActiveInvoiceId: () => {
    try {
      return localStorage.getItem(STORAGE_KEYS.CURRENT_INVOICE_ID);
    } catch (e) {
      return null;
    }
  },

  setActiveInvoiceId: (id) => {
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_INVOICE_ID, id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_INVOICE_ID);
      }
    } catch (e) {}
  },

  // Save sidebar collapsed state
  saveSidebarCollapsed: (isCollapsed) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, isCollapsed ? 'true' : 'false');
    } catch (e) {}
  },

  // Load sidebar collapsed state
  loadSidebarCollapsed: () => {
    try {
      return localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === 'true';
    } catch (e) {
      return false;
    }
  },

  // Save sender (From) profile & payment notes for one-click re-use
  saveSenderProfile: (profile) => {
    try {
      localStorage.setItem(STORAGE_KEYS.SENDER_PROFILE, JSON.stringify(profile));
      return true;
    } catch (e) {
      console.error('Error saving profile to localStorage', e);
      return false;
    }
  },

  // Load saved sender profile
  loadSenderProfile: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SENDER_PROFILE);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error reading profile from localStorage', e);
      return null;
    }
  },

  // Save current active draft
  saveDraft: (invoiceData) => {
    try {
      localStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify(invoiceData));
    } catch (e) {
      console.error('Error auto-saving draft', e);
    }
  },

  // Load draft
  loadDraft: () => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DRAFT);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error reading draft', e);
      return null;
    }
  },

  // Save Paper Size (a4 / letter)
  savePaperSize: (size) => {
    try {
      localStorage.setItem('invoice_paper_size', size);
    } catch (e) {}
  },

  // Load Paper Size
  loadPaperSize: () => {
    try {
      return localStorage.getItem('invoice_paper_size') || 'a4';
    } catch (e) {
      return 'a4';
    }
  },

  // Clear draft
  clearDraft: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.DRAFT);
    } catch (e) {
      console.error('Error clearing draft', e);
    }
  }
};
