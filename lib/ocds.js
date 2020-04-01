import Ajv from 'ajv';
import omit from 'lodash.omit';

const commandLineArgs = require('command-line-args');
const optionDefinitions = [
  { name: 'transformer', alias: 't', type: String },
];
const args = commandLineArgs(optionDefinitions);

let transformer = '';
if(args.transformer) {
    transformer = args.transformer;
}
const transformerName = './ocds' + transformer + 'Data';
const {
  releasePackage,
  releaseObject,
} = require(transformerName);

import cleanValues from './format';
import releaseSchema from '../schema/release-schema.json';
import releasePackageSchema from '../schema/release-package-schema.json';
const ajv = new Ajv({allErrors: true});

// configure ajv for schema draft 04
import jsonSchemaDraftFour from 'ajv/lib/refs/json-schema-draft-04.json';
ajv.addMetaSchema(jsonSchemaDraftFour);

export default class Release {
  constructor({ cnetDocument, release, metadata }) {
    this.release = release;
    delete metadata.body;
    this.metadata = metadata;

    if (!release) {
      const document = cleanValues(cnetDocument);

      if (!metadata) {
        metadata = omit(document, 'body');
      }

      if (document.ANUNCIO) {
        Object.assign(metadata, { publisherUri: document.ANUNCIO })
      }
      this.release = releaseObject({
        contract: document,
        metadata,
      });
    }
    if (this.release) {
      this.package = releasePackage({
        release: this.release,
        metadata,
      });
    }
  }

  get isValid() {
    // BOOL
    const isValid = ajv.validate(releaseSchema, this.release);
    if (!isValid) {
      throw ajv.errors;
    }
    return isValid;
  }

  get isValidPackage() {
    // BOOL
    const isValid = ajv.validate(releasePackageSchema, this.package);
    if (!isValid) {
      throw ajv.errors;
    }
    return isValid;
  }

}
