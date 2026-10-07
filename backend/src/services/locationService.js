const prisma = require('../db/prisma');
const { AppError } = require('../utils/errors');

// Canonical location hierarchy access (State -> District -> Region).
// Read APIs for CRM users + shared validation used by Lead requirements and
// Project locations so both areas use exactly one location system.
class LocationService {
    static nameFilter(q) {
        const term = String(q || '').trim();
        return term ? { name: { contains: term, mode: 'insensitive' } } : {};
    }

    static async getStates(q) {
        return await prisma.locationState.findMany({
            where: this.nameFilter(q),
            orderBy: { name: 'asc' },
            select: { id: true, code: true, name: true }
        });
    }

    static async getDistricts(stateId, q) {
        const state = await prisma.locationState.findFirst({
            where: { id: stateId },
            select: { id: true }
        });
        if (!state) throw new AppError('State not found', 404, 'NOT_FOUND');

        return await prisma.locationDistrict.findMany({
            where: { stateId, ...this.nameFilter(q) },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, stateId: true }
        });
    }

    static async getRegions(districtId, q) {
        const district = await prisma.locationDistrict.findFirst({
            where: { id: districtId },
            select: { id: true }
        });
        if (!district) throw new AppError('District not found', 404, 'NOT_FOUND');

        return await prisma.locationRegion.findMany({
            where: { districtId, ...this.nameFilter(q) },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, districtId: true }
        });
    }

    static async assertDistrict(districtId) {
        const district = await prisma.locationDistrict.findFirst({
            where: { id: districtId },
            select: { id: true }
        });
        if (!district) throw new AppError('District not found', 404, 'NOT_FOUND');
    }

    static async assertRegionFree(districtId, name, excludeId = null) {
        const clash = await prisma.locationRegion.findFirst({
            where: {
                districtId,
                name: { equals: name, mode: 'insensitive' },
                ...(excludeId ? { id: { not: excludeId } } : {})
            },
            select: { id: true }
        });
        if (clash) throw new AppError('A region with this name already exists in this district', 409, 'DUPLICATE');
    }

    // Regions are the only level admins can manage directly; states and
    // districts always come from the verified master dataset.
    static async createRegion(districtId, rawName) {
        const name = String(rawName || '').trim();
        await this.assertDistrict(districtId);
        await this.assertRegionFree(districtId, name);
        try {
            return await prisma.locationRegion.create({
                data: { districtId, name },
                select: { id: true, name: true, districtId: true }
            });
        } catch (error) {
            if (error.code === 'P2002') {
                throw new AppError('A region with this name already exists in this district', 409, 'DUPLICATE');
            }
            throw error;
        }
    }

    static async updateRegion(regionId, rawName) {
        const name = String(rawName || '').trim();
        const region = await prisma.locationRegion.findFirst({
            where: { id: regionId },
            select: { id: true, districtId: true }
        });
        if (!region) throw new AppError('Region not found', 404, 'NOT_FOUND');
        await this.assertRegionFree(region.districtId, name, regionId);
        try {
            return await prisma.locationRegion.update({
                where: { id: regionId },
                data: { name },
                select: { id: true, name: true, districtId: true }
            });
        } catch (error) {
            if (error.code === 'P2002') {
                throw new AppError('A region with this name already exists in this district', 409, 'DUPLICATE');
            }
            throw error;
        }
    }

    static async deleteRegion(regionId) {
        const region = await prisma.locationRegion.findFirst({
            where: { id: regionId },
            select: { id: true, name: true }
        });
        if (!region) throw new AppError('Region not found', 404, 'NOT_FOUND');

        const [leadRefs, projectRefs] = await Promise.all([
            prisma.leadPreferredLocation.count({ where: { regionId } }),
            prisma.project.count({ where: { regionId } })
        ]);
        if (leadRefs > 0 || projectRefs > 0) {
            throw new AppError(
                `Region "${region.name}" is used by ${leadRefs} lead location(s) and ${projectRefs} project(s) and cannot be deleted`,
                409,
                'REGION_IN_USE'
            );
        }

        await prisma.locationRegion.delete({ where: { id: regionId } });
        return { id: regionId, name: region.name };
    }

    /**
     * Validates hierarchical selections against the canonical master.
     * Each row: { stateId, districtId?, regionId? }.
     * - district must belong to the state
     * - region requires a district and must belong to that district
     * Returns normalized rows (ids + display names, nulls for unset levels).
     */
    static async validateSelections(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return [];

        const stateIds = [...new Set(rows.map((r) => r && r.stateId).filter(Boolean))];
        const districtIds = [...new Set(rows.map((r) => r && r.districtId).filter(Boolean))];
        const regionIds = [...new Set(rows.map((r) => r && r.regionId).filter(Boolean))];

        const [states, districts, regions] = await Promise.all([
            stateIds.length
                ? prisma.locationState.findMany({
                    where: { id: { in: stateIds } },
                    select: { id: true, name: true }
                })
                : [],
            districtIds.length
                ? prisma.locationDistrict.findMany({
                    where: { id: { in: districtIds } },
                    select: { id: true, name: true, stateId: true }
                })
                : [],
            regionIds.length
                ? prisma.locationRegion.findMany({
                    where: { id: { in: regionIds } },
                    select: { id: true, name: true, districtId: true }
                })
                : []
        ]);

        const stateMap = new Map(states.map((s) => [s.id, s]));
        const districtMap = new Map(districts.map((d) => [d.id, d]));
        const regionMap = new Map(regions.map((r) => [r.id, r]));

        const normalized = [];
        const seen = new Set();

        for (const row of rows) {
            if (!row || !row.stateId || !stateMap.has(row.stateId)) {
                throw new AppError('Location state is not part of the location master', 400, 'INVALID_LOCATION');
            }
            const state = stateMap.get(row.stateId);

            let district = null;
            if (row.districtId) {
                district = districtMap.get(row.districtId);
                if (!district) {
                    throw new AppError('Location district is not part of the location master', 400, 'INVALID_LOCATION');
                }
                if (district.stateId !== row.stateId) {
                    throw new AppError('Location district does not belong to the selected state', 400, 'INVALID_LOCATION');
                }
            }

            let region = null;
            if (row.regionId) {
                if (!row.districtId) {
                    throw new AppError('A region selection requires a district', 400, 'INVALID_LOCATION');
                }
                region = regionMap.get(row.regionId);
                if (!region) {
                    throw new AppError('Location region is not part of the location master', 400, 'INVALID_LOCATION');
                }
                if (region.districtId !== row.districtId) {
                    throw new AppError('Location region does not belong to the selected district', 400, 'INVALID_LOCATION');
                }
            }

            const entry = {
                stateId: row.stateId,
                districtId: row.districtId || null,
                regionId: row.regionId || null,
                stateName: state.name,
                districtName: district ? district.name : null,
                regionName: region ? region.name : null
            };

            const key = `${entry.stateId}|${entry.districtId || ''}|${entry.regionId || ''}`;
            if (!seen.has(key)) {
                seen.add(key);
                normalized.push(entry);
            }
        }

        return normalized;
    }
}

module.exports = LocationService;
