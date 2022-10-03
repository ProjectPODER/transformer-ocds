import slug from 'slug';
import isNull from 'lodash.isnull';
import camelCase from 'lodash.camelcase';
const laundry = require('company-laundry');
import _ from 'lodash';
const getCountryName = require('./countries');

function repairDate(string) {
    var [ date, time ] = string.split(' ');
    var [ month, day, year ] = date.split('/');

    if(year.length == 2) year = '20' + year;
    return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + ((time)? ' ' + time : '');
}

export function dateToISOString(string) {
  if(string.length < 10) return null;
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

export function tenderSubmissionMethod(string) {
    switch(camelCase(string)) {
        case 'mixta':
            return ['electronicSubmission', 'inPerson'];
        case 'electronica':
            return ['electronicSubmission'];
        case 'presencial':
            return ['inPerson'];
    }
}

export function tenderProcurementMethod(string, auxString) {
  switch (camelCase(string)) {
    case 'lp':
    case 'licitacionPublica':
    case 'licitacionPublicaConOsd':
    case 'licitacionPublicaEstatal':
        return 'open';
    case 'i3p':
    case 'invitacionACuandoMenos3Personas':
        return 'limited';
    case 'ad':
    case 'adjudicacionDirecta':
    case 'adjudicacionDirectaFederal':
    case 'convenio':
        return 'direct';
    case 'pc':
    case 'proyectoDeConvocatoria':
        switch(auxString) {
            case "07. Proyecto de Convocatoria a la Licitación Pública":
                return 'open';
            case "05. Adjudicación Directa LAASSP":
            case "01. Licitación Pública LAASSP":
            case "02. Licitación Pública LOPSRM":
                return 'direct';
            case "04. Invitación a Cuando Menos Tres Personas LOPSRM":
            case "03. Invitación a Cuando Menos Tres Personas LAASSP":
                return 'limited';
        }
    case 'oc':
    case 'otro':
        return '';
  }
}

export function tenderAwardCriteriaDetailScale(string) {
  switch (camelCase(string)) {
    case 'noMipyme':
      return 'Large';
    case 'mediana':
    case 'pequena':
      return 'sme';
    case 'micro':
      return 'micro';
  }
}

export function tenderMainProcurementCategory(string) {
  switch (camelCase(string)) {
    case 'adquisiciones':
    case 'arrendamientos':
      return 'goods';
    case 'obraPublica':
    case 'serviciosRelacionadosConLaOp':
      return 'works';
    case 'servicios':
      return 'services';
  }
}

export function tenderObject(contract) {
  const parent = contract.DEPENDENCIA;
  let dependencia = '';
  switch (contract.GOBIERNO) {
      case 'APF':
          dependencia = parent;
          break;
      case 'GE':
          dependencia = removeStateFromDependencia(parent);
          break;
      case 'GM':
          dependencia = removeStateFromDependencia(parent);
          break;
  }

  const partyID = obtainClaveFromUC(contract.NOMBRE_DE_LA_UC);
  const partyName = ucStringParse({string: contract.NOMBRE_DE_LA_UC, id: partyID.toString()});

  const document = {
    id: contract.CODIGO_EXPEDIENTE.toString(),
    title: contract.TITULO_EXPEDIENTE.toString(),
    status: 'complete',
    consolidatedProcessMxCnet: (contract.COMPRA_CONSOLIDADA == '1')? true : false,
    procuringEntity: {
        id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(dependencia)),
        name: partyName,
    },
    procurementMethodRationale: contract.FUNDAMENTO_LEGAL,
    procurementMethodCharacterMxCnet: contract.CARACTER,
    procurementMethodDetailsTemplateMxCnet: contract.PLANTILLA_EXPEDIENTE
  };
  if (contract.FORMA_PROCEDIMIENTO) {
    Object.assign(document, {
      submissionMethod: tenderSubmissionMethod(contract.FORMA_PROCEDIMIENTO),
      submissionMethodDetails: contract.FORMA_PROCEDIMIENTO
    })
  }
  if (contract.TIPO_PROCEDIMIENTO) {
    let procurementMethod = tenderProcurementMethod(contract.TIPO_PROCEDIMIENTO, contract.PLANTILLA_EXPEDIENTE);
    if(procurementMethod != '') {
        Object.assign(document, { procurementMethod: procurementMethod });
    }
    Object.assign(document, { procurementMethodDetails: contract.TIPO_PROCEDIMIENTO });

  }
  if (contract.TIPO_CONTRATACION) {
    Object.assign(document, {
      mainProcurementCategory: tenderMainProcurementCategory(contract.TIPO_CONTRATACION),
      procurementCategoryMxCnet: [ contract.TIPO_CONTRATACION ],
    })
  }
  if (contract.PROC_F_PUBLICACION || contract.FECHA_APERTURA_PROPOSICIONES) {
    const tenderPeriod = {};
    if (contract.PROC_F_PUBLICACION) {
      Object.assign(tenderPeriod, {
        startDate: dateToISOString(contract.PROC_F_PUBLICACION),
      })
    }
    if (contract.FECHA_APERTURA_PROPOSICIONES) {
      Object.assign(tenderPeriod, {
        endDate: dateToISOString(contract.FECHA_APERTURA_PROPOSICIONES),
      })
    }
    Object.assign(document, { tenderPeriod });
  }
  return document;
}

function budgetObject(contract) {
  const budgetBreakdown = {}
  const document = {
    budgetBreakdown: [budgetBreakdown],
  };
  if (contract.CLAVE_PROGRAMA) {
    const [ project, projectID ] = contract.CLAVE_PROGRAMA.split('-');
    Object.assign(document, { project, projectID });
  }
  return document;
}

export function planningObject(contract) {
  let planning = {
    budget: budgetObject(contract),
  };
  if( !_.isEmpty(planning.budget.budgetBreakdown) ) {
      return planning;
  }
  return null;
}

function awardObject(contract) {
  let date, status = null;
  if (contract.hasOwnProperty('EXP_F_FALLO') && !isNull(contract.EXP_F_FALLO)) {
    date = dateToISOString(contract.EXP_F_FALLO);
    status = 'active';
  }

  const suppliers = [
    orgObject(contract.PROVEEDOR_CONTRATISTA),
  ];

  let documents = [];
  if (contract.ANUNCIO) {
      documents.push( {
          id: 'doc-compranet-' + contract.CODIGO_CONTRATO.toString() + '-1',
          documentType: 'awardNotice',
          url: contract.ANUNCIO.replace('funcionpublica', 'hacienda'),
          datePublished: date,
          format: 'text/html',
          language: 'es'
      } )
  }
  if (contract.URL) {
      documents.push( {
          id: 'doc-commpranet-' + contract.CODIGO_CONTRATO.toString() + '-2',
          documentType: 'awardNotice',
          url: contract.URL.replace('funcionpublica', 'hacienda'),
          datePublished: date,
          format: 'text/html',
          language: 'es'
      } )
  }

  let awardObject = {
    title: contract.TITULO_CONTRATO,
    description: contract.DESCRIPCION_CONTRATO,
    suppliers: suppliers,
    date,
    status,
    id: contract.CODIGO_CONTRATO.toString(),
    value: {
      amount: +contract.IMPORTE_CONTRATO,
      currency: contract.MONEDA,
    },
    documents: documents
  };

  if(status != null) {
      Object.assign( awardObject, { 'status': status } );
  }

  return awardObject;
}

export function contractStatus(string) {
  switch (camelCase(string)) {
    case 'activo':
      return 'active';
    case 'terminado':
    case 'expirado':
      return 'terminated';
  }
}

export function contractObject(contract) {
  let date = null;
  if (contract.hasOwnProperty('FECHA_CELEBRACION') && !isNull(contract.FECHA_CELEBRACION)) {
    date = dateToISOString(contract.FECHA_CELEBRACION);
  }

  const contractObj = {
    status: contractStatus(contract.ESTATUS_CONTRATO), // FIXME review
    statusMxCnet: contract.ESTATUS_CONTRATO,
    title: contract.TITULO_CONTRATO,
    description: contract.DESCRIPCION_CONTRATO,
    id: contract.CODIGO_CONTRATO.toString(),
    awardID: contract.CODIGO_CONTRATO.toString(),
    period: {
      startDate: contract.FECHA_INICIO ? dateToISOString(contract.FECHA_INICIO) : null,
      endDate: contract.FECHA_FIN ? dateToISOString(contract.FECHA_FIN) : null,
    },
    multiyearContractMxCnet: contract.PLURIANUAL ? true : false,
    value: {
      amount: +contract.IMPORTE_CONTRATO,
      currency: contract.MONEDA,
    },
    hasFramework: (contract.CONTRATO_MARCO && contract.CONTRATO_MARCO != 'No se utilizó el Contrato Marco') ? true : false,
    framework: contract.CONTRATO_MARCO ? contract.CONTRATO_MARCO : null
  };

  if(date != null) {
      Object.assign(contractObj, { dateSigned: date });
  }

  if(contract.CONVENIO_MODIFICATORIO == 1) {
      Object.assign(contractObj, {
          hasAmendments: true
      })
  }

  return contractObj;
}

export function supplierPartyObject(contract) {
    const name = contract.PROVEEDOR_CONTRATISTA;
    const party = {
        name: name,
        id: laundry.simpleName(laundry.launder(name)),
        roles: ['supplier']
    }
    if(contract.FOLIO_RUPC) {
        Object.assign(party, { identifier: {
            id: contract.FOLIO_RUPC.toString(),
            scheme: 'RUPC',
            legalName: contract.PROVEEDOR_CONTRATISTA,
            uri: 'https://sites.google.com/site/cnetrupc/rupc',
        }});
    }
    if(contract.RFC) {
        Object.assign(party, { additionalIdentifiers: [{
                id: contract.RFC,
                scheme: 'RFC',
                legalName: name,
                verified: contract.RFC_VERIFICADO
            }]
        });
    }
    const details = {
        type: laundry.isCompany(contract.PROVEEDOR_CONTRATISTA)? 'company' : 'person'
    };
    if (contract.ESTRATIFICACION_MPC) {
        Object.assign(details, {
            scaleReportedBySupplierMxCnet: contract.ESTRATIFICACION_MPC,
        })
    }
    Object.assign(party, { details } );
    if (contract.SIGLAS_PAIS) {
        let countryName = getCountryName(contract.SIGLAS_PAIS);
        return Object.assign(party, {
            address: {
                countryName: countryName,
            },
        })
    }
    return party;
}

export function stripSiglasFromUC(options) {
  const { NOMBRE_DE_LA_UC, SIGLAS } = options;
  const UCString = NOMBRE_DE_LA_UC
    .replace(new RegExp(`^${SIGLAS}-`), '');
  const [ siglas, city ] = SIGLAS.split(/-/);
  return {
    UCString,
    siglas,
    city,
  }
}

export function obtainClaveFromUC(string) {
  if(typeof string === 'number') string = string.toString(); // Evitar bug cuando viene como número en vez de string
  const ucArray = string.split('#');
  return ucArray[ucArray.length-1].toString();
}

function ucStringParse({string, id}) {
  if(typeof string === 'number') string = string.toString(); // Evitar bug cuando viene como número en vez de string
  let parsedString = string.replace(new RegExp(`#${id}$`), '').trim();
  if ( parsedString.split('-').length > 1) {
    // not all UC names have a second dash
    const array = /(^.*)-/.exec(parsedString);
    // remove $dependency (GE) or $state (GM) from front
    parsedString = parsedString.replace(new RegExp(`^${array[0]}`), '').trim();
  }
  return parsedString
}

function buyerObject(contract) {
    const parent = contract.DEPENDENCIA;
    let dependencia = '';
    switch (contract.GOBIERNO) {
        case 'APF':
            dependencia = parent;
            break;
        case 'GE':
            dependencia = removeStateFromDependencia(parent);
            break;
        case 'GM':
            dependencia = removeStateFromDependencia(parent).replace('_', '');
            break;
    }

    const partyID = obtainClaveFromUC(contract.NOMBRE_DE_LA_UC);
    const partyName = ucStringParse({string: contract.NOMBRE_DE_LA_UC, id: partyID});
    return {
        name: partyName,
        id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(dependencia))
    }
}

function getStateName(initials) {
    switch(initials) {
        case 'AGS': return 'Aguascalientes';
        case 'BC': return 'Baja California';
        case 'BCS': return 'Baja California Sur';
        case 'CAMP': return 'Campeche';
        case 'CDMX': return 'Ciudad de México';
        case 'CHIH': return 'Chihuahua';
        case 'CHIS': return 'Chiapas';
        case 'COAH': return 'Coahuila';
        case 'COL': return 'Colima';
        case 'DGO': return 'Durango';
        case 'GRO': return 'Guerrero';
        case 'GTO': return 'Guanajuato';
        case 'HGO': return 'Hidalgo';
        case 'JAL': return 'Jalisco';
        case 'MEX': return 'Estado de México';
        case 'MICH': return 'Michoacán';
        case 'MOR': return 'Morelos';
        case 'NAY': return 'Nayarit';
        case 'NL': return 'Nuevo León';
        case 'OAX': return 'Oaxaca';
        case 'PUE': return 'Puebla';
        case 'Q ROO': return 'Quintana Roo';
        case 'QRO': return 'Querétaro';
        case 'SIN': return 'Sinaloa';
        case 'SLP': return 'San Luis Potosí';
        case 'SON': return 'Sonora';
        case 'TAB': return 'Tabasco';
        case 'TAMPS': return 'Tamaulipas';
        case 'TLAX': return 'Tlaxcala';
        case 'VER': return 'Veracruz';
        case 'YUC': return 'Yucatán';
        case 'ZAC': return 'Zacatecas';
    }
}

function rectifyStateName(string) {
    switch(string) {
        case 'Veracruz de Ignacio de la Llave': return 'Veracruz';
        case 'Coahuila de Zaragoza': return 'Coahuila';
        case 'Michoacán de Ocampo': return 'Michoacán';
        case 'México': return 'Estado de México';
        default: return string;
    }
}

function obtainRegionName(string, level) {
    let state = '';
    if(level == 'region') {
        state = string.replace(/^_Gobierno del Estado de/, '').trim();
    }
    else {
        state = string.replace(/^_Gobierno Municipal del Estado de/, '').trim();
    }

    if(state.match(/^.{2,5}-/))
        state = getStateName( state.split('-')[0] );
    else
        state = rectifyStateName( state );

    return state;
}

function removeStateFromDependencia(string) {
    let arr = string.split('-');
    arr.shift();
    return arr.join('-');
}

// SIGLAS - String
// DEPENDENCIA - String
// NOMBRE_DE_LA_UC - String
// Clave_UC - String
// Responsable - responsable
//
// Nuestro objetivo es transformarlo en los campos de OCDS:
// -Parties/Parent (extensión)
// -Parties/id
// -Parties/name
// -Parties/ContactPoint
// -parties/address/locality
// -parties/address/region
// -parties/address/countryName

export function buyerPartyObject(contract) {
    const parent = contract.DEPENDENCIA;
    const party = {
        roles: ['buyer'],
    }

  // Corregir el caso en el que NOMBRE_DE_LA_UC viene como un número
  let nombreUCStr = contract.NOMBRE_DE_LA_UC;
  if(typeof nombreUCStr === 'number') nombreUCStr = nombreUCStr.toString();
  const partyID = obtainClaveFromUC(contract.NOMBRE_DE_LA_UC);
  const partyName = ucStringParse({string: contract.NOMBRE_DE_LA_UC, id: partyID.toString()});

  switch (contract.GOBIERNO) {
  // SIGLAS Unless contain hyphen, then DEP-CITY
    case 'GF':
    case 'APF': {
      // Siempre: govlevel = country
      // Siempre: parties/address/countryName = Mexico
      // Dependencia = Parties/Parent
      // SIGLAS → Duda: En México las siglas de una dependencia son tanto o más usadas que el nombre, por  lo que deberían ser usados como un nombre alternativo de la dependencia.
      // Responsable = Parties/ContactPoint (habría que repasar lo que hace hacienda ya que es ditinto el responsable del contrato que el operador)
      // NOMBRE_DE_LA_UC está conformado por "SIGLAS-Nombre del Unidad #Clave UC"
      // -Entonces hay que: Encontrar el primer guión empezando por el principio del string y el primer # empezando por el final. Esto nos permite extraer:
      // -NOMBRE_DE_LA_UC/Nombre del Unidad → Parties/name
      return Object.assign(party, {
        id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(parent)),
        name: partyName,
        contactPoint: {
            id: laundry.simpleName(laundry.launder(contract.RESPONSABLE)),
            name: contract.RESPONSABLE,
        },
        address: {
          countryName: 'México',
        },
        memberOf: [
            {
              name: parent,
              id: laundry.simpleName(laundry.launder(parent)),
              initials: contract.SIGLAS
            }
        ],
        identifier: {
          scheme: 'MX-CPA',
          id: partyID.toString(),
          legalName: partyName,
          uri: 'https://sites.google.com/site/cnetuc/directorio',
        },
        details: {
            govLevel: 'country',
            type: 'institution',
            classification: 'unidad-compradora'
        }
      });
    }
    case 'GE': {
      // Siempre: govlevel = region
      // Siempre: parties/address/countryName = Mexico
      // Dependencia esta conformado por “_Gobierno del Estado de NombreEstado”
      // -Dependencia/NombreEstado → parties/address/region
      // NOMBRE_DE_LA_UC conformada “Iniciales Estado-Nombre Dependencia-Nombre UC #Número UC”
      // -Buscamos el caracter # por la derecha y extraemos todos los números para conformar la clave UC
      // -NOMBRE_DE_LA_UC/Número UC → Parties/id
      // -Nombre Dependencia (entre el primer y el segundo guión en el campo Unidad Compradora)
      // NOMBRE_DE_LA_UC/Nombre Dependencia → Parties/parent
      // -Nombre UC (todo el texto despúes del segundo guión y antes del #. Puede tener más guiones)
      // NOMBRE_DE_LA_UC/Nombre UC → Parties/name

      // SIGLAS: initials of  State
      let dependencia = removeStateFromDependencia(parent);
      return Object.assign(party, {
        id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(dependencia)),
        name: partyName,
        contactPoint: {
            id: laundry.simpleName(laundry.launder(contract.RESPONSABLE)),
            name: contract.RESPONSABLE,
        },
        address: {
          countryName: 'México',
          region: obtainRegionName(contract.DEPENDENCIA, 'region')
          //region:  contract.DEPENDENCIA.replace(/^_Gobierno del Estado de/, '').trim(),
        },
        memberOf: [
            {
              name: dependencia,
              id: laundry.simpleName(laundry.launder(dependencia)),
              initials: contract.SIGLAS
            }
        ],
        identifier: {
          scheme: 'MX-CPA',
          id: partyID.toString(),
          legalName: partyName,
          uri: 'https://sites.google.com/site/cnetuc/directorio',
        },
        details: {
            govLevel: 'region',
            type: 'institution',
            classification: 'unidad-compradora'
        }
      });
    }

    case 'GM': {
    //  SIEMPRE: govlevel → city
    //  Siempre: parties/address/countryName = Mexico
    //  Dependencia esta conformado por “_Gobierno Municipal del Estado de NombreEstado”
    //  -Dependencia/NombreEstado → parties/address/region
    //  Unidad Compradora conformada en “Iniciales Estado-Nombre Municipio-Nombre UC (que puede contener más guiones) #Número UC”
    //  -Buscamos el caracter # por la derecha y extraemos todos los números para conformar la clave UC
    //  NOMBRE_DE_LA_UC/Número UC → Parties/id
    //  -Nombre Municipio (entre el primer y el segundo guión en el campo Unidad Compradora)
    //  NOMBRE_DE_LA_UC/Nombre UC → Parties/parent
    //  NOMBRE_DE_LA_UC/Nombre UC → parties/address/locality
    //  -Nombre UC (todo el texto despúes del segundo guión y antes del útimo #)
    //  NOMBRE_DE_LA_UC/Nombre UC → Parties/name:

    //  SIGLAS: initials of organization (instituto mexicano de transporte)
      let dependencia = removeStateFromDependencia(parent).replace('_', '');
      return Object.assign(party, {
        id: laundry.simpleName(laundry.launder(partyName)) + '-' + laundry.simpleName(laundry.launder(dependencia)),
        name: partyName,
        contactPoint: {
            id: laundry.simpleName(laundry.launder(contract.RESPONSABLE)),
            name: contract.RESPONSABLE,
        },
        address: {
          countryName: 'México',
          region: obtainRegionName(contract.DEPENDENCIA, 'city'),
          // region:  contract.DEPENDENCIA.replace(/^_Gobierno Municipal del Estado de/, '').trim(),
          locality: nombreUCStr.split('-')[1],
        },
        memberOf: [
            {
              name: dependencia,
              id: laundry.simpleName(laundry.launder(dependencia)),
              initials: contract.SIGLAS
            }
        ],
        identifier: {
          scheme: 'MX-CPA',
          id: partyID.toString(),
          legalName: partyName,
          uri: 'https://sites.google.com/site/cnetuc/directorio',
        },
        details: {
            govLevel: 'city',
            type: 'institution',
            classification: 'unidad-compradora'
        }
      });
    }
  }
}

function getFunderName(funder) {
    switch(funder) {
        case 'BID':
            return 'Banco Interamericano de Desarrollo';
        case 'BIRF':
            return 'Banco Internacional de Reconstrucción y Fomento';
        case 'BDAN':
            return 'Banco de Desarrollo de América del Norte';
        case 'OITAB':
            return 'Oficina Internacional del Trabajo Acuerdo Bilateral';
    }
}

function getParties(contract) {

  // console.log(options)
  const array = [
    buyerPartyObject(contract),
    supplierPartyObject(contract),
  ];

  if (contract.ORGANISMO) { // A funder exists in the contract
    let funders = [];
    if( contract.ORGANISMO.indexOf(';') ) funders.push( ...contract.ORGANISMO.split(';') ); // Sometimes funders are grouped together by ;
    else funders.push( contract.ORGANISMO );

    funders.map( (funder) => {
        array.push(Object.assign(orgObject(getFunderName(funder)), {
            roles: ['funder'],
            details: {
                type: 'institution',
                initials: funder
            }
        }))

    } );
  }
  return array.filter(o => (o.name));
}

function releaseTags(contract) {
  if (/ACTIVO/i.test(contract.ESTATUS_CONTRATO)) {
    return 'contract'
  }

  if (/TERMINADO|EXPIRADO/i.test(contract.ESTATUS_CONTRATO)) {
    return 'contractTermination'
  }
  return null;
}

export function releaseObject({contract, metadata}) {
  // doc is a contract
  if (!contract.NUMERO_PROCEDIMIENTO || !contract.CODIGO_EXPEDIENTE || !contract.PROVEEDOR_CONTRATISTA) {
    return {};
  }
  const parties = getParties(contract);

  const release = {
    ocid: nP2Ocid(contract.NUMERO_PROCEDIMIENTO),
    id: contract.NUMERO_PROCEDIMIENTO.toString(),
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
        name: "CompraNet / Secretaría de Hacienda y Crédito Público",
        uri: "https://sites.google.com/site/cnetuc/descargas"
    }
  };

  const planningObj = planningObject(contract);
  if(planningObj) {
      Object.assign(release, { planning: planningObj });
  }

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
