# transformer-ocds

Convert from any JSON structure to OCDS-JSON using a custom transformation specification. Input documents can be of any schema, output documents conform to the [OCDS release schema](https://standard.open-contracting.org/latest/en/schema/release/).

![Transform!](https://media.giphy.com/media/LZFc848TLIMPS/giphy.gif)

## Installation

From the Linux command line, run the following commands:

    sudo apt install git nodejs npm
    git clone ssh://git@gitlab.rindecuentas.org:2203/equipo-qqw/transformer-ocds.git
    cd transformer-ocds
    npm install

## Usage

    (stream of JSON lines, one object per line) | node transformer-ocds/bin/app.js -t TRANSFORMER | (stream of OCDS-JSON lines, one object per line)

## Options

    --transformer   -t  Name of the transformation to apply to the source documents (defaults to empty string)

The transformation specification must exist inside **lib/** with the name **ocdsTRANSFORMERData.js** and implement the **releaseObject** and **releasePackage** functions, which should return valid OCDS objects and packages respectively.

Available transformers:

*  **Compranet** (contracts from 2010-2017 published by CompranetPlus [here](https://sites.google.com/site/cnetuc/descargas))
*  **Compranet2019** (contracts published from 2018 onwards by CompranetPlus [here](https://sites.google.com/site/cnetuc/descargas))
*  **Compranet3** (contracts from 2002-2011 published by Compranet 3.0 [here](https://sites.google.com/site/cnetuc/contratos_cnet_3))
*  **Guatecompras** (contracts obtained by FOIA from the Guatemalan contracting platform [Guatecompras](http://www.guatecompras.gt/))
*  **Pot** (contracts published by Portal de Obligaciones de Transparencia (POT) [here](http://portaltransparencia.gob.mx/pot/repoServlet?archivo=contrato.zip))
*  **TDC** (contracts compiled manually for use in [Torre de Control](https://torredecontrol.projectpoder.org/))

The available sources should be converted to JSON objects (one object per line) before streaming into transformer-ocds.

## Additional notes

The output can be redirected to MongoDB using [stream2db](http://gitlab.rindecuentas.org/equipo-qqw/stream2db), which will insert each object as a document in the specified collection using the object's hash as its *_id* to avoid duplication.

You can compile [OCDS records](https://standard.open-contracting.org/latest/en/schema/records_reference/) using a combination of [ocds-unique](http://gitlab.rindecuentas.org/equipo-qqw/ocds-unique) and [record-compiler](http://gitlab.rindecuentas.org/equipo-qqw/record-compiler) to produce records from releases.
