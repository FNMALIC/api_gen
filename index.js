const { generate, watch } = require('./lib/generate');
const { loadSpec, buildModels } = require('./lib/spec');

module.exports = {
    generate,
    watch,
    loadSpec,
    buildModels,
};
