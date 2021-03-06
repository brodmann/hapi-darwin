'use strict';

const { join, parse } = require('path');
const Assert = require('assert');
const sharp = require('sharp');
const globby = require('globby');
const mkdirp = require('mkdirp');

/**
 * @typedef {Object} Version
 * @property {number} width
 * @property {number} height
 * @property {boolean} enlargement
 * @property {string} suffix
 *
 * @typedef {Object} VersionDetails
 * @property {string} filename uploaded image version filename
 * @property {string} path absolute path of uploaded image version
 */

/**
 * Auto correct file extension depends on mime type and creates image versions.
 * @param {Stream} file File to be upload
 * @param {Object} options
 * @param {string} options.dest
 * @param {string} options.name
 * @param {boolean} options.safeName
 * @param {string[]} options.formats
 * @param {number} options.maxFiles
 * @param {number} options.minPixels
 * @param {number} options.maxPixels
 * @param {Version[]} options.versions
 * @param {boolean} options.addOriginal
 * @returns {Promise<VersionDetails|VersionDetails[]>}
 */
const fileHandler = async (file, options) => {

    const pipeline = sharp();

    file.pipe(pipeline);

    // $lab:coverage:off$
    pipeline.on('error', (err) => {

        throw new Error(err);
    });
    // $lab:coverage:on$

    const metadata = await pipeline.metadata();

    const {
        dest,
        formats,
        safeName,
        versions,
        minPixels,
        maxPixels,
        addOriginal,
        name = parse(file.hapi.filename).name
    } = options;

    if (!formats.includes(metadata.format)) {
        throw new Error('File type is not valid.');
    }

    let discriminator = '';
    const ext = metadata.format;

    if (safeName) {
        const paths = await globby(join(dest, `${name}*.${ext}`));

        let numbers = paths
            .map((path) => {

                const match = /\-(\d+)\.\w+$/.exec(path);

                return match && match[1];
            })
            .map(num => +num);

        if (numbers.length) {
            numbers = [...numbers.filter(num => !Number.isNaN(num)), 0];

            discriminator = `-${Math.max(...numbers) + 1}`;
        }
    }

    const pixels = metadata.width * metadata.height;

    if (pixels < minPixels || pixels > maxPixels) {
        throw new Error('Image pixels count is out of the range.');
    }

    const promises = versions.map(
        async ({ width, height, enlargement, suffix }) => {

            const instance = pipeline
                .clone()
                .resize(width, height)
                .withoutEnlargement(!enlargement);

            const { info } = await instance.toBuffer({ resolveWithObject: true });

            const filename = `${name}${suffix || `-${info.width}x${info.height}`}${discriminator}.${ext}`;
            const path = join(dest, filename);

            await instance.toFile(path);

            return { filename, path };
        }
    );

    if (!versions.length || addOriginal) {
        const filename = `${name}${discriminator}.${ext}`;
        const path = join(options.dest, filename);

        promises.unshift(
            pipeline.clone().toFile(path).then(() => ({ filename, path }))
        );
    }

    const details = await Promise.all(promises);

    return details.length > 1 ? details : details[0];
};

/**
 * Distribute input files to fileHandler.
 * @param {Stream|Stream[]} files File(s) to be upload
 * @param {Object} options Options set during plugin registration
 * @param {string} options.dest
 * @param {string|string[]} options.names
 * @param {boolean} options.safeName
 * @param {string[]} options.formats
 * @param {number} options.maxFiles
 * @param {number} options.minPixels
 * @param {number} options.maxPixels
 * @param {Version[]} options.versions
 * @param {boolean} options.addOriginal
 * @returns {Promise<VersionDetails|(VersionDetails|VersionDetails[])[]>}
 */
module.exports = async (files, options) => {

    Assert.ok(files, 'Missing file argument.');
    Assert.ok(options, 'Missing options argument.');

    if (!Array.isArray(files)) {
        files = [files];
    }

    if (!Array.isArray(options.names)) {
        options.names = [options.names];
    }

    if (files.length > options.maxFiles) {
        throw new Error('Out of maximum files number');
    }

    mkdirp.sync(options.dest);

    const uploads = await Promise.all(
        files.map(
            (file, index) => fileHandler(file, { ...options, name: options.names[index] })
        )
    );

    return files.length > 1 ? uploads : uploads[0];
};
