const NullTelephonyProvider = require('./nullProvider');
const MockTelephonyProvider = require('./mockProvider');
const GenericHttpTelephonyProvider = require('./genericProvider');

// Provider registry. Selection is explicit (TELEPHONY_PROVIDER=none|mock|generic);
// default is "none" -> not configured, calls rejected honestly.
let instance = null;

const getTelephonyProvider = () => {
    if (instance) return instance;
    const which = (process.env.TELEPHONY_PROVIDER || 'none').toLowerCase();
    if (which === 'mock') instance = new MockTelephonyProvider();
    else if (which === 'generic') instance = new GenericHttpTelephonyProvider();
    else instance = new NullTelephonyProvider();
    return instance;
};

const resetTelephonyProvider = () => { instance = null; };

module.exports = { getTelephonyProvider, resetTelephonyProvider };
