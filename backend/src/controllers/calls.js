const { asyncHandler, AppError } = require('../utils/errors');
const CallService = require('../services/callService');

const getStatus = asyncHandler(async (req, res) => {
    const data = await CallService.getStatus();
    res.status(200).json({ success: true, data, message: 'Telephony status fetched' });
});

const initiateCall = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const call = await CallService.initiateCall(req.body.leadId, req.body, organizationId, userId, role);
    res.status(201).json({ success: true, data: call, message: 'Call initiated' });
});

const hangupCall = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const call = await CallService.hangupCall(req.params.id, organizationId, userId, role);
    res.status(200).json({ success: true, data: call, message: 'Call ended' });
});

const recordOutcome = asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = req.auth;
    const result = await CallService.recordOutcome(req.params.id, req.body, organizationId, userId, role);
    res.status(200).json({ success: true, data: result, message: 'Call outcome recorded' });
});

const listCalls = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const result = await CallService.listCalls(organizationId, req.query, role, userId);
    res.status(200).json({ success: true, data: result, message: 'Calls fetched successfully' });
});

const getCallById = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const call = await CallService.getCallById(req.params.id, organizationId, role, userId);
    res.status(200).json({ success: true, data: call, message: 'Call fetched successfully' });
});

const getRecording = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const data = await CallService.getRecording(req.params.id, organizationId, role, userId, { download: false });
    res.status(200).json({ success: true, data, message: 'Recording metadata fetched' });
});

// Proxies provider recording bytes under RBAC + audit. The provider URL
// is never exposed to the client.
const streamRecording = asyncHandler(async (req, res) => {
    const { organizationId, role, userId } = req.auth;
    const url = await CallService.getRecordingUrl(req.params.id, organizationId, role, userId);

    let upstream;
    try {
        upstream = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch {
        throw new AppError('Recording is unavailable from the provider', 502, 'PROVIDER_ERROR');
    }
    if (!upstream.ok) {
        throw new AppError('Recording is unavailable from the provider', 502, 'PROVIDER_ERROR');
    }

    res.status(200);
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
});

module.exports = {
    getStatus,
    initiateCall,
    hangupCall,
    recordOutcome,
    listCalls,
    getCallById,
    getRecording,
    streamRecording
};
