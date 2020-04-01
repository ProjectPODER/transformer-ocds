import slug from 'slug';
import isNull from 'lodash.isnull';
import camelCase from 'lodash.camelcase';
import launder from 'company-laundry';
const removeDiacritics = require('diacritics').remove;
import _ from 'lodash';

function simpleName(string) {
    return removeDiacritics(string)
        .replace(/[,.]/g, '') // remove commas and periods
        .toLowerCase();
}

export function dateToISOString(string) {
    var year = '';
    var month = '';
    var day = '';
    const [ date, time ] = string.split(' ');

    if(date.indexOf('-') > -1) {
        [ year, month, day ] = date.split('-');
    }
    else {
        [ day, month, year ] = date.split('/');
    }

    if (time) {
        const [ hour, minute, second ] = time.split(':');
        if (second) {
            return new Date(Date.UTC(year, (+month -1), day, hour, minute, second)).toISOString();
        }
        return new Date(Date.UTC(year, (+month -1), day, hour, minute)).toISOString();
    }
    return new Date(Date.UTC(year, (+month -1), day)).toISOString();
}

function nP2Ocid(string) {
    // NUMERO_CONCURSO to OCID
    return `PODER-GT-${string}`
}

function orgObject(name, id='') {
    // doc is an organization
    if (name) {
        const o = {
            name: name,
            // id: slug(name, { lower: true }),
            id: (id != '')? id : simpleName(launder(name)),
        };
        return o;
    }
}

export function tenderProcurementMethod(string) {
    switch (string) {
        case 'Cotización (Art. 38 LCE)':
        case 'Licitación Pública (Art. 17 LCE)':
            return 'open';
        case 'Adquisición Directa por Ausencia de Oferta (Art. 32 LCE)':
        case 'Compra Directa con Oferta Electrónica (Art. 43 LCE Inciso b)':
        case 'Convenios y Tratados Internacionales (Art. 1 LCE)':
        case 'Procedimientos Regulados por el artículo 44 LCE (Casos de Excepción)':
            return 'direct';
    }
}

export function tenderMainProcurementCategory(string) {
    switch (string) {
      case 'Salud e insumos hospitalarios':
      default:
        return 'goods';
    }
}

export function tenderObject(contract) {
    const document = {
        id: contract.NUMERO_CONCURSO,
        title: contract.DESCRIPCION,
        description: contract.SIGLAS + ' - ' + contract.ARV,
        status: 'complete', // Aquí hay que armar una función que devuelva lo apropiado según contract.ESTATUS_CONCURSO
        procurementMethod: tenderProcurementMethod(contract.MODALIDAD),
        procurementMethodDetails: contract.MODALIDAD + ((contract.hasOwnProperty('SUB_MODALIDAD'))? ' - ' + contract.SUBMODALIDAD : ''),
        procuringEntity: orgObject(contract.ENTIDAD_COMPRADORA),
    };

    if (contract.CATEGORIA) {
        Object.assign(document, {
            mainProcurementCategory: tenderMainProcurementCategory(contract.CATEGORIA),
            additionalProcurementCategories: contract.CATEGORIA,
        })
    }

    if (contract.FECHA_PUBLICACION) {
        const tenderPeriod = {};
        if (contract.FECHA_PUBLICACION) {
            Object.assign(tenderPeriod, {
                startDate: dateToISOString(contract.FECHA_PUBLICACION),
            })
        }
        if (contract.FECHA_ADJUDICACION) {
            Object.assign(tenderPeriod, {
                endDate: dateToISOString(contract.FECHA_ADJUDICACION),
            })
        }
        else {
            Object.assign(tenderPeriod, {
                endDate: dateToISOString(contract.FECHA_PUBLICACION),
            })
        }
        Object.assign(document, { tenderPeriod });
    }
    return document;
}

function awardObject(contract) {
    let date, status = null;
    if (contract.FECHA_ADJUDICACION != '') {
        date = dateToISOString(contract.FECHA_ADJUDICACION);
    }
    else {
        date = dateToISOString(contract.FECHA_PUBLICACION);
    }
    status = 'active';

    const suppliers = [
        orgObject(contract.NOMBRE_PROVEEDOR, contract.NIT),
    ];

    return {
        title: contract.DESCRIPCION,
        description: contract.SIGLAS + ' - ' + contract.ARV,
        suppliers: suppliers,
        date,
        status,
        id: 1, // FIXME uniq per release, overwrite on import,
        value: {
            amount: contract.MONTO,
            currency: 'GTQ',
        },
        items: [ itemsObject(contract) ]
    };
}

function itemsObject(contract) {
    return {
        id:1,
        description: contract.ARV,
        quantity: contract.CANTIDAD_MULTIPLICADA,
        unit: contract.UNIDAD_MEDIDA,
        unit_price: contract.PRECIO_UNITARIO
    }
}

export function contractStatus(string) {
  switch (string) {
    case 'Terminado adjudicado':
    default:
        return 'active';
  }
}

export function contractObject(contract) {
    let date = null;
    if (contract.FECHA_ADJUDICACION != '') {
        date = dateToISOString(contract.FECHA_ADJUDICACION);
    }
    else {
        date = dateToISOString(contract.FECHA_PUBLICACION);
    }

    const contractObj = {
        status: contractStatus(contract.ESTATUS_CONCURSO),
        statusGuatecompras: contract.ESTATUS_CONCURSO,
        title: contract.DESCRIPCION,
        description: contract.SIGLAS + ' - ' + contract.ARV,
        ocid: nP2Ocid(contract.NUMERO_CONCURSO),
        id: contract.NUMERO_CONCURSO,
        awardID: 1,
        items: [ itemsObject(contract) ],
        period: {
            startDate: date
        },
        value: {
            amount: contract.MONTO,
            currency: 'GTQ',
        },
    };

    if(date != null) {
        Object.assign(contractObj, { dateSigned: date });
    }

    return contractObj;
}

export function supplierPartyObject(contract) {
    const name = contract.NOMBRE_PROVEEDOR;
    const party = {
        name: name,
        id: contract.NIT,
        roles: 'supplier',
        identifier: {
            id: contract.NIT,
            legalName: name,
        },
    }
    return party;
}

function buyerObject(contract) {
    const partyName = contract.UNIDAD_COMPRADORA;
    return {
        name: partyName,
        id: simpleName(launder(partyName)),
    }
}

export function buyerPartyObject(contract) {
    const parent = contract.ENTIDAD_COMPRADORA;
    const party = {
        role: 'buyer',
    }
    const partyName = contract.UNIDAD_COMPRADORA;
    return Object.assign(party, {
        parent: contract.ENTIDAD_COMPRADORA,
        id: simpleName(launder(partyName)),
        name: partyName,
        govLevel: 'country',
        address: {
            countryName: 'Guatemala',
        },
        memberOf: {
            name: parent,
            id: simpleName(launder(parent))
        },
    });
}

function getParties(contract) {
    const array = [
        buyerPartyObject(contract),
        supplierPartyObject(contract),
    ];

    return array.filter(o => (o.name));
}

export function releaseObject({contract, metadata}) {
    // doc is a contract
    if (!contract.NUMERO_CONCURSO) {
        return {};
    }
    const parties = getParties(contract);
    let source = '';
    if (contract.URL) {
        source = contract.URL;
    }

    const release = {
        ocid: nP2Ocid(contract.NUMERO_CONCURSO), // ---
        id: contract.NUMERO_CONCURSO, // ---
        initiationType: 'tender',
        source: source,
        tag: 'award',
        language: 'es',
        parties,
        buyer: buyerObject(contract),
        tender: tenderObject(contract),
        awards: [
            awardObject(contract),
        ],
        contracts: [
            contractObject(contract),
        ],
    };

    if (metadata && metadata.httpLastModified) {
        const date = new Date(metadata.httpLastModified).toISOString();
        Object.assign(release, { date });
    }
    return release;
}

export function releasePackage({release, metadata}) {
    const publisher = {
        name: 'PODER',
        scheme: 'poder-scheme',
        uid: null,
    }
    if (metadata && metadata.publisherUri) {
        Object.assign(publisher, { uri: metadata.publisherUri });
    }
    return {
        uri: `http://api.quienesquien.wiki/releases/${release.ocid}`,
        version: '1.1',
        publishedDate: new Date().toISOString(),
        extensions: [
            'https://raw.githubusercontent.com/open-contracting/ocds_budget_breakdown_extension/master/extension.json',
            'https://raw.githubusercontent.com/open-contracting/ocds_multiple_buyers_extension/master/extension.json',
            'https://raw.githubusercontent.com/open-contracting/ocds_partyDetails_scale_extension/master/extension.json',
            'https://raw.githubusercontent.com/open-contracting/ocds_process_title_extension/v1.1.1/extension.json',
            'https://raw.githubusercontent.com/kyv/ocds-quienesquienwiki-compranet/master/extension.json',
        ],
        releases: [
            release,
        ],
        publisher,
        license:'https://creativecommons.org/licenses/by-sa/4.0/',
        publicationPolicy:'https://github.com/open-contracting/sample-data/',
    }
}
