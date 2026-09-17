import multer from 'multer';

import { config } from '../config.js';
import { storageDir } from '../services/storage.js';
import { newId } from '../utils/id.js';

const MAX_FILES_PER_UPLOAD = 200;

/** Internal names only: the user's filename is kept as display text, never as a path. */
const audioStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, storageDir('uploads')),
  filename: (_req, _file, callback) => callback(null, newId()),
});

const artworkStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, storageDir('uploads')),
  filename: (_req, _file, callback) => callback(null, `${newId()}.art`),
});

export function audioUploadMiddleware() {
  return multer({
    storage: audioStorage,
    limits: { fileSize: config().maxUploadBytes, files: MAX_FILES_PER_UPLOAD },
  }).array('files', MAX_FILES_PER_UPLOAD);
}

export function artworkUploadMiddleware() {
  return multer({
    storage: artworkStorage,
    limits: { fileSize: config().maxArtworkBytes, files: 1 },
  }).single('artwork');
}
