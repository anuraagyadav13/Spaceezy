const NullWhatsAppProvider = require('./nullProvider');
const MockWhatsAppProvider = require('./mockProvider');
const GenericHttpWhatsAppProvider = require('./genericProvider');
const MetaWhatsAppProvider = require('./metaProvider');

// Provider registry. Explicit selection via WHATSAPP_PROVIDER value:
// none (default, disabled) | mock (simulated) | generic (real HTTP gateway)
// | meta (official WhatsApp Business Platform Cloud API).
let instance = null;

const getWhatsAppProvider = () => {
    if (instance) return instance;
    const which = (process.env.WHATSAPP_PROVIDER || 'none').toLowerCase();
    if (which === 'mock') instance = new MockWhatsAppProvider();
    else if (which === 'generic') instance = new GenericHttpWhatsAppProvider();
    else if (which === 'meta') instance = new MetaWhatsAppProvider();
    else instance = new NullWhatsAppProvider();
    return instance;
};

const resetWhatsAppProvider = () => { instance = null; };

module.exports = { getWhatsAppProvider, resetWhatsAppProvider };
