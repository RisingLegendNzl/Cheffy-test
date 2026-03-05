// --- api/plan/helpers/logger.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: createLogger factory (SSE-aware for Batched Plan)

// --- Logger (SSE Aware for Batched Plan) ---
function createLogger(run_id, responseStream = null) {
    const logs = [];
    
    /**
     * Writes a Server-Sent Event (SSE) to the response stream.
     * CHANGE 2: Make `writeSseEvent` resilient to disconnection
     * @param {string} eventType - The event type (e.g., 'message', 'finalData').
     * @param {object} data - The JSON-serializable data payload.
     */
    const writeSseEvent = (eventType, data) => {
        // Skip writes if the client has disconnected or stream is ended.
        // CRITICAL: Do NOT call responseStream.end() here — that would
        // terminate the serverless function and prevent the pipeline from
        // completing.
        if (!responseStream || responseStream.writableEnded) return;
        try {
            responseStream.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (e) {
            // Stream write failed (client disconnected, etc.)
            // Do NOT call responseStream.end() — let the pipeline finish.
            console.warn(`[SSE Logger] writeSseEvent failed for event '${eventType}': ${e.message}`);
        }
    };

    /**
     * Core logging function.
     */
    const log = (message, level = 'INFO', tag = 'SYSTEM', data = null) => {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                run_id: run_id,
                level: level.toUpperCase(),
                tag: tag.toUpperCase(),
                message,
                data: data ? JSON.parse(JSON.stringify(data, (key, value) =>
                    (typeof value === 'string' && value.length > 200) ? value.substring(0, 200) + '...' : value
                )) : null
            };
            logs.push(logEntry);
            
            // Console output
            const time = new Date(logEntry.timestamp).toLocaleTimeString('en-AU', { hour12: false, timeZone: 'Australia/Brisbane' });
            console.log(`${time} [${logEntry.level}] [${logEntry.tag}] ${logEntry.message}`);
            if (data && level !== 'DEBUG') {
                 try {
                     const truncatedData = JSON.stringify(data, (k, v) => typeof v === 'string' && v.length > 150 ? v.substring(0, 150) + '...' : v, 2);
                     console.log("  Data:", truncatedData.length > 500 ? truncatedData.substring(0, 500) + '...' : truncatedData);
                 } catch { console.log("  Data: [Serialization Error]"); }
             }
            
            // Send log over SSE
            writeSseEvent('log_message', logEntry);
            
            return logEntry;
        } catch (error) {
             // Fallback if logging itself fails
             const fallbackEntry = { timestamp: new Date().toISOString(), run_id: run_id, level: 'ERROR', tag: 'LOGGING', message: `Log serialization failed: ${message}`, data: { error: error.message }}
             logs.push(fallbackEntry);
             console.error(JSON.stringify(fallbackEntry));
             // Try to send this critical error over SSE
             writeSseEvent('log_message', fallbackEntry);
             return fallbackEntry;
        }
    };

    /**
     * Logs a critical error, sends an 'error' event, and closes the stream.
     * CHANGE 7: Update `logErrorAndClose` similarly
     * @param {string} errorMessage - The final error message.
     * @param {string} [errorCode="SERVER_FAULT_PLAN"] - A machine-readable error code.
     */
    const logErrorAndClose = (errorMessage, errorCode = "SERVER_FAULT_PLAN") => {
        log(errorMessage, 'CRITICAL', 'SYSTEM');
        writeSseEvent('error', {
            code: errorCode,
            message: errorMessage
        });
        if (responseStream && !responseStream.writableEnded) {
            try { responseStream.end(); } catch (e) {
                console.warn("[SSE Logger] Error closing stream after error event:", e.message);
            }
        }
    };
    
    /**
     * Sends the final 'plan:complete' event and closes the stream.
     * CHANGE 6: Update `sendFinalDataAndClose` to handle disconnected client
     * @param {object} data - The final plan data payload.
     */
    const sendFinalDataAndClose = (data) => {
        log(`Generation complete, sending final payload and closing stream.`, 'INFO', 'SYSTEM');
        // Attempt to send the final event — will no-op if client is gone
        // (thanks to the updated writeSseEvent from Change 2).
        writeSseEvent('plan:complete', data);
        // Now close the stream.  This is safe even if the client is gone.
        if (responseStream && !responseStream.writableEnded) {
            try { responseStream.end(); } catch (e) {
                console.warn("[SSE Logger] Error closing stream after final data:", e.message);
            }
        }
    };
    
    /**
     * Sends a generic SSE event.
     * @param {string} eventType - The event name.
     * @param {object} data - The JSON-serializable data payload.
     */
    const sendEvent = (eventType, data) => {
        writeSseEvent(eventType, data);
    };

    // [FIX] Explicitly define getLogs as a function returning the logs array
    return { log, getLogs: () => logs, logErrorAndClose, sendFinalDataAndClose, sendEvent };
}
// --- End Logger ---

module.exports = { createLogger };
