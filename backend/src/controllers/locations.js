const { asyncHandler } = require('../utils/errors');
const LocationService = require('../services/locationService');

const getStates = asyncHandler(async (req, res) => {
    const states = await LocationService.getStates(req.query.q);

    res.status(200).json({
        success: true,
        data: states,
        message: 'States fetched successfully'
    });
});

const getDistricts = asyncHandler(async (req, res) => {
    const { stateId } = req.params;
    const districts = await LocationService.getDistricts(stateId, req.query.q);

    res.status(200).json({
        success: true,
        data: districts,
        message: 'Districts fetched successfully'
    });
});

const getRegions = asyncHandler(async (req, res) => {
    const { districtId } = req.params;
    const regions = await LocationService.getRegions(districtId, req.query.q);

    res.status(200).json({
        success: true,
        data: regions,
        message: 'Regions fetched successfully'
    });
});

const createRegion = asyncHandler(async (req, res) => {
    const { districtId, name } = req.body;
    const region = await LocationService.createRegion(districtId, name);

    res.status(201).json({
        success: true,
        data: region,
        message: 'Region created successfully'
    });
});

const updateRegion = asyncHandler(async (req, res) => {
    const { regionId } = req.params;
    const { name } = req.body;
    const region = await LocationService.updateRegion(regionId, name);

    res.status(200).json({
        success: true,
        data: region,
        message: 'Region updated successfully'
    });
});

const deleteRegion = asyncHandler(async (req, res) => {
    const { regionId } = req.params;
    await LocationService.deleteRegion(regionId);

    res.status(200).json({
        success: true,
        data: { id: regionId },
        message: 'Region deleted successfully'
    });
});

module.exports = {
    getStates,
    getDistricts,
    getRegions,
    createRegion,
    updateRegion,
    deleteRegion
};
