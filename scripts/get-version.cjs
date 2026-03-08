const path = require('path');
const pkg = require(path.resolve(__dirname, '..', 'package.json'));
console.log(pkg.version);
