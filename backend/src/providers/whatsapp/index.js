const NullWhatsAppProvider = require('./nullProvider');
const MockWhatsAppProvider = require('./mockProvider');
const GenericHttpWhatsAppProvider = require('./genericProvider');

// Provider registry. Explicit selection via WHATSAPP_PROVIDER=none|mock|generic.
let instance = null;

const getWhatsAppProvider = () => {
    if (instance) return instance;
    const which = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();
    if (which === 'mock') instance = new MockWhatsAppProvider();
    else if (which === 'generic') instance = new GenericHttpWhatsAppProvider();
    else instance = new NullWhatsAppProvider();
    return instance;
};

const resetWhatsAppProvider = () => { instance = null; };

module.exports = { getWhatsAppProvider, resetWhatsAppProvider };
