const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer'); // Import multer
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Files are stored in Postgres as bytes. Vercel serverless functions reject request bodies over 4.5 MB,
// so the effective ceiling is 4 MB per file (leaves room for multipart overhead).
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

// GET api/files/limits — what the client should enforce before uploading
router.get('/limits', auth, (req, res) => {
  res.json({ maxFileBytes: MAX_FILE_BYTES, maxFileLabel: '4 MB' });
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

    const newFile = await prisma.file.create({
      data: {
        filename: newFilename.trim(), // Use the new filename
        mimetype: req.file.mimetype,
        category: category || null,
        notes: notes ? String(notes).slice(0, 1000) : null,
        data: req.file.buffer, // Store the file buffer directly
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

    // Set headers for file download
    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': `attachment; filename="${file.filename}"`, // 'attachment' for download, 'inline' for display
    });

    res.send(file.data); // Send the file buffer
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/files/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id }, select: { id: true, companyId: true, uploadedById: true } });
    if (!file || file.companyId !== req.user.companyId) return res.status(404).json({ msg: 'File not found' });
    if (file.uploadedById !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ msg: 'Not authorized to delete this file' });
    await prisma.file.delete({ where: { id: file.id } });
    res.json({ msg: 'File deleted' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Multer rejects oversize files before the route handler runs; turn that into a clean JSON error.
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ msg: 'That file is too large. The maximum is 4 MB.' });
  if (err && err.name === 'MulterError') return res.status(400).json({ msg: `Upload failed: ${err.message}` });
  return next(err);
});

module.exports = router;
