const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');

// @route   POST api/narratives
// @desc    Create a narrative
// @access  Private (editor, admin)
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'editor' && req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Authorization denied. Not an editor or admin.' });
  }

  try {
    const narrative = await prisma.narrative.create({
      data: {
        title: req.body.title,
        content: req.body.content,
        authorId: req.user.id,
        status: req.body.status || 'draft'
      }
    });
    res.json(narrative);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/narratives
// @desc    Get all narratives
// @access  Private (all authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const narratives = await prisma.narrative.findMany({
      include: {
        author: {
          select: { username: true, role: true }
        }
      }
    });
    res.json(narratives);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/narratives/:id
// @desc    Get narrative by ID
// @access  Private (all authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    const narrative = await prisma.narrative.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          select: { username: true, role: true }
        }
      }
    });

    if (!narrative) {
      return res.status(404).json({ msg: 'Narrative not found' });
    }

    res.json(narrative);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/narratives/:id
// @desc    Update a narrative
// @access  Private (editor, admin, or author)
router.put('/:id', auth, async (req, res) => {
  const { title, content, status } = req.body;

  try {
    let narrative = await prisma.narrative.findUnique({ where: { id: req.params.id } });

    if (!narrative) return res.status(404).json({ msg: 'Narrative not found' });

    // Check user permissions
    if (req.user.role === 'viewer') {
      return res.status(403).json({ msg: 'Authorization denied. Viewers cannot update narratives.' });
    }

    // If not admin, ensure user is the author
    if (req.user.role !== 'admin' && narrative.authorId !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    narrative = await prisma.narrative.update({
      where: { id: req.params.id },
      data: {
        title: title || narrative.title,
        content: content || narrative.content,
        status: status || narrative.status
      }
    });

    res.json(narrative);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/narratives/:id
// @desc    Delete a narrative
// @access  Private (admin, or author)
router.delete('/:id', auth, async (req, res) => {
  try {
    const narrative = await prisma.narrative.findUnique({ where: { id: req.params.id } });

    if (!narrative) {
      return res.status(404).json({ msg: 'Narrative not found' });
    }

    // Check user permissions
    if (req.user.role === 'viewer') {
      return res.status(403).json({ msg: 'Authorization denied. Viewers cannot delete narratives.' });
    }

    // If not admin, ensure user is the author
    if (req.user.role !== 'admin' && narrative.authorId !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized' });
    }

    await prisma.narrative.delete({ where: { id: req.params.id } });

    res.json({ msg: 'Narrative removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;