const fs = require('fs');
const parse = require('csv-parse/lib/sync');

function buildExchangeRatesList(paths) {
    if(paths.length > 0) {
        let lines = [];
        paths.map( (path) => {
            chainCSV(lines, path);
        } );

        return linesToObj(lines);
    }
    return null;
}

function linesToObj(lines) {
    let obj = {}
    lines.map( (line) => {
        let baseKey = line[0] + '-' + line[1];
        if(!obj.hasOwnProperty(baseKey)) obj[baseKey] = {};
        obj[baseKey][line[2]] = line[3];
    } );

    return obj;
}

function chainCSV(acc, file) {
    let rawdata = fs.readFileSync(file);
    let lines = parse(rawdata, {
      skip_empty_lines: true,
      relax_column_count: true
    });

    acc.push(...lines);
}

module.exports = buildExchangeRatesList;
