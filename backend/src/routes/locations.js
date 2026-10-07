const express = require('express');
const {
    getStates,
    getDistricts,
    getRegions,
    createRegion,
    updateRegion,
    deleteRegion
} = require('../controllers/locations');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    searchQuerySchema,
    stateSearchSchema,
    districtSearchSchema,
    createRegionSchema,
    updateRegionSchema,
    regionParamSchema
} = require('../validators/location');

const router = express.Router();

// Canonical State -> District -> Region master, shared by Lead requirements,
// Projects and Property matching. Reads are open to any authenticated role;
// `?q=` filters names server-side. Regions are admin-manageable (the only
// writable level); states/districts always come from the verified master.
router.use(requireAuth());

router.get('/states', validate(searchQuerySchema), getStates);
router.get('/states/:stateId/districts', validate(stateSearchSchema), getDistricts);
router.get('/districts/:districtId/regions', validate(districtSearchSchema), getRegions);

const requireAdmin = requireRole(['SUPER_ADMIN', 'ADMIN']);

router.post('/regions', requireAdmin, validate(createRegionSchema), createRegion);
router.patch('/regions/:regionId', requireAdmin, validate(updateRegionSchema), updateRegion);
router.delete('/regions/:regionId', requireAdmin, validate(regionParamSchema), deleteRegion);

module.exports = router;
