const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer'); // Import multer
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Set up multer for memory storage (files will be stored in memory as buffers)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB limit
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
    const { newFilename } = req.body;
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
        data: req.file.buffer, // Store the file buffer directly
        companyId: user.companyId,
        uploadedById: req.user.id,
      },
    });

  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ msg: 'File size limit exceeded (max 5MB)' });
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
        createdAt: true,
        uploadedBy: {
          select: { username: true, name: true },
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

module.exports = router;
