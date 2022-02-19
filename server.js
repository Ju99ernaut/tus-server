'use strict';

const path = require('path');
const fs = require('fs');
const pjson = require('./package.json');
const assert = require('assert');

const Server = require('tus-node-server').Server;
const FileStore = require('tus-node-server').FileStore;
const GCSDataStore = require('tus-node-server').GCSDataStore;
const S3Store = require('tus-node-server').S3Store;
const EVENTS = require('tus-node-server').EVENTS;

const server = new Server();

const data_store = process.env.DATA_STORE || 'FileStore';

switch (data_store) {
    case 'GCSDataStore':
        server.datastore = new GCSDataStore({
            path: '/files',
            projectId: 'vimeo-open-source',
            keyFilename: path.resolve(__dirname, '../keyfile.json'),
            bucket: 'tus-node-server',
        });
        break;

    case 'S3Store':
        assert.ok(process.env.AWS_ACCESS_KEY_ID, 'environment variable `AWS_ACCESS_KEY_ID` must be set');
        assert.ok(process.env.AWS_SECRET_ACCESS_KEY, 'environment variable `AWS_SECRET_ACCESS_KEY` must be set');
        assert.ok(process.env.AWS_BUCKET, 'environment variable `AWS_BUCKET` must be set');
        assert.ok(process.env.AWS_REGION, 'environment variable `AWS_REGION` must be set');

        server.datastore = new S3Store({
            path: '/files',
            bucket: process.env.AWS_BUCKET,
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
            partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MB,
        });
        break;

    default:
        server.datastore = new FileStore({
            path: '/files',
        });
}

/**
 * Basic GET handler to serve statci files
 * 
 * @param {Object} req http.incomingMessage
 * @param {Object} res http.ServerResponse
 */
const writeFile = (req, res) => {
    let filename = req.url;
    if (filename == '/') {
        filename = '/index.html';
    }

    filename = path.join(process.cwd(), filename);

    fs.readFile(filename, 'binary', (err, file) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.write(err);
            res.end();
            return;
        }

        // Update version
        file = file.replace('version', `v${pjson.version}`);

        res.writeHead(200);
        res.write(file);
        res.end();
    });
}

server.get('/', writeFile);
server.get('/index.html', writeFile);

server.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
    console.log(`[${new Date().toLocaleTimeString()}] [EVENT HOOK] Upload complete for file ${event.file.id}`);
});
server.on(EVENTS.EVENT_FILE_DELETED, (event) => {
    console.log(`[${new Date().toLocaleTimeString()}] [EVENT HOOK] Delete complete for file ${event.file.id}`);
});

// // this is the express stile ;)
// const express = require('express');
// const app = express();
// const uploadApp = express();
// uploadApp.all('*', server.handle.bind(server));
// app.use('/uploads', uploadApp);
// app.get('*', writeFile);

const host = process.env.TUS_HOST || '127.0.0.1';
const port = parseInt(process.env.PORT) || 1080;
server.listen({ host, port }, () => {
    console.log(`[${new Date().toLocaleTimeString()}] tus server listening at http://${host}:${port} using ${data_store}`);
});