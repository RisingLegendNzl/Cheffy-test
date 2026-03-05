// --- api/plan/helpers/utils.js ---
// Extracted from generate-full-plan.js (refactor-only, no logic changes)
// Contains: delay, getSanitizedFormData, concurrentlyMap

// --- Other Helpers ---
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function getSanitizedFormData(formData) {
    try {
        if (!formData || typeof formData !== 'object') return { error: "Invalid form data received." };
        // Redact PII
        const { name, height, weight, age, bodyFat, ...rest } = formData;
        return { ...rest, user_profile: "[REDACTED]" };
    } catch (e) { return { error: "Failed to sanitize form data." }; }
}

async function concurrentlyMap(array, limit, asyncMapper) {
    const results = [];
    const executing = [];
    for (const item of array) {
        const promise = asyncMapper(item)
            .then(result => {
                // Remove this promise from the executing list once it's done
                const index = executing.indexOf(promise);
                if (index > -1) executing.splice(index, 1);
                return result;
            })
            .catch(error => {
                // Handle errors gracefully
                console.error(`Error in concurrentlyMap item "${item?.originalIngredient || item?.name || 'unknown'}":`, error);
                const index = executing.indexOf(promise);
                if (index > -1) executing.splice(index, 1);
                // Return an error object to be handled by the caller
                return { _error: true, message: error.message || 'Unknown concurrent map error', itemKey: item?.originalIngredient || item?.name || 'unknown' };
            });
        executing.push(promise);
        results.push(promise);
        if (executing.length >= limit) {
            // Wait for at least one promise to resolve before adding more
            await Promise.race(executing);
        }
    }
    return Promise.all(results).then(res => res.filter(r => r != null)); // Filter out null/undefined results
}

module.exports = {
    delay,
    getSanitizedFormData,
    concurrentlyMap,
};
