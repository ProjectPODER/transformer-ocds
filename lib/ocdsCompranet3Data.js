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
    return amount.replace(/[$,]/g, '');
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
    case 'Invitacion a 3':
        return 'limited';
    case 'Adjudicacion Directa':
        return 'direct';
    case 'Licitación Pública':
    default:
        return 'open';
  }
}

export function tenderMainProcurementCategory(string) {
  switch (string) {
    case 'Adquisiciones':
    case 'Arrendamientos':
      return 'goods';
    case 'Obra Publica':
    case 'Servicios Relacionados con la OP':
      return 'works';
    case 'Servicios':
      return 'services';
  }
}

export function tenderObject(contract) {
  let nombreUCStr = contract.NOMBRE_UC;
  if(typeof nombreUCStr === 'number') nombreUCStr = nombreUCStr.toString();

  const document = {
    id: contract.NUMERO_DE_PROCEDIMIENTO.toString(),
    title: contract.REFERENCIA_DE_LA_CONTRATACION,
    status: 'complete',
    procuringEntity: {
        id: laundry.simpleName(laundry.launder(nombreUCStr)) + '-' + laundry.simpleName(laundry.launder(contract.DEPENDENCIA_ENTIDAD)),
        name: nombreUCStr,
    },
    procurementMethodCharacterMxCnet: contract.CARACTER
  };
  if (contract.TIPO_DE_PROCEDIMIENTO) {
    Object.assign(document, {
      procurementMethod: tenderProcurementMethod(contract.TIPO_DE_PROCEDIMIENTO),
      procurementMethodDetails: contract.TIPO_DE_PROCEDIMIENTO,
    })
  }
  if (contract.TIPO_CONTRATACION) {
    Object.assign(document, {
      mainProcurementCategory: tenderMainProcurementCategory(contract.TIPO_CONTRATACION),
      procurementCategoryMxCnet: [contract.TIPO_CONTRATACION],
    })
  }

  return document;
}

function awardObject(contract) {
  const suppliers = [
    orgObject(contract.RAZON_SOCIAL),
  ];

  let documents = [];
  if (contract.URL_DEL_CONTRATO) {
      documents.push( {
          id: 'doc-compranet3-' + contract.NUMERO_DE_CONTRATO.toString() + '-1',
          documentType: 'awardNotice',
          url: contract.URL_DEL_CONTRATO,
          format: 'text/html',
          language: 'es'
      } )
  }

  return {
    title: contract.REFERENCIA_DE_LA_CONTRATACION,
    suppliers: suppliers,
    status: 'active',
    id: contract.NUMERO_DE_CONTRATO.toString(),
    value: {
      amount: parseFloat(fixAmount(contract.IMPORTE_MN_SIN_IVA)),
      currency: 'MXN',
    },
    documents: documents
  };
}

export function contractObject(contract) {
  let date = null;
  if (contract.hasOwnProperty('FECHA_DE_SUSCRIPCION_DE_CONTRATO') && !isNull(contract.FECHA_DE_SUSCRIPCION_DE_CONTRATO)) {
    date = dateToISOString(contract.FECHA_DE_SUSCRIPCION_DE_CONTRATO);
  }

  const contractObj = {
    status: 'terminated',
    title: contract.REFERENCIA_DE_LA_CONTRATACION,
    id: contract.NUMERO_DE_CONTRATO.toString(),
    awardID: contract.NUMERO_DE_CONTRATO.toString(),
    period: {
      startDate: contract.FECHA_DE_SUSCRIPCION_DE_CONTRATO ? dateToISOString(contract.FECHA_DE_SUSCRIPCION_DE_CONTRATO) : null
    },
    value: {
      amount: parseFloat(fixAmount(contract.IMPORTE_MN_SIN_IVA)),
      currency: 'MXN',
    },
  };

  if(date != null) {
      Object.assign(contractObj, { dateSigned: date });
  }

  return contractObj;
}

export function supplierPartyObject(contract) {
  const name = contract.RAZON_SOCIAL;
  const party = {
    name: name,
    id: laundry.simpleName(laundry.launder(name)),
    roles: ['supplier'],
    details: {
        type: laundry.isCompany(name)? 'company' : 'person'
    }
  }

  return party;
}

function buyerObject(contract) {
  const partyName = contract.NOMBRE_UC;
  return {
    name: contract.NOMBRE_UC,
    id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(contract.DEPENDENCIA_ENTIDAD))
  }
}

export function buyerPartyObject(contract) {

  const party = {
    roles: ['buyer'],
  }

  // Corregir el caso en el que NOMBRE_DE_LA_UC viene como un número
  let nombreUCStr = contract.NOMBRE_UC;
  if(typeof nombreUCStr === 'number') nombreUCStr = nombreUCStr.toString();
  let parent = contract.DEPENDENCIA_ENTIDAD;
  const partyID = contract.CLAVE_UC.toString();
  const partyName = nombreUCStr;
  return Object.assign(party, {
    id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(parent)),
    name: nombreUCStr,
    address: {
      countryName: 'Mexico',
    },
    memberOf: [
        {
          name: parent,
          id: laundry.simpleName(laundry.launder(parent))
        }
    ],
    identifier: {
      scheme: 'MX-CPA',
      id: partyID,
      legalName: nombreUCStr,
      uri: 'https://sites.google.com/site/cnetuc/directorio',
    },
    details: {
        type: 'institution',
        classification: 'unidad-compradora'
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
  if (!contract.NUMERO_DE_PROCEDIMIENTO) {
    return {};
  }
  const parties = getParties(contract);

  const release = {
    ocid: nP2Ocid(contract.NUMERO_DE_PROCEDIMIENTO),
    id: contract.NUMERO_DE_PROCEDIMIENTO.toString(),
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
        name: "CompraNet 3.0 / Secretaría de Hacienda y Crédito Público",
        uri: "https://sites.google.com/site/cnetuc/contratos_cnet_3"
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
