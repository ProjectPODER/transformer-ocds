import slug from 'slug';
import isNull from 'lodash.isnull';
import camelCase from 'lodash.camelcase';
const laundry = require('company-laundry');
import _ from 'lodash';

function repairDate(string) {
    var [ date, time ] = string.split(' ');
    var [ month, day, year ] = date.split('/');

    if(year.length == 2) year = '20' + year;
    return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + ((time)? ' ' + time : '');
}

export function dateToISOString(string) {
  if(string.indexOf('/') >= 0) string = repairDate(string);
  const [ date, time ] = string.split(' ');
  const [ year, month, day ] = date.split('-');
  if (time) {
    const [ hour, minute, second ] = time.split(':');
    if (second) {
      return new Date(Date.UTC(year, (+month -1), day, hour, minute, second)).toISOString();
    }
    // console.log(year, (+month -1), day, hour, minute);
    return new Date(Date.UTC(year, (+month -1), day, hour, minute)).toISOString();
  }
  return new Date(Date.UTC(year, (+month -1), day)).toISOString();

}

function fixAmount(amount) {
    if(typeof amount === 'string')
        return amount.replace(/[$,]/g, '');
    else
        return amount;
}

function nP2Ocid(string) {
  // NUMERO_PROCEDIMIENTO to OCID
  return `ocds-0ud2q6-${string}`
}

function orgObject(name) {
    // doc is an organization
    if (name) {
        let laundered = laundry.launder(name);
        const o = {
            name: name,
            id: laundry.simpleName(laundered),
        };
        return o;
    }
}

function organizationReferenceObject(string) {
    let laundered = laundry.launder(string);
    let simple = laundry.simpleName(laundered);
    return {
        name: string,
        uri: `https://www.quienesquien.wiki/orgs/${simple}`,
    };
}

export function tenderProcurementMethod(string) {
  switch (string) {
    case 'Invitación a Cuando Menos 3 Personas':
        return 'limited';
    case 'Adjudicación Directa Federal':
    case 'Convenio':
        return 'direct';
    case 'Licitación Pública':
        return 'open';
  }
}

export function tenderMainProcurementCategory(string) {
  switch (string) {
    case 'Adquisiciones':
    case 'Arrendamientos':
      return 'goods';
    case 'Obra Pública':
    case 'Servicios Relacionados con la OP':
      return 'works';
    case 'Servicios':
      return 'services';
  }
}

export function tenderObject(contract) {
    let nombreDependencia = contract.CONTRACT_DEPENDENCY_STRING;
    if(typeof nombreDependencia === 'number') nombreDependencia = nombreDependencia.toString();

    const document = {
        id: contract.CONTRACT_NUM_PROC_STRING.toString(),
        title: contract.CONTRACT_TITLE_STRING,
        status: 'complete',
        procuringEntity: {
            id: laundry.simpleName(laundry.launder(nombreDependencia)),
            name: nombreDependencia,
        }
    };

    if (contract.CONTRACT_TYPE_PROC_STRING) {
        Object.assign(document, {
            procurementMethod: tenderProcurementMethod(contract.CONTRACT_TYPE_PROC_STRING),
            procurementMethodDetails: contract.CONTRACT_TYPE_PROC_STRING,
        })
    }

    if (contract.CONTRACT_TYPE_STRING) {
        Object.assign(document, {
            mainProcurementCategory: tenderMainProcurementCategory(contract.CONTRACT_TYPE_STRING),
            procurementCategoryMxCnet: [contract.CONTRACT_TYPE_STRING],
        })
    }

    return document;
}

function awardObject(contract) {
    let supplierName = contract.CONTRACT_PROVIDER_ORG_STRING? contract.CONTRACT_PROVIDER_ORG_STRING : contract.CONTRACT_PROVIDER_PERSON_STRING;
    const suppliers = [
        orgObject(supplierName),
    ];

    let documents = [];
    if (contract.URL_DEL_CONTRATO) {
        documents.push( {
            id: 'doc-tdc-' + contract.CONTRACT_NUM_PROC_STRING.toString() + '-1',
            documentType: 'awardNotice',
            url: contract.CONTRACT_REFERENCES_STRING.replace('funcionpublica', 'hacienda'),
            format: 'text/html',
            language: 'es'
        } );
    }

    return {
        title: contract.CONTRACT_TITLE_STRING,
        suppliers: suppliers,
        status: 'active',
        id: contract.CONTRACT_NUM_PROC_STRING.toString(),
        value: {
            amount: parseFloat(fixAmount(contract.CONTRACT_AMOUNT_STRING)),
            currency: 'MXN',
        },
        documents: documents
    };
}

export function contractObject(contract) {
    let date = null;

    const contractObj = {
        status: 'terminated',
        title: contract.CONTRACT_TITLE_STRING,
        id: contract.CONTRACT_NUM_PROC_STRING.toString(),
        awardID: contract.CONTRACT_NUM_PROC_STRING.toString(),
        value: {
            amount: parseFloat(fixAmount(contract.CONTRACT_AMOUNT_STRING)),
            currency: 'MXN',
        }
    };

    if(date != null) {
        Object.assign(contractObj, { dateSigned: date });
    }

    return contractObj;
}

export function supplierPartyObject(contract) {
    // If ORG_STRING field has value, the supplier is an org. Otherwise it is a person
    const name = contract.CONTRACT_PROVIDER_ORG_STRING ? contract.CONTRACT_PROVIDER_ORG_STRING : contract.CONTRACT_PROVIDER_PERSON_STRING;
    const party = {
        name: name,
        id: laundry.simpleName(laundry.launder(name)),
        roles: ['supplier'],
        details: {
            type: contract.CONTRACT_PROVIDER_ORG_STRING ? 'company' : 'person'
        }
    }

    if(contract.CONTRACT_PROVIDER_ORG_STRING && (contract.ORG_OTHER_NAMES_ARRAY || contract.ORG_INITIALS_STRING)) {
        let otherNames = [];
        if(contract.ORG_OTHER_NAMES_ARRAY) otherNames.push(...contract.ORG_OTHER_NAMES_ARRAY.split(';'));
        if(contract.ORG_INITIALS_STRING) otherNames.push(contract.ORG_INITIALS_STRING);

        let additionalIdentifiers = [];
        otherNames.map( (otherName) => {
            additionalIdentifiers.push( {
                id: laundry.simpleName(laundry.launder(otherName)),
                legalName: otherName
            } );
        } );
        Object.assign(party, { additionalIdentifiers: additionalIdentifiers });
    }

    if(contract.CONTRACT_PROVIDER_ORG_STRING && (contract.ORG_COUNTRY_STRING || contract.ORG_STATE_STRING || contract.ORG_CITY_STRING || contract.ORG_ZONE_STRING || contract.ORG_STREET_STRING || contract.ORG_ZIPCODE_STRING)) {
        let address = {};
        if(contract.ORG_COUNTRY_STRING) address.countryName = contract.ORG_COUNTRY_STRING;
        if(contract.ORG_STATE_STRING) address.region = contract.ORG_STATE_STRING;
        if(contract.ORG_CITY_STRING) address.locality = contract.ORG_CITY_STRING;
        if(contract.ORG_STREET_STRING || contract.ORG_ZONE_STRING) {
            address.locality = contract.ORG_STREET_STRING + ((contract.ORG_STREET_STRING && contract.ORG_ZONE_STRING)? ', ' : '') + contract.ORG_ZONE_STRING;
        }
        if(contract.ORG_ZIPCODE_STRING) address.postalCode = contract.ORG_ZIPCODE_STRING.toString();
        Object.assign(party, { address: address });
    }

    if(contract.CONTRACT_PROVIDER_ORG_STRING && (contract.ORG_PHONES_ARRAY || contract.ORG_WEBSITE_STRING || contract.ORG_EMAILS_ARRAY)) {
        let contactPoint = {};
        contactPoint.name = contract.CONTRACT_PROVIDER_ORG_STRING;
        if(contract.ORG_PHONES_ARRAY) contactPoint.telephone = contract.ORG_PHONES_ARRAY;
        if(contract.ORG_WEBSITE_STRING) contactPoint.url = contract.ORG_WEBSITE_STRING;
        if(contract.ORG_EMAILS_ARRAY) contactPoint.email = contract.ORG_EMAILS_ARRAY;
        Object.assign(party, { contactPoint: contactPoint });
    }

    return party;
}

function buyerObject(contract) {
    const partyName = contract.CONTRACT_DEPENDENCY_STRING;
    return {
        name: contract.CONTRACT_DEPENDENCY_STRING,
        id: laundry.simpleName(laundry.launder(partyName))
    }
}

export function buyerPartyObject(contract) {
    const party = {
        roles: ['buyer'],
    }

    // Corregir el caso en el que NOMBRE_DE_LA_UC viene como un número
    let nombreDependencia = contract.CONTRACT_DEPENDENCY_STRING;
    if(typeof nombreDependencia === 'number') nombreDependencia = nombreDependencia.toString();
    const partyName = nombreDependencia;

    return Object.assign(party, {
        id: laundry.simpleName(laundry.launder(partyName)),
        name: nombreDependencia,
        address: {
            countryName: 'Mexico',
        },
        memberOf: [
            {
              name: nombreDependencia,
              id: laundry.simpleName(laundry.launder(partyName)),
              initials: contract.SIGLAS
            }
        ],
        details: {
            type: 'institution',
            classification: 'dependencia'
        }
    });

}

function getParties(contract) {
    const array = [
        buyerPartyObject(contract),
        supplierPartyObject(contract),
    ];

    return array.filter(o => (o.name));
}

function releaseTags(contract) {
    return 'contract';
}

export function releaseObject({contract, metadata}) {
    // doc is a contract
    if (!contract.CONTRACT_NUM_PROC_STRING) {
        return {};
    }
    const parties = getParties(contract);

    const release = {
        ocid: nP2Ocid(contract.CONTRACT_NUM_PROC_STRING),
        id: contract.CONTRACT_NUM_PROC_STRING.toString(),
        initiationType: 'tender',
        tag: [ releaseTags(contract) ],
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
        publisher: {
            name: "Secretaria de la Funcion Publica",
            uri: "https://datos.gob.mx/"
        }
    };

    if (metadata && metadata.httpLastModified) {
        const date = new Date(metadata.httpLastModified).toISOString();
        Object.assign(release, { date });
    }
    if (metadata && metadata.dataSource) {
        const dataSource = { id: metadata.dataSource };
        const dataSourceRun = { id: metadata.dataSourceRun };
        Object.assign(release, { source: [ dataSource ], sourceRun: [ dataSourceRun ] });
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
