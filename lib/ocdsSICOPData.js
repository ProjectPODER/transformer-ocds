import slug from 'slug';
import isNull from 'lodash.isnull';
import camelCase from 'lodash.camelcase';
const laundry = require('company-laundry');
import _ from 'lodash';
const countries = require("i18n-iso-countries");
const CSV = require('csv-string');

function repairDate(string) {
    var [ date, time ] = string.split(' ');
    var [ day, month, year ] = date.split('/');

    if(year.length == 2) year = '20' + year;
    return year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0') + ((time)? ' ' + time : '');
}

function repairDate2(string) {
    var [ day, month, year ] = string.split('-');
    month = monthToNum(month);

    return '20' + year + '-' + month + '-' + day.padStart(2, '0');
}

function monthToNum(string) {
    switch(string) {
        case 'JAN': return '01';
        case 'FEB': return '02';
        case 'MAR': return '03';
        case 'APR': return '04';
        case 'MAY': return '05';
        case 'JUN': return '06';
        case 'JUL': return '07';
        case 'AUG': return '08';
        case 'SEP': return '09';
        case 'OCT': return '10';
        case 'NOV': return '11';
        case 'DEC': return '12';
    }
}

export function dateToISOString(string) {
  if(string.indexOf('/') >= 0) string = repairDate(string);
  else if(string.indexOf('-') >= 0) string = repairDate2(string);

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
  return `ocds-rwubve-${string}`
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
    return {}
}

export function tenderProcurementMethod(string) {
    switch (string) {
        case 'CONTRATACIÓN DIRECTA':
            return 'limited';
        case 'CONTRATACIÓN ESPECIAL':
        case 'CONTRATACIÓN PRIVADA':
        case 'PROCEDIMIENTO POR PRINCIPIO':
            return 'direct';
        case 'LICITACIÓN ABREVIADA':
        case 'LICITACIÓN PÚBLICA INTERNACIONAL':
        case 'LICITACIÓN PÚBLICA NACIONAL':
            return 'open';
    }
}

export function tenderMainProcurementCategory(string) {
  switch (string) {
    case 'BIENES':
    case 'BIENES/SERVICIOS':
        return 'goods';
    case 'OBRA PUBLICA':
        return 'works';
    case 'SERVICIOS':
        return 'services';
  }
}

export function tenderObject(contract) {
    let partyName = contract.institucion;
    const partyID = laundry.simpleName(laundry.launder(partyName));

    let tenderID = contract.numero_procedimiento;
    const document = {
        id: tenderID,
        /*title: contract.descripcion,*/
        status: 'complete',
        procuringEntity: {
            id: partyID,
            name: partyName,
        },
        value: {
            amount: contract.monto_estimado_sum,
            currency: contract.moneda_monto_estimado
        }
    };

    if (contract.tipo_procedimiento) {
        let procurementMethod = tenderProcurementMethod(contract.tipo_procedimiento);
        if(procurementMethod != '') {
            Object.assign(document, { procurementMethod: procurementMethod });
        }
        Object.assign(document, { procurementMethodDetails: contract.tipo_procedimiento });
    }

    if(contract.tipo_modalidad) {
        Object.assign(document, { procurementMethodRationale: contract.tipo_modalidad });
    }

    if (contract.clasificacion_objeto) {
        Object.assign(document, {
            mainProcurementCategory: tenderMainProcurementCategory(contract.clasificacion_objeto),
            additionalProcurementCategories: [ contract.clasificacion_objeto ],
        })
    }

    return document;
}

function awardObject(contract) {
    let awardID = contract.numero_contrato;
    let supplierName = contract.adjudicatario;
    const suppliers = [
        orgObject(supplierName),
    ];

    let documents = [];
    let url = 'https://www.sicop.go.cr/moduloPcont/pcont/ctract/es/CE_CEJ_ESQ001.jsp?sch_instNo=' + contract.numero_procedimiento;
    documents.push( {
        id: 'doc-tdc-' + awardID + '-1',
        documentType: 'awardNotice',
        url: url,
        format: 'text/html',
        language: 'es'
    } );


    return {
        /*title: contract.descripcion,*/
        suppliers: suppliers,
        status: 'active',
        id: awardID,
        value: {
            amount: contract.monto,
            currency: contract.moneda,
        },
        documents: documents
    };
}

function determineEndDate(string, startDate) {
    if(!string || typeof string !== "string") return null;
    let date = new Date(startDate);
    let endDate = null;

    let months = string.match(/(\d*) Meses/i);
    if(months) {
        let numMonths = parseInt(months[1]);
        endDate = new Date(date.setMonth( date.getMonth() + numMonths ));
        return endDate.toISOString();
    }

    let years = string.match(/(\d*) Años/i);
    if(years) {
        let numYears = parseInt(years[1]);
        endDate = new Date(date.setFullYear( date.getFullYear() + numYears ));
        return endDate.toISOString();
    }

    return null;
}

function getContractStatus(endDate) {
    let end = new Date(endDate);
    let now = new Date();

    if(end.getTime() > now.getTime()) return 'active';
    else return 'terminated';
}

export function contractObject(contract) {
    let contractID = contract.numero_contrato;

    const contractObj = {
        title: contract.descripcion,
        id: contractID,
        awardID: contractID,
        value: {
            amount: contract.monto,
            currency: contract.moneda,
        },
        period: {
            startDate: contract.fecha_notificacion
        }
    };

    if(contract.modificaciones == 'Sí') {
        Object.assign(contractObj, {
            hasAmendments: true
        })
    }

    let endDate = determineEndDate(contract.vigencia_contrato, contract.fecha_notificacion);
    if(endDate) {
        Object.assign(contractObj.period, { endDate: endDate });
        let status = getContractStatus(endDate);
        Object.assign(contractObj, { status: status });
    }
    else
        Object.assign(contractObj, { status: 'terminated' });

    if(contract.firma_contrato) {
        Object.assign(contractObj, { dateSigned: contract.firma_contrato });
    }

    return contractObj;
}

function getPartyType(supplier, identifier) {
    if(!identifier) return '';
    // Revisar longitud: 9, 10 ó 12 caracteres
    // 9: persona (dígito inicial dice la provincia)
    // 10: dígito inicial (9=empresa, 8=persona, 4=empresa, 3=empresa)
    // 12: persona
    let length = identifier.length;
    switch(length) {
        case 9:
        case 12:
            return 'person';
        case 10:
            if( identifier.match(/^8/) ) return 'person';
            return 'company';
    }
    return '';
}

function fixCountryCode(string) {
    switch(string) {
        case 'CRC': return 'CRI';
        case 'CHI': return 'CHL';
        case 'ESA': return 'SLV';
        case 'GER': return 'DEU';
        case 'GUA': return 'GTM';
        case 'NED': return 'NLD';
        case 'PAR': return 'PRY';
        case 'PUR': return 'PRI';
        case 'SUI': return 'CHE';
        case 'URU': return 'URY';
        default: return string;
    }
}

function getProvincia(string) {
    switch(string) {
        case 'Limon': return 'Limón';
        case 'San Jose': return 'San José';
        default: return string;
    }
}

function getMunicipio(string) {
    switch(string) {
        case "Aserri": return "Aserrí";
        case "Belen": return "Belén";
        case "Escazu": return "Escazú";
        case "Guacimo": return "Guácimo";
        case "Jimenez": return "Jiménez";
        case "La Union": return "La Unión";
        case "Leon Cortes": return "León Cortés";
        case "Limon": return "Limón";
        case "Paraiso": return "Paraíso";
        case "Perez Zeledon": return "Pérez Zeledón";
        case "Poas": return "Poás";
        case "Pococi": return "Pococí";
        case "Rio Cuarto": return "Río Cuarto";
        case "San Jose": return "San José";
        case "San Ramon": return "San Ramón";
        case "Santa Barbara": return "Santa Bárbara";
        case "Sarapiqui": return "Sarapiquí";
        case "Sarchi": return "Sarchí";
        case "Tarrazu": return "Tarrazú";
        case "Tilaran": return "Tilarán";
        case "Vazquez de Coronado": return "Vázquez de Coronado";
        default: return string;
    }
}

function parseAddress(string) {
    let split = CSV.parse(string, ',')[0];
    let direccion = [];

    if(split[split.length - 1] == '') { // Direcciones extranjeras
        split.map( s => { if(s.length > 0) direccion.push(s) } );
        return [ direccion.join(', ') ];
    }
    else { // Direcciones costarricenses
        let provincia = split[split.length - 1].trim();
        let municipio = split[split.length - 2].trim();

        for(let i=0; i<split.length-2; i++) direccion.push(split[i].trim());

        return [ direccion.join(', '), getMunicipio(municipio), getProvincia(provincia) ];
    }
}

export function supplierPartyObject(contract) {
    const name = contract.adjudicatario;
    if(!name) return {};

    const party = {
        name: name,
        id: laundry.simpleName(laundry.launder(name)),
        roles: ['supplier'],
        details: {},
        identifier: { id: contract.cedula_adjudicatario.toString() }
    }

    if(contract.hasOwnProperty('proveedor') && contract.proveedor != null) {
        let nationality = fixCountryCode(contract.proveedor.nacionalidad);
        let country = countries.getName(nationality, 'es');
        Object.assign(party, { address: { countryName: country } });

        Object.assign(party.details, { scaleReportedBySupplierMxCnet: contract.proveedor.tipo, type: getPartyType(contract.adjudicatario, contract.proveedor.cedula.toString()) });
        if(contract.proveedor.hasOwnProperty('direccion') && contract.proveedor.direccion != '') {
            let address = parseAddress(contract.proveedor.direccion);
            Object.assign(party.address, { streetAddress: contract.proveedor.direccion })
        }
    }
    else {
        let partyType = getPartyType(contract.adjudicatario, contract.cedula_adjudicatario.toString());
        if(!partyType) partyType = laundry.isCompany(contract.adjudicatario)? 'company' : 'person';
        Object.assign(party.details, { type: partyType });
        Object.assign(party, { address: { countryName: 'Costa Rica' } });
    }
    if(party.details.type == 'company')
        Object.assign(party.identifier, { scheme: 'Registro Nacional', uri: 'http://www.registronacional.go.cr/' });
    else
        Object.assign(party.identifier, { scheme: 'Tribunal Supremo de Elecciones', uri: 'https://www.tse.go.cr/' });

    return party;
}

function buyerObject(contract) {
    let partyName = contract.institucion;
    const partyID = laundry.simpleName(laundry.launder(partyName));

    return {
        name: partyName,
        id: partyID
    }
}

export function buyerPartyObject(contract) {
    let geoInfo = getAdministrativeInfo(contract.institucion);
    const partyName = contract.institucion;
    const partyID = laundry.simpleName(laundry.launder(partyName));

    const party = {
        id: partyID,
        name: partyName,
        roles: ['buyer'],
        address: {
            countryName: 'Costa Rica',
        },
        details: {
            govLevel: geoInfo.govLevel,
            type: 'institution',
            classification: 'unidad-compradora'
        }
    };
    if(geoInfo.hasOwnProperty('municipio')) Object.assign(party.address, { region: geoInfo.provincia, locality: geoInfo.municipio });

    return party;
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

function getAdministrativeInfo(institution) {
    switch(institution) {
        case "AGENCIA DE PROTECCION DE DATOS DE LOS HABITANTES - PRODHAB":
        case "ASAMBLEA LEGISLATIVA":
        case "ASOCIACION CRUZ ROJA COSTARRICENSE":
        case "AUTORIDAD REGULADORA DE LOS SERVICIOS PUBLICOS":
        case "B N SOCIEDAD ADMINISTRADORA DE FONDOS DE INVERSION SOCIEDAD ANONIMA":
        case "Banco Central de Costa Rica":
        case "BANCO DE COSTA RICA":
        case "BANCO HIPOTECARIO DE LA VIVIENDA":
        case "Banco Nacional de Costa Rica":
        case "BANCO POPULAR Y DE DESARROLLO COMUNAL":
        case "BCR CORREDORA DE SEGUROS SOCIEDAD ANONIMA":
        case "BCR PENSION OPERADORA DE PLANES DE PENSIONES COMPLEMENTARIAS SOCIEDAD ANONIMA":
        case "BCR Sociedad Administradora de Fondos de Inversión, S.A.":
        case "BCR VALORES SOCIEDAD ANONIMA":
        case "BENEMERITO CUERPO DE BOMBEROS DE COSTA RICA":
        case "BN SOCIEDAD CORREDORA DE SEGUROS SOCIEDAD ANONIMA":
        case "BN Valores Puesto de Bolsa, S.A.":
        case "BN VITAL OPERADORA DE PLANES DE PENSIONES COMPLEMENTARIAS SOCIEDAD ANONIMA":
        case "CABLEVISION DE COSTA RICA CVCR SOCIEDAD ANONIMA":
        case "Caja Costarricense de Seguro Social":
        case "CASA CULTURAL DE PUNTARENAS":
        case "CENTRO COSTARRICENSE PRODUCCION CINEMATOGRAFICA":
        case "CENTRO CULTURAL E HISTORICO JOSE FIGUERES FERRER":
        case "CENTRO NACIONAL DE LA MUSICA":
        case "COLEGIO DE PERIODISTAS DE COSTA RICA":
        case "COLEGIO UNIVERSITARIO DE CARTAGO":
        case "COLEGIO UNIVERSITARIO DE LIMON":
        case "COMISION NACIONAL DE INVESTIGACION EN SALUD":
        case "Comisión Nacional de Préstamos para Educación":
        case "COMISION NACIONAL DE PREVENCION DE RIESGOS Y ATENCION DE EMERGENCIAS":
        case "COMISION NACIONAL DE VACUNACION Y EPIDEMIOLOGIA":
        case "COMISION NACIONAL PARA LA GESTION DE LA BIODIVERSIDAD":
        case "COMISION PARA EL ORDENAMIENTO Y MANEJO DE LA CUENCA DEL RIO REVENTAZON":
        case "COMPAÑÍA NACIONAL DE FUERZA Y LUZ SOCIEDAD ANÓNIMA":
        case "CONSEJO DE SALUD OCUPACIONAL":
        case "CONSEJO DE SEGURIDAD VIAL":
        case "CONSEJO DE TRANSPORTE PUBLICO":
        case "CONSEJO NACIONAL DE CLUBES 4-S":
        case "CONSEJO NACIONAL DE CONCESIONES":
        case "CONSEJO NACIONAL DE LA PERSONA ADULTA MAYOR":
        case "Consejo Nacional de la Política Pública de la Persona Jóven":
        case "CONSEJO NACIONAL DE PERSONAS CON DISCAPACIDAD":
        case "CONSEJO NACIONAL DE RECTORES":
        case "Consejo Nacional de Vialidad":
        case "Consejo Nacional para Investigaciones Científicas y Tecnológicas":
        case "Consejo Rector del Sistema de Banca para el Desarrollo":
        case "CONSEJO SUPERIOR DE EDUCACIÓN":
        case "CONSEJO TECNICO DE AVIACION CIVIL":
        case "Contraloría General de la Republica":
        case "CONTRATO FIDEICOMISO INMOBILIARIO PODER JUDICIAL 2015":
        case "CONTRATO FIDEICOMISO INMOBILIARIO TRIBUNAL REGISTRAL ADMINISTRATIVO BCR 2014":
        case "CORPORACION GANADERA":
        case "Correos de Costa Rica S.A.":
        case "Defensoría de los Habitantes de la República":
        case "DEPOSITO AGRICOLA DE CARTAGO SOCIEDAD ANONIMA":
        case "DIRECCION NACIONAL DE CEN-CINAI":
        case "DIRECCION NACIONAL DE NOTARIADO":
        case "FIDEICOMISO 872 MS-CTAMS-BNCR":
        case "Fideicomiso Corredor Vial San José San Ramón y sus radiales 2016":
        case "FIDEICOMISO DE TITULARIZACION INMOBILIARIO ICE - BCR":
        case "FIDEICOMISO FONATT JADGME - BCR":
        case "FIDEICOMISO FONDO ESPECIAL DE MIGRACIÓN JADGME - BCR":
        case "FIDEICOMISO FONDO SOCIAL MIGRATORIO JADGME - BCR":
        case "FIDEICOMISO INMOBILIARIO ARESEP BCR 2018":
        case "FIDEICOMISO INMOBILIARIO ASAMBLEA LEGISLATIVA -BCR 2011":
        case "FIDEICOMISO INMOBILIARIO CCSS BCR DOS MIL DIECISIETE":
        case "FIDEICOMISO INMOBILIARIO JUDESUR BCR":
        case "Fondo Nacional de Becas":
        case "FONDO NACIONAL DE FINANCIAMIENTO FORESTAL":
        case "INS INVERSIONES SOCIEDAD ADMINISTRADORA DE FONDOS DE INVERSION SOCIEDAD ANONIMA":
        case "INS SERVICIOS SOCIEDAD ANONIMA":
        case "INS VALORES PUESTO DE BOLSA SOCIEDAD ANONIMA":
        case "Instituto Costarricense de Acueductos y Alcantarillados":
        case "Instituto Costarricense de Electricidad":
        case "INSTITUTO COSTARRICENSE DE FERROCARRILES":
        case "INSTITUTO COSTARRICENSE DE INVESTIGACION Y ENSEÑANZA EN NUTRICION Y SALUD":
        case "INSTITUTO COSTARRICENSE DE PESCA Y ACUICULTURA":
        case "Instituto Costarricense de Puertos del Pacífico":
        case "Instituto Costarricense de Turismo":
        case "INSTITUTO COSTARRICENSE DEL DEPORTE Y LA RECREACION":
        case "INSTITUTO COSTARRICENSE SOBRE DROGAS":
        case "INSTITUTO DE DESARROLLO PROFESIONAL ULADISLAO GÁMEZ SOLANO":
        case "INSTITUTO DE DESARROLLO RURAL":
        case "INSTITUTO DE FOMENTO Y ASESORIA MUNICIPAL":
        case "Instituto del Café de Costa Rica":
        case "Instituto Mixto de Ayuda Social":
        case "INSTITUTO NACIONAL DE APRENDIZAJE":
        case "INSTITUTO NACIONAL DE ESTADISTICA Y CENSOS":
        case "INSTITUTO NACIONAL DE FOMENTO COOPERATIVO":
        case "INSTITUTO NACIONAL DE INNOVACION Y TRANSFERENCIA EN TECNOLOGIA AGROPECUARIA":
        case "INSTITUTO NACIONAL DE LAS MUJERES":
        case "Instituto Nacional de Seguros":
        case "INSTITUTO NACIONAL DE VIVIENDA Y URBANISMO":
        case "INSTITUTO SOBRE ALCOHOLISMO Y FARMACODEPENDENCIA":
        case "INSTITUTO TECNOLOGICO DE COSTA RICA":
        case "Junta Administrativa de la Dirección General de Migración y Extranjería":
        case "JUNTA ADMINISTRATIVA DEL ARCHIVO NACIONAL":
        case "JUNTA ADMINISTRATIVA DEL COLEGIO TECNICO PROFESIONAL DE ULLOA - HEREDIA":
        case "JUNTA ADMINISTRATIVA DEL REGISTRO NACIONAL":
        case "JUNTA ADMINISTRATIVA DEL SERVICIO ELECTRICO MUNICIPAL DE CARTAGO":
        case "JUNTA ADMINISTRATIVA IMPRENTA NACIONAL":
        case "Junta Administrativa liceo de Tambor":
        case "JUNTA DE ADMINISTRACION PORTUARIA Y DE DESARROLLO ECONOMICO DE LA VERTIENTE ATLANTICA":
        case "Junta de Desarrollo Regional de la Zona Sur de la Provincia de Puntarenas":
        case "Junta de Educación de la Escuela de Holanda":
        case "Junta de Educación Escuela Tuetal Sur Alajuela":
        case "JUNTA DE PROTECCION SOCIAL":
        case "LABORATORIO COSTARRICENSE DE METROLOGIA":
        case "MINISTERIO DE AGRICULTURA Y GANADERIA":
        case "MINISTERIO DE AMBIENTE Y ENERGIA":
        case "MINISTERIO DE CIENCIA, TECNOLOGIA Y TELECOMUNICACIONES":
        case "MINISTERIO DE COMERCIO EXTERIOR":
        case "MINISTERIO DE CULTURA Y JUVENTUD":
        case "Ministerio de Economía, Industria y Comercio":
        case "MINISTERIO DE EDUCACION PUBLICA":
        case "Ministerio de Hacienda":
        case "MINISTERIO DE JUSTICIA Y PAZ":
        case "MINISTERIO DE LA PRESIDENCIA":
        case "MINISTERIO DE OBRAS PUBLICAS Y TRANSPORTES":
        case "MINISTERIO DE PLANIFICACION NACIONAL Y POLITICA ECONOMICA":
        case "MINISTERIO DE RELACIONES EXTERIORES Y CULTO":
        case "MINISTERIO DE SALUD":
        case "MINISTERIO DE SEGURIDAD PUBLICA":
        case "MINISTERIO DE TRABAJO Y SEGURIDAD SOCIAL":
        case "MINISTERIO DE VIVIENDA Y ASENTAMIENTOS HUMANOS":
        case "MINISTERIO GOBERNACION Y POLICIA":
        case "MUSEO ARTE Y DISEÑO CONTEMPORANEO":
        case "Museo de Arte Costarricense":
        case "MUSEO DR. RAFAEL ANGEL CALDERON GUARDIA":
        case "MUSEO HISTORICO CULTURAL JUAN SANTAMARIA":
        case "MUSEO NACIONAL DE COSTA RICA":
        case "OFICINA DE COOPERACION INTERNACIONAL DE LA SALUD":
        case "Operadora de Pensiones Complementarias y de Capitalización Laboral de la C.C.S.S.":
        case "OPERADORA DE PLANES DE PENSIONES COMPLEMENTARIAS DEL BANCO POPULAR Y DE DESARROLLO COMUNAL SOCIEDAD":
        case "PATRONATO DE CONSTRUCCIONES, INSTALACIONES Y ADQUISICION DE BIENES":
        case "PATRONATO NACIONAL DE CIEGOS":
        case "PATRONATO NACIONAL DE LA INFANCIA":
        case "Popular Seguros, Correduría de Seguros S.A.":
        case "POPULAR SOCIEDAD DE FONDOS DE INVERSIÓN SOCIEDAD ANÓNIMA":
        case "POPULAR VALORES PUESTO DE BOLSA SOCIEDAD ANONIMA":
        case "PROCURADURIA GENERAL DE LA REPUBLICA":
        case "Programa Integral de Mercadeo Agropecuario":
        case "Promotora de Comercio Exterior":
        case "RADIOGRÁFICA COSTARRICENSE SOCIEDAD ANÓNIMA":
        case "REFINADORA COSTARRICENSE DE PETROLEO SOCIEDAD ANONIMA":
        case "SERVICIO FITOSANITARIO DEL ESTADO":
        case "SERVICIO NACIONAL DE AGUAS SUBTERRANEAS RIEGO Y AVENAMIENTO":
        case "SERVICIO NACIONAL DE SALUD ANIMAL":
        case "Sistema de Emergencias 9-1-1":
        case "SISTEMA NACIONAL DE ACREDITACIÓN DE LA EDUCACIÓN SUPERIOR":
        case "SISTEMA NACIONAL DE AREAS DE CONSERVACION":
        case "SISTEMA NACIONAL DE EDUCACION MUSICAL":
        case "SISTEMA NACIONAL DE RADIO Y TELEVISIÓN SOCIEDAD ANÓNIMA":
        case "SUPERINTENDENCIA DE TELECOMUNICACIONES":
        case "TEATRO NACIONAL DE COSTA RICA":
        case "TEATRO POPULAR MELICO SALAZAR":
        case "TEST INST":
        case "TEST INSTITUCION GOBIERNO CENTRAL":
        case "TRIBUNAL REGISTRAL ADMINISTRATIVO":
        case "TRIBUNAL SUPREMO DE ELECCIONES":
        case "Universidad de Costa Rica":
        case "UNIVERSIDAD ESTATAL A DISTANCIA":
        case "UNIVERSIDAD NACIONAL":
        case "Universidad Técnica Nacional":
        case "FIDEICOMISO DE DESARROLLO DE OBRA PÚBLICA PARA EL PANI EN BENEFICIO DE LA NIÑEZ Y LA ADOLESCENCIA":
            return { govLevel: "country" };
        case "Asociación de Desarrollo Integral de Villa Bonita": return { govLevel: "city", provincia: "Alajuela", municipio: "Alajuela" }
        case "Comité Cantonal de Deportes y Recreación de Alajuela": return { govLevel: "city", provincia: "Alajuela", municipio: "Alajuela" }
        case "Comité Cantonal de Deportes y Recreación de Belén": return { govLevel: "city", provincia: "Heredia", municipio: "Belén" }
        case "COMITÉ CANTONAL DE DEPORTES Y RECREACIÓN DE CARTAGO": return { govLevel: "city", provincia: "Cartago", municipio: "Cartago" }
        case "COMITE CANTONAL DE DEPORTES Y RECREACION DE ESCAZU": return { govLevel: "city", provincia: "San José", municipio: "Escazú" }
        case "COMITE CANTONAL DE DEPORTES Y RECREACION DE HEREDIA": return { govLevel: "city", provincia: "Heredia", municipio: "Heredia" }
        case "Comité Cantonal de Deportes y Recreación de Liberia": return { govLevel: "city", provincia: "Guanacaste", municipio: "Liberia" }
        case "COMITE CANTONAL DE DEPORTES Y RECREACION DE MORAVIA": return { govLevel: "city", provincia: "San José", municipio: "Moravia" }
        case "Comité Cantonal de Deportes y Recreación de Paraíso": return { govLevel: "city", provincia: "Cartago", municipio: "Paraíso" }
        case "Comité Cantonal de Deportes y Recreación de Pérez Zeledón": return { govLevel: "city", provincia: "San José", municipio: "Pérez Zeledón" }
        case "Concejo Municipal de Distrito de Colorado": return { govLevel: "city", provincia: "Guanacaste", municipio: "Abangares" }
        case "Concejo Municipal de Distrito de Lepanto": return { govLevel: "city", provincia: "Puntarenas", municipio: "Puntarenas" }
        case "Concejo Municipal de Distrito de Monte Verde": return { govLevel: "city", provincia: "Puntarenas", municipio: "Puntarenas" }
        case "MUNICIPALIDAD DE ACOSTA": return { govLevel: "city", provincia: "San José", municipio: "Acosta" }
        case "Municipalidad de Alajuela": return { govLevel: "city", provincia: "Alajuela", municipio: "Alajuela" }
        case "Municipalidad de Alajuelita": return { govLevel: "city", provincia: "San José", municipio: "Alajuelita" }
        case "MUNICIPALIDAD DE ALVARADO DE PACAYAS": return { govLevel: "city", provincia: "Cartago", municipio: "Pacayas" }
        case "Municipalidad de Aserri": return { govLevel: "city", provincia: "San José", municipio: "Aserrí" }
        case "Municipalidad de Atenas": return { govLevel: "city", provincia: "Alajuela", municipio: "Atenas" }
        case "Municipalidad de Barva": return { govLevel: "city", provincia: "Heredia", municipio: "Barva" }
        case "Municipalidad de Belén": return { govLevel: "city", provincia: "Heredia", municipio: "Belén" }
        case "Municipalidad de Buenos Aires": return { govLevel: "city", provincia: "Puntarenas", municipio: "Buenos Aires" }
        case "Municipalidad de Carrillo": return { govLevel: "city", provincia: "Guanacaste", municipio: "Carrillo" }
        case "Municipalidad de Cartago": return { govLevel: "city", provincia: "Cartago", municipio: "Cartago" }
        case "MUNICIPALIDAD DE CORREDORES": return { govLevel: "city", provincia: "Puntarenas", municipio: "Corredores" }
        case "Municipalidad de Coto Brus": return { govLevel: "city", provincia: "Puntarenas", municipio: "Coto Brus" }
        case "Municipalidad de Curridabat": return { govLevel: "city", provincia: "San José", municipio: "Curridabat" }
        case "MUNICIPALIDAD DE DESAMPARADOS": return { govLevel: "city", provincia: "San José", municipio: "Desamparados" }
        case "MUNICIPALIDAD DE EL GUARCO": return { govLevel: "city", provincia: "Cartago", municipio: "El Guarco" }
        case "Municipalidad de Escazu": return { govLevel: "city", provincia: "San José", municipio: "Escazú" }
        case "MUNICIPALIDAD DE ESPARZA": return { govLevel: "city", provincia: "Puntarenas", municipio: "Esparza" }
        case "MUNICIPALIDAD DE GARABITO": return { govLevel: "city", provincia: "Puntarenas", municipio: "Garabito" }
        case "Municipalidad de Golfito": return { govLevel: "city", provincia: "Puntarenas", municipio: "Golfito" }
        case "Municipalidad de Grecia": return { govLevel: "city", provincia: "Alajuela", municipio: "Grecia" }
        case "MUNICIPALIDAD DE GUÁCIMO": return { govLevel: "city", provincia: "Limón", municipio: "Guácimo" }
        case "Municipalidad de Heredia": return { govLevel: "city", provincia: "Heredia", municipio: "Heredia" }
        case "Municipalidad de Jiménez de Cartago": return { govLevel: "city", provincia: "Cartago", municipio: "Jímenez" }
        case "MUNICIPALIDAD DE LA UNION": return { govLevel: "city", provincia: "Cartago", municipio: "La Unión" }
        case "MUNICIPALIDAD DE LEON CORTES": return { govLevel: "city", provincia: "San José", municipio: "León Cortés" }
        case "Municipalidad de Liberia": return { govLevel: "city", provincia: "Guanacaste", municipio: "Liberia" }
        case "MUNICIPALIDAD DE LIMON": return { govLevel: "city", provincia: "Limón", municipio: "Limón" }
        case "Municipalidad de Los Chiles": return { govLevel: "city", provincia: "Alajuela", municipio: "Los Chiles" }
        case "MUNICIPALIDAD DE MATINA": return { govLevel: "city", provincia: "Limón", municipio: "Matina" }
        case "Municipalidad de Montes de Oca": return { govLevel: "city", provincia: "San José", municipio: "Montes de Oca" }
        case "Municipalidad de Montes de Oro": return { govLevel: "city", provincia: "Puntarenas", municipio: "Montes de Oro" }
        case "MUNICIPALIDAD DE MORA": return { govLevel: "city", provincia: "San José", municipio: "Mora" }
        case "Municipalidad de Moravia": return { govLevel: "city", provincia: "San José", municipio: "Moravia" }
        case "MUNICIPALIDAD DE NARANJO": return { govLevel: "city", provincia: "Alajuela", municipio: "Naranjo" }
        case "Municipalidad de Oreamuno": return { govLevel: "city", provincia: "Cartago", municipio: "Oreamuno" }
        case "MUNICIPALIDAD DE OROTINA": return { govLevel: "city", provincia: "Alajuela", municipio: "Orotina" }
        case "Municipalidad de Osa": return { govLevel: "city", provincia: "Puntarenas", municipio: "Osa" }
        case "MUNICIPALIDAD DE PALMARES.": return { govLevel: "city", provincia: "Alajuela", municipio: "Palmares" }
        case "Municipalidad de Paraíso": return { govLevel: "city", provincia: "Cartago", municipio: "Paraíso" }
        case "MUNICIPALIDAD DE PARRITA": return { govLevel: "city", provincia: "Puntarenas", municipio: "Parrita" }
        case "Municipalidad de Perez Zeledón": return { govLevel: "city", provincia: "San José", municipio: "Pérez Zeledón" }
        case "Municipalidad de Poás": return { govLevel: "city", provincia: "Alajuela", municipio: "Poás" }
        case "Municipalidad de Pococí": return { govLevel: "city", provincia: "Limón", municipio: "Pococí" }
        case "Municipalidad de Puntarenas": return { govLevel: "city", provincia: "Puntarenas", municipio: "Puntarenas" }
        case "Municipalidad de Puriscal": return { govLevel: "city", provincia: "San José", municipio: "Puriscal" }
        case "Municipalidad de Quepos": return { govLevel: "city", provincia: "Puntarenas", municipio: "Quepos" }
        case "Municipalidad de Río Cuarto": return { govLevel: "city", provincia: "Alajuela", municipio: "Río Cuarto" }
        case "Municipalidad de San Carlos": return { govLevel: "city", provincia: "Alajuela", municipio: "San Carlos" }
        case "MUNICIPALIDAD DE SAN ISIDRO DE HEREDIA": return { govLevel: "city", provincia: "Heredia", municipio: "San Isidro" }
        case "MUNICIPALIDAD DE SAN JOSE": return { govLevel: "city", provincia: "San José", municipio: "San José" }
        case "MUNICIPALIDAD DE SAN MATEO": return { govLevel: "city", provincia: "Alajuela", municipio: "San Mateo" }
        case "MUNICIPALIDAD DE SAN PABLO DE HEREDIA": return { govLevel: "city", provincia: "Heredia", municipio: "San Pablo" }
        case "MUNICIPALIDAD DE SAN RAFAEL DE HEREDIA": return { govLevel: "city", provincia: "Heredia", municipio: "San Rafael" }
        case "MUNICIPALIDAD DE SAN RAMON": return { govLevel: "city", provincia: "Alajuela", municipio: "San Ramón" }
        case "MUNICIPALIDAD DE SANTA ANA": return { govLevel: "city", provincia: "San José", municipio: "Santa Ana" }
        case "Municipalidad de Santa Barbara": return { govLevel: "city", provincia: "Heredia", municipio: "Santa Bárbara" }
        case "Municipalidad de Santa Cruz": return { govLevel: "city", provincia: "Guanacaste", municipio: "Santa Cruz" }
        case "MUNICIPALIDAD DE SANTO DOMINGO": return { govLevel: "city", provincia: "Heredia", municipio: "Santo Domingo" }
        case "Municipalidad de Sarapiquí": return { govLevel: "city", provincia: "Heredia", municipio: "Sarapiquí" }
        case "MUNICIPALIDAD DE SARCHI": return { govLevel: "city", provincia: "Alajuela", municipio: "Sarchí" }
        case "Municipalidad de Talamanca": return { govLevel: "city", provincia: "Limón", municipio: "Talamanca" }
        case "Municipalidad de Tarrazú": return { govLevel: "city", provincia: "San José", municipio: "Tarrazú" }
        case "Municipalidad de Tibás": return { govLevel: "city", provincia: "San José", municipio: "Tibás" }
        case "Municipalidad de Tilarán": return { govLevel: "city", provincia: "Guanacaste", municipio: "Tilarán" }
        case "MUNICIPALIDAD DE TURRIALBA": return { govLevel: "city", provincia: "Cartago", municipio: "Turrialba" }
        case "Municipalidad de Turrubares": return { govLevel: "city", provincia: "San José", municipio: "Turrubares" }
        case "MUNICIPALIDAD DE UPALA": return { govLevel: "city", provincia: "Alajuela", municipio: "Upala" }
        case "Municipalidad de Zarcero": return { govLevel: "city", provincia: "Alajuela", municipio: "Zarcero" }
        case "Municipalidad del Cantón de Flores": return { govLevel: "city", provincia: "Heredia", municipio: "Flores" }
        case "Municipalidad Vázquez De Coronado": return { govLevel: "city", provincia: "San José", municipio: "Vázquez De Coronado" }
        case "Junta Educación Escuela Fraijanes Sabanilla de Alajuela": return { govLevel: "city", provincia: "Alajuela", municipio: "Alajuela" }
        default: return { govLevel: 'country' }
    }
}

function budgetObject(contract) {
    if (contract.hasOwnProperty('monto_estimado')) {
        return {
            amount: {
                amount: contract.monto_estimado_sum,
                currency: contract.moneda_monto_estimado
            }
        }
    }
    return null;
}

export function planningObject(contract) {
    let planning = {
        budget: budgetObject(contract),
    };
    if( !_.isEmpty(planning.budget) ) {
        return planning;
    }
    return null;
}


export function releaseObject({contract, metadata}) {
    // doc is a contract
    if (!contract.numero_procedimiento) {
        return {};
    }

    if(contract.monto) {
        if( typeof contract.monto == "string" ) contract.monto = parseFloat( contract.monto.replace(',', '.') );
        else contract.monto = parseFloat( contract.monto );
    }
    if(contract.monto_estimado) {
        if( typeof contract.monto_estimado == "string" ) contract.monto_estimado = parseFloat( contract.monto_estimado.replace(',', '.') );
        else contract.monto_estimado = parseFloat( contract.monto_estimado );
    }
    if(contract.fecha_notificacion) contract.fecha_notificacion = dateToISOString(contract.fecha_notificacion);
    if(contract.firma_contrato) contract.firma_contrato = dateToISOString(contract.firma_contrato);
    if(contract.numero_contrato) contract.numero_contrato = contract.numero_contrato.toString();
    if(contract.cedula_adjudicatario) contract.cedula_adjudicatario = contract.cedula_adjudicatario.toString();

    const parties = getParties(contract);

    const release = {
        ocid: nP2Ocid(contract.numero_procedimiento),
        id: contract.numero_procedimiento,
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
            name: "Sistema Integrado de Compras Públicas",
            uri: "https://www.sicop.go.cr/index.jsp"
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
    // return release;
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
