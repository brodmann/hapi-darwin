'use strict';
const Hapi = require('hapi');
const { expect } = require('code');
const { describe, it } = exports.lab = require('lab').script();

const Plugin = require('../');

describe('Plugin Registration', () => {

    it('should registers successfully and expose upload method', () => {

        const server = new Hapi.Server();

        expect(async () => await server.register(Plugin)).to.not.throws();
        expect(server.plugins[Plugin.name].uploader).to.be.function();
    });
});
