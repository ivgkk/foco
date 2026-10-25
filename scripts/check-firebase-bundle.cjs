const { buildFirebase } = require('./build-firebase.cjs');
buildFirebase(true).catch(error => { console.error(error.message); process.exitCode = 1; });
