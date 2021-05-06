import slug from 'slug';
import isNull from 'lodash.isnull';
import camelCase from 'lodash.camelcase';
const laundry = require('company-laundry');
import _ from 'lodash';

function repairDate(string) { // POT is weird so this function is different
    var [ date, time ] = string.split(' ');
    var [ day, month, year ] = date.split('/');

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

function fixExpNumber(value) {
    if(typeof value === 'number') return value;
    else if(value.indexOf('E') >= 0) {
        value = value.replace(' ', '');
        return Number(value);
    }
    else
        return value;
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
    case 'INVITACIÓN 26-II-LAASSP':
    case 'INVITACIÓN A 3 ART. 41-X-LAASSP':
    case 'INVITACION A TRES PERSONAS':
    case 'INVITACIÓN A TRES PERSONAS':
    case 'INVITACION A CUANDO MENOS TRES PERSONAS':
    case 'INVITACIÓN A CUANDO MENOS TRES PERSONAS':
    case 'INVITACION A CUENDO MENOS TRES PERSONAS':
    case 'INVITACIÓN A CUANDO MENOS TRES PERSONAS 26-II-LAASSP':
    case 'INVITACIÓN TRES PERSONAS':
    case 'INVITACIÓN ART. 26-II-LAASSP':
        return 'limited';
    case 'ADJUDICACI N DIRECTA':
    case 'ADJUDICACIÓN DIRECTA':
    case 'ADJUDICACION DIRECTA':
    case 'ADJUDICACIÓN DIRECTA  ART. 27  FRACCIÓN III Y ART. 43 - LOPSRM':
    case 'ADJUDICACIÓN DIRECTA 41-I-LAASSP':
    case 'ADJUDICACIÓN DIRECTA 41-III-LAASSP':
    case 'ADJUDICACIÓN DIRECTA 41-X Y XIV-LAASSP':
    case 'ADJUDICACIÓN DIRECTA ART-1-LAASSP':
    case 'ADJUDICACIÓN DIRECTA ART. 1-LAASSP':
    case 'ADJUDICACIÓN DIRECTA ART. 41-I-LAASSP':
    case 'ADJUDICACIÓN DIRECTA ART. 41-III-LAASSP':
    case 'ADJUDICACIÓN DIRECTA ART. 41-V-LAASSP':
    case 'ADJUDICACIÓN DIRECTA ART. 42-LAASSP':
    case 'ADJUDICACION DIRECTA.':
    case 'ART. 1-LAASSP, ADJUDICACION DIRECTA':
        return 'direct';
    case 'LICITACI N P BLICA':
    case 'LICITACIÓN PÚBLICA':
    case 'LICITACION PÚBLICA':
    case 'LICITACION PUBLICA NACIONAL':
    case 'LICITACIÓN PÚBLICA NACIONAL':
    case 'LICITACION PUBLICA NACIONAL AMPLIACION':
    case 'LICITACION PUBLICA INTERNACIONAL':
    case 'LICITACION PÚBLICA INTERNACIONAL':
    case 'LICITACIÓN PUBLICA INTERNACIONAL':
    case 'LICITACIÓN PÚBLICA INTERNACIONAL':
    case 'LICITACION PUBLICA  ART. 27  FRACCIÓN I Y ART. 41 - LOPSRM':
    case 'LICITACIÓN PÚBLICA 26-I-LAASSP':
    case 'LICITACIÓN PÚBLICA ART. 26-I-LAASSP':
        return 'open';
    case 'OTRO':
    case 'OTROS':
    default:
        return '';
  }
}

export function tenderObject(contract) {
  let nombreUCStr = contract.UNIDAD_ADMINISTRATIVA;
  if(typeof nombreUCStr === 'number') nombreUCStr = nombreUCStr.toString();

  const document = {
    id: contract.NUMERO_DE_CONTRATO.toString(),
    title: contract.OBJETO,
    status: 'complete',
    procuringEntity: {
        id: laundry.simpleName(laundry.launder(nombreUCStr)) + '-' + laundry.simpleName(laundry.launder(contract.INSTITUCION)),
        name: nombreUCStr,
    }
  };
  if (contract.PROCEDIMIENTO_DE_CONTRATACION) {
    let procurementMethod = tenderProcurementMethod(contract.PROCEDIMIENTO_DE_CONTRATACION);
    if(procurementMethod != '') {
        Object.assign(document, { procurementMethod: procurementMethod });
    }
    Object.assign(document, { procurementMethodDetails: contract.PROCEDIMIENTO_DE_CONTRATACION });
  }

  return document;
}

function awardObject(contract) {
  const suppliers = [
    orgObject(contract.NOMBRE_PROVEEDOR),
  ];

  let documents = [];
  documents.push({
      id: 'doc-pot-' + contract.NUMERO_DE_CONTRATO.toString() + '-1',
      documentType: 'awardNotice',
      url: "http://www.portaltransparencia.gob.mx/buscador/search/search.do?method=search&siglasDependencia=&searchBy=1&query=" + contract.NUMERO_DE_CONTRATO,
      format: 'text/html',
      language: 'es'
  });
  if (contract.URL && contract.URL != 'http://') {
      documents.push( {
          id: 'doc-pot-' + contract.NUMERO_DE_CONTRATO.toString() + '-2',
          documentType: 'awardNotice',
          url: contract.URL,
          format: 'application/pdf',
          language: 'es'
      } )
  }

  return {
    title: contract.OBJETO,
    suppliers: suppliers,
    status: 'active',
    id: contract.NUMERO_DE_CONTRATO.toString(),
    value: {
      amount: parseFloat(fixExpNumber(contract.MONTO_CONTRATO)),
      currency: 'MXN',
    },
    documents: documents
  };
}

export function contractObject(contract) {
  let date = null;
  if (contract.hasOwnProperty('FECHA_CELEBRACION_CONTRATO') && !isNull(contract.FECHA_CELEBRACION_CONTRATO)) {
    date = dateToISOString(contract.FECHA_CELEBRACION_CONTRATO);
  }

  const contractObj = {
    status: 'terminated',
    title: contract.OBJETO,
    id: contract.NUMERO_DE_CONTRATO.toString(),
    awardID: contract.NUMERO_DE_CONTRATO.toString(),
    period: {
      startDate: dateToISOString(contract.FECHA_INICIO_CONTRATO),
      endDate: dateToISOString(contract.FECHA_TERMINACION_CONTRATO)
    },
    value: {
      amount: parseFloat(fixExpNumber(contract.MONTO_CONTRATO)),
      currency: 'MXN',
    },
  };

  if(date != null) {
      Object.assign(contractObj, { dateSigned: date });
  }

  if(contract.CONVENIO_MODIFICATORIO == 'SI') {
      Object.assign(contractObj, {
          hasAmendments: true
      })
  }

  return contractObj;
}

export function supplierPartyObject(contract) {
  const name = contract.NOMBRE_PROVEEDOR;
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
  const partyID = contract.UNIDAD_ADMINISTRATIVA;
  const partyName = contract.UNIDAD_ADMINISTRATIVA;
  return {
    name: partyName,
    id: laundry.simpleName(laundry.launder(partyID)) + '-' + laundry.simpleName(laundry.launder(contract.INSTITUCION))
  }
}

export function buyerPartyObject(contract) {

  const party = {
    roles: ['buyer'],
  }

  // Corregir el caso en el que NOMBRE_DE_LA_UC viene como un número
  let nombreUCStr = contract.UNIDAD_ADMINISTRATIVA;
  if(typeof nombreUCStr === 'number') nombreUCStr = nombreUCStr.toString();

  const partyID = contract.UNIDAD_ADMINISTRATIVA;
  const partyName = nombreUCStr;
  return Object.assign(party, {
    id: laundry.simpleName(laundry.launder(partyID)) + '-' + laundry.simpleName(laundry.launder(contract.INSTITUCION)),
    name: partyName,
    address: {
      countryName: 'México',
    },
    memberOf: [
        {
          name: contract.INSTITUCION,
          id: laundry.simpleName(laundry.launder(contract.INSTITUCION))
        }
    ],
    details: {
        type: 'institution',
        classification: 'unidad-compradora'
    }
  });

}

function getParties(contract) {

  // console.log(options)
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
  if (!contract.NUMERO_DE_CONTRATO) {
    return {};
  }
  const parties = getParties(contract);

  const release = {
    ocid: nP2Ocid(contract.NUMERO_DE_CONTRATO),
    id: contract.NUMERO_DE_CONTRATO.toString(),
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
        name: "Portal de Obligaciones de Transparencia",
        uri: "http://portaltransparencia.gob.mx/pot/repoServlet?archivo=contrato.zip"
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
