const { asyncHandler } = require('../utils/errors');
const MetaAdsService = require('../services/metaAdsService');

const getStatus = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.getStatus();
    res.status(200).json({ success: true, data, message: 'Meta connection status fetched' });
});

const listAdAccounts = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.listAdAccounts(req.query);
    res.status(200).json({ success: true, data, message: 'Ad accounts fetched successfully' });
});

const listCampaigns = asyncHandler(async (req, res) => {
    const data = await MetaAdsService.listCampaigns(req.query);
    res.status(200).json({ success: true, data, message: 'Campaigns fetched successfully' });
});

const getInsights = asyncHandler(async (req, res) => {
    const query = { ...req.query };
    if (typeof query.campaignIds === 'string' && query.campaignIds !== '') {
        query.campaignIds = query.campaignIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
    const data = await MetaAdsService.getInsights(query);
    res.status(200).json({ success: true, data, message: 'Insights fetched successfully' });
});

module.exports = {
    getStatus,
    listAdAccounts,
    listCampaigns,
    getInsights,
};
