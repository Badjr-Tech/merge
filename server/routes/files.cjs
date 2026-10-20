const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer'); // Import multer
const prisma = require('../utils/prisma.cjs');
const blob = require('../utils/blob.cjs');
const { handleUpload } = require('@vercel/blob/client');

// Files are stored in Postgres as bytes. Vercel serverless functions reject request bodies over 4.5 MB,
// so the effective ceiling is 4 MB per file (leaves room for multipart overhead).
const MAX_FILE_BYTES = 4 * 1024 * 1024;
// Uploading straight from the browser to Blob skips the serverless request body entirely,
// so the 4.5 MB platform limit does not apply. This is the real ceiling for that path.
const MAX_DIRECT_BYTES = 100 * 1024 * 1024;
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

// GET api/files/limits — what the client should enforce before uploading
router.get('/limits', auth, (req, res) => {
  const direct = blob.configured();
  res.json({
    maxFileBytes: direct ? MAX_DIRECT_BYTES : MAX_FILE_BYTES,
    maxFileLabel: direct ? '100 MB' : '4 MB',
    direct, // when true the client uploads to Blob itself instead of posting the bytes here
  });
});

// @route   POST api/files/upload-token
// @desc    Mint a short-lived token so the browser can upload straight to Blob.
// The file never passes through this server, which is what lifts the 4.5 MB body limit.
// The token is scoped to this workspace's prefix, so it cannot be used to write anywhere else.
router.post('/upload-token', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    if (!blob.configured()) return res.status(503).json({ msg: 'Large uploads are not available yet.' });
    const prefix = `files/${req.user.companyId}/`;
    const result = await handleUpload({
      body: req.body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        if (!String(pathname).startsWith(prefix)) throw new Error('Upload path is not allowed.');
        return {
          access: 'private',
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_DIRECT_BYTES,
          tokenPayload: JSON.stringify({ companyId: req.user.companyId, userId: req.user.id }),
        };
      },
      // Vercel calls this after the upload, but it cannot reach localhost, so the row is
      // created by POST /record instead. Kept so production has a no-op rather than a 500.
      onUploadCompleted: async () => {},
    });
    res.json(result);
  } catch (err) {
    console.error('Upload token error:', err.message);
    res.status(400).json({ msg: err.message || 'Could not start that upload.' });
  }
});

// @route   POST api/files/record
// @desc    Record a file the browser uploaded straight to Blob.
// Everything here is checked against storage rather than trusted: the blob must exist, and
// its path must sit under this workspace's prefix, so a caller cannot claim someone else's.
router.post('/record', auth, async (req, res) => {
  try {
    const { pathname, filename, category, notes, thumbnail } = req.body || {};
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    if (!pathname || !filename || !String(filename).trim()) return res.status(400).json({ msg: 'Filename is required' });
    const prefix = `files/${req.user.companyId}/`;
    if (!String(pathname).startsWith(prefix)) return res.status(403).json({ msg: 'That file does not belong to this workspace.' });

    const meta = await blob.stat(pathname);
    if (!meta) return res.status(404).json({ msg: 'That upload could not be found in storage.' });

    let thumbKey = null;
    const m = typeof thumbnail === 'string' ? thumbnail.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length <= 200 * 1024) {
        try { thumbKey = await blob.putPrivate(`thumbs/${req.user.companyId}/${Date.now()}.jpg`, buf, m[1]); } catch (e) { console.error('Thumbnail upload failed:', e.message); }
      }
    }

    const newFile = await prisma.file.create({
      data: {
        filename: String(filename).trim(),
        mimetype: meta.contentType || 'application/octet-stream',
        category: category || null,
        notes: notes ? String(notes).slice(0, 1000) : null,
        data: null,
        blobKey: pathname,
        size: meta.size,
        thumbKey,
        companyId: req.user.companyId,
        uploadedById: req.user.id,
      },
    });
    res.json({ id: newFile.id, filename: newFile.filename, category: newFile.category });
  } catch (err) {
    console.error('Record upload error:', err.message);
    res.status(500).json({ msg: 'Could not save that file.' });
  }
});

// @route   POST api/files/upload
// @desc    Upload a file
// @access  Private
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    // Get the new filename from the form data
    const { newFilename, category, notes } = req.body;
    if (!newFilename || newFilename.trim() === '') {
      return res.status(400).json({ msg: 'Filename is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    // Contents go to Blob when it is configured; without it we fall back to bytes in
    // Postgres so a missing token degrades to the old behaviour instead of losing the upload.
    let blobKey = null;
    if (blob.configured()) {
      try {
        blobKey = await blob.putPrivate(`files/${user.companyId}/${Date.now()}-${req.file.originalname}`, req.file.buffer, req.file.mimetype);
      } catch (e) {
        console.error('Blob upload failed, storing in Postgres instead:', e.message);
      }
    }

    // The browser renders the preview (page one of a PDF, or a downscaled image) and sends it
    // as a data URL. Done there because rendering a PDF needs a canvas, which serverless lacks.
    let thumbKey = null;
    const thumb = typeof req.body.thumbnail === 'string' ? req.body.thumbnail : '';
    const m = thumb.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (m && blob.configured()) {
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length <= 200 * 1024) {
        try {
          thumbKey = await blob.putPrivate(`thumbs/${user.companyId}/${Date.now()}.jpg`, buf, m[1]);
        } catch (e) {
          console.error('Thumbnail upload failed:', e.message);
        }
      }
    }

    const newFile = await prisma.file.create({
      data: {
        filename: newFilename.trim(), // Use the new filename
        mimetype: req.file.mimetype,
        category: category || null,
        notes: notes ? String(notes).slice(0, 1000) : null,
        data: blobKey ? null : req.file.buffer,
        blobKey,
        size: req.file.size,
        thumbKey,
        companyId: user.companyId,
        uploadedById: req.user.id,
      },
    });
    res.json({ id: newFile.id, filename: newFile.filename, category: newFile.category });

  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ msg: 'That file is too large. The maximum is 4 MB.' });
    }
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/files
// @desc    Get all files for the logged-in user's company
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const files = await prisma.file.findMany({
      where: {
        companyId: user.companyId,
      },
      select: {
        id: true,
        filename: true,
        mimetype: true,
        category: true,
        notes: true,
        size: true,
        thumbKey: true,
        createdAt: true,
        uploadedBy: {
          select: { id: true, username: true, name: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(files);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/files/:id
// @desc    Download/view a specific file
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const file = await prisma.file.findUnique({
      where: { id: req.params.id },
    });

    if (!file) {
      return res.status(404).json({ msg: 'File not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.companyId !== file.companyId) {
      return res.status(401).json({ msg: 'User not authorized to access this file' });
    }

    let body = file.data;
    if (file.blobKey) {
      const got = await blob.getBytes(file.blobKey);
      if (!got) return res.status(404).json({ msg: 'That file is no longer in storage.' });
      body = got.buffer;
    }
    if (!body) return res.status(404).json({ msg: 'That file has no contents.' });

    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `attachment; filename="${file.filename}"`, // 'attachment' for download, 'inline' for display
    });
    res.send(body);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/files/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id }, select: { id: true, companyId: true, uploadedById: true, blobKey: true, thumbKey: true } });
    if (!file || file.companyId !== req.user.companyId) return res.status(404).json({ msg: 'File not found' });
    if (file.uploadedById !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ msg: 'Not authorized to delete this file' });
    await prisma.file.delete({ where: { id: file.id } });
    // Drop the row first: an orphaned blob costs storage, an orphaned row shows a broken file.
    await blob.remove(file.blobKey);
    await blob.remove(file.thumbKey);
    res.json({ msg: 'File deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/files/:id/thumbnail
// @desc    Small preview image for the hover card, if one was generated at upload
router.get('/:id/thumbnail', auth, async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id }, select: { companyId: true, thumbKey: true } });
    if (!file || file.companyId !== req.user.companyId || !file.thumbKey) return res.status(404).end();
    const got = await blob.getBytes(file.thumbKey);
    if (!got) return res.status(404).end();
    res.set({ 'Content-Type': got.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    res.send(got.buffer);
  } catch (err) {
    console.error('Thumbnail error:', err.message);
    res.status(500).end();
  }
});

// Multer rejects oversize files before the route handler runs; turn that into a clean JSON error.
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ msg: 'That file is too large. The maximum is 4 MB.' });
  if (err && err.name === 'MulterError') return res.status(400).json({ msg: `Upload failed: ${err.message}` });
  return next(err);
});

module.exports = router;
